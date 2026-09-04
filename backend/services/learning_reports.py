import json
from datetime import date, datetime, timedelta

from backend.database import connect
from backend.services.courses import COURSE_STAGE_TOPIC_COUNTS


def init_learning_report_db() -> None:
    conn = connect()
    conn.execute(
        "CREATE TABLE IF NOT EXISTS oj_mistake_mastery (username TEXT NOT NULL, contest_id TEXT NOT NULL, problem_id TEXT NOT NULL, mastered_at TEXT NOT NULL, PRIMARY KEY(username, contest_id, problem_id))"
    )
    conn.commit()
    conn.close()


def _contest_problem_names(rows) -> dict[tuple[str, str], str]:
    names: dict[tuple[str, str], str] = {}
    for row in rows:
        try:
            for problem in json.loads(row["problems_json"]):
                names[(row["id"], str(problem.get("id") or ""))] = str(problem.get("title") or "编程题")
        except (TypeError, json.JSONDecodeError):
            continue
    return names


def mistake_book(username: str) -> dict:
    conn = connect()
    practice_rows = conn.execute(
        "SELECT id, question, answer, session_id, created_at FROM practice_attempts WHERE username = ? AND is_correct = 0 AND COALESCE(mastered, 0) = 0 ORDER BY created_at DESC LIMIT 100",
        (username,),
    ).fetchall()
    contest_rows = conn.execute(
        "SELECT id, problems_json FROM teacher_contests WHERE id IN (SELECT DISTINCT contest_id FROM contest_submissions WHERE username = ?)",
        (username,),
    ).fetchall()
    problem_names = _contest_problem_names(contest_rows)
    oj_rows = conn.execute(
        "SELECT s.id, s.contest_id, s.problem_id, s.status, s.score, s.passed_tests, s.total_tests, s.created_at "
        "FROM contest_submissions s WHERE s.username = ? AND s.status != 'accepted' "
        "AND NOT EXISTS (SELECT 1 FROM contest_submissions accepted WHERE accepted.username = s.username AND accepted.contest_id = s.contest_id AND accepted.problem_id = s.problem_id AND accepted.status = 'accepted') "
        "AND NOT EXISTS (SELECT 1 FROM oj_mistake_mastery mastered WHERE mastered.username = s.username AND mastered.contest_id = s.contest_id AND mastered.problem_id = s.problem_id) "
        "AND s.created_at = (SELECT MAX(latest.created_at) FROM contest_submissions latest WHERE latest.username = s.username AND latest.contest_id = s.contest_id AND latest.problem_id = s.problem_id) "
        "ORDER BY s.created_at DESC LIMIT 100",
        (username,),
    ).fetchall()
    conn.close()
    items = [
        {"id": f"practice:{row['id']}", "source": "practice", "title": row["question"], "detail": f"上次回答：{row['answer']}", "created_at": row["created_at"], "action_url": "/study", "session_id": row["session_id"]}
        for row in practice_rows
    ]
    status_names = {"wrong_answer": "答案错误", "compile_error": "编译错误", "runtime_error": "运行错误", "time_limit": "运行超时"}
    items.extend(
        {"id": f"oj:{row['contest_id']}:{row['problem_id']}", "source": "oj", "title": problem_names.get((row["contest_id"], row["problem_id"]), "周赛编程题"), "detail": f"{status_names.get(row['status'], '未通过')} · 通过 {row['passed_tests']}/{row['total_tests']} 个测试点 · 得分 {row['score']}", "created_at": row["created_at"], "action_url": f"/oj?problem={row['problem_id']}&contest={row['contest_id']}", "contest_id": row["contest_id"], "problem_id": row["problem_id"]}
        for row in oj_rows
    )
    items.sort(key=lambda item: item["created_at"], reverse=True)
    return {"count": len(items), "items": items, "focus": [item["title"] for item in items[:5]]}


def mark_mistake_mastered(username: str, item_id: str) -> None:
    parts = str(item_id or "").split(":")
    conn = connect()
    if len(parts) == 2 and parts[0] == "practice" and parts[1].isdigit():
        updated = conn.execute("UPDATE practice_attempts SET mastered = 1 WHERE id = ? AND username = ?", (int(parts[1]), username)).rowcount
    elif len(parts) == 3 and parts[0] == "oj" and parts[1] and parts[2]:
        conn.execute(
            "INSERT OR REPLACE INTO oj_mistake_mastery (username, contest_id, problem_id, mastered_at) VALUES (?, ?, ?, ?)",
            (username, parts[1][:40], parts[2][:80], datetime.now().isoformat()),
        )
        updated = 1
    else:
        updated = 0
    conn.commit()
    conn.close()
    if not updated:
        raise ValueError("错题不存在或已经处理")


def parent_report(username: str) -> dict:
    today = date.today()
    start = today - timedelta(days=6)
    start_time = datetime.combine(start, datetime.min.time()).isoformat()
    end_time = datetime.combine(today + timedelta(days=1), datetime.min.time()).isoformat()
    conn = connect()
    daily = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(query_count), 0) FROM daily_stats WHERE username = ? AND date BETWEEN ? AND ? AND query_count > 0",
        (username, start.isoformat(), today.isoformat()),
    ).fetchone()
    practice = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(is_correct), 0) FROM practice_attempts WHERE username = ? AND created_at >= ? AND created_at < ?",
        (username, start_time, end_time),
    ).fetchone()
    notes = conn.execute(
        "SELECT COUNT(*) FROM learning_notes WHERE username = ? AND created_at >= ? AND created_at < ?",
        (username, start_time, end_time),
    ).fetchone()[0]
    submissions = conn.execute(
        "SELECT COUNT(*), COUNT(DISTINCT contest_id || ':' || problem_id), COALESCE(MAX(score), 0) FROM contest_submissions WHERE username = ? AND created_at >= ? AND created_at < ?",
        (username, start_time, end_time),
    ).fetchone()
    accepted = conn.execute(
        "SELECT COUNT(DISTINCT contest_id || ':' || problem_id) FROM contest_submissions WHERE username = ? AND status = 'accepted' AND created_at >= ? AND created_at < ?",
        (username, start_time, end_time),
    ).fetchone()[0]
    conn.close()
    mistakes = mistake_book(username)
    practice_accuracy = round(practice[1] / practice[0] * 100) if practice[0] else 0
    highlights = []
    if daily[0]: highlights.append(f"本周坚持学习 {daily[0]} 天，主动向 AI 导师提问 {daily[1]} 次。")
    if accepted: highlights.append(f"编程练习中独立通过 {accepted} 道题，正在形成调试习惯。")
    if notes: highlights.append(f"整理了 {notes} 篇学习笔记，开始沉淀自己的知识库。")
    if not highlights: highlights.append("本周学习数据还不多，完成一次课程学习和练习后会生成更完整的反馈。")
    suggestions = []
    if mistakes["count"]: suggestions.append(f"优先重练“{mistakes['focus'][0]}”，先说思路再写代码。")
    if practice[0] and practice_accuracy < 70: suggestions.append("练习正确率仍有提升空间，建议每天安排 15 分钟错题复盘。")
    if not daily[0]: suggestions.append("建议本周固定 2-3 个学习时段，形成稳定节奏。")
    if not suggestions: suggestions.append("保持当前节奏，下周尝试一道稍高难度的综合题。")
    return {
        "student": username,
        "period": {"start": start.isoformat(), "end": today.isoformat()},
        "summary": {"study_days": daily[0], "queries": daily[1], "practice_total": practice[0], "practice_accuracy": practice_accuracy, "notes": notes, "contest_submissions": submissions[0], "contest_problems": submissions[1], "contest_accepted": accepted, "open_mistakes": mistakes["count"]},
        "highlights": highlights,
        "focus": mistakes["focus"],
        "suggestions": suggestions,
    }


def mastery_matrix(username: str) -> dict:
    conn = connect()
    progress_rows = conn.execute(
        "SELECT course_id, completed_json FROM course_progress WHERE username = ?",
        (username,),
    ).fetchall()
    practice_rows = conn.execute(
        "SELECT question, is_correct FROM practice_attempts WHERE username = ? ORDER BY created_at DESC LIMIT 200",
        (username,),
    ).fetchall()
    memory_row = conn.execute(
        "SELECT weak_points_json FROM learning_memory WHERE username = ?",
        (username,),
    ).fetchone()
    contests = conn.execute("SELECT id, language, problems_json FROM teacher_contests").fetchall()
    submissions = conn.execute(
        "SELECT contest_id, problem_id, status, score FROM contest_submissions WHERE username = ?",
        (username,),
    ).fetchall()
    due_reviews = conn.execute(
        "SELECT COUNT(*) FROM learning_reviews WHERE username = ? AND completed = 0 AND due_at <= ?",
        (username, datetime.now().isoformat()),
    ).fetchone()[0]
    conn.close()

    progress = {}
    for row in progress_rows:
        try:
            completed = json.loads(row["completed_json"])
        except (TypeError, json.JSONDecodeError):
            completed = []
        progress[row["course_id"]] = len(completed) if isinstance(completed, list) else 0

    practice_total = len(practice_rows)
    practice_correct = sum(int(row["is_correct"] or 0) for row in practice_rows)
    contest_problems: dict[tuple[str, str], dict] = {}
    for contest in contests:
        try:
            for problem in json.loads(contest["problems_json"]):
                contest_problems[(contest["id"], str(problem.get("id") or ""))] = {
                    "language": str(problem.get("language") or contest["language"]),
                    "category": str(problem.get("category") or "综合练习"),
                    "tags": [str(tag) for tag in problem.get("tags", [])][:5],
                }
        except (TypeError, json.JSONDecodeError):
            continue
    oj_by_language: dict[str, dict[str, int]] = {}
    weak_categories: dict[str, list[int]] = {}
    for row in submissions:
        metadata = contest_problems.get((row["contest_id"], row["problem_id"]), {})
        language = metadata.get("language", "python")
        summary = oj_by_language.setdefault(language, {"attempts": 0, "accepted": 0, "score": 0})
        summary["attempts"] += 1
        summary["accepted"] += int(row["status"] == "accepted")
        summary["score"] = max(summary["score"], int(row["score"] or 0))
        category = metadata.get("category", "综合练习")
        category_stats = weak_categories.setdefault(category, [0, 0])
        category_stats[0] += 1
        category_stats[1] += int(row["status"] == "accepted")
    try:
        stored_weak = json.loads(memory_row["weak_points_json"]) if memory_row else []
    except (TypeError, json.JSONDecodeError):
        stored_weak = []
    weak_points = [str(item) for item in stored_weak if str(item).strip()][:6]
    weak_points.extend(
        category for category, (attempts, accepted) in sorted(weak_categories.items(), key=lambda item: (item[1][1] / item[1][0] if item[1][0] else 0, -item[1][0]))
        if attempts and accepted < attempts and category not in weak_points
    )
    matrix = []
    labels = {"scratch": "Scratch", "python": "Python", "cpp": "C++"}
    for course_id, label in labels.items():
        completed = progress.get(course_id, 0)
        total = sum(COURSE_STAGE_TOPIC_COUNTS[course_id])
        oj = oj_by_language.get(course_id, {"attempts": 0, "accepted": 0, "score": 0})
        matrix.append({
            "course_id": course_id,
            "label": label,
            "route_completed": completed,
            "route_total": total,
            "route_rate": round(completed / total * 100) if total else 0,
            "practice_total": practice_total,
            "practice_accuracy": round(practice_correct / practice_total * 100) if practice_total else 0,
            "oj_attempts": oj["attempts"],
            "oj_accepted": oj["accepted"],
            "oj_rate": round(oj["accepted"] / oj["attempts"] * 100) if oj["attempts"] else 0,
        })
    return {
        "student": username,
        "matrix": matrix,
        "weak_points": weak_points[:8],
        "due_reviews": due_reviews,
        "practice": {"total": practice_total, "correct": practice_correct, "accuracy": round(practice_correct / practice_total * 100) if practice_total else 0},
    }
