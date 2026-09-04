import json
import time
import uuid
from datetime import datetime, timedelta

from backend.database import connect
from backend.services.classes import list_teacher_student_usernames, student_in_class
from backend.services.compiler import run_cpp, run_python


STATUSES = {"accepted", "wrong_answer", "compile_error", "runtime_error", "time_limit"}


def init_judge_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS contest_submissions (
            id TEXT PRIMARY KEY,
            contest_id TEXT NOT NULL,
            problem_id TEXT NOT NULL,
            username TEXT NOT NULL,
            language TEXT NOT NULL,
            source TEXT NOT NULL,
            status TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            passed_tests INTEGER NOT NULL DEFAULT 0,
            total_tests INTEGER NOT NULL DEFAULT 0,
            error_message TEXT NOT NULL DEFAULT '',
            duration_ms INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_contest_submissions_user
            ON contest_submissions(username, contest_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_contest_submissions_problem
            ON contest_submissions(contest_id, problem_id, status);
        CREATE TABLE IF NOT EXISTS oj_progress (
            username TEXT NOT NULL,
            problem_id TEXT NOT NULL,
            points INTEGER NOT NULL DEFAULT 0,
            solved_at TEXT NOT NULL,
            PRIMARY KEY(username, problem_id)
        );
        CREATE INDEX IF NOT EXISTS idx_oj_progress_user
            ON oj_progress(username, solved_at DESC);
        CREATE TABLE IF NOT EXISTS contest_grades (
            contest_id TEXT NOT NULL,
            username TEXT NOT NULL,
            score INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(contest_id, username)
        );
        CREATE INDEX IF NOT EXISTS idx_contest_grades_contest
            ON contest_grades(contest_id, score DESC);
        CREATE TABLE IF NOT EXISTS contest_problem_grades (
            contest_id TEXT NOT NULL,
            username TEXT NOT NULL,
            problem_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            feedback TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            PRIMARY KEY(contest_id, username, problem_id)
        );
        """
    )
    conn.commit()
    conn.close()


def _normalize_output(value: str) -> str:
    return str(value or "").replace("\r\n", "\n").rstrip()


def _load_problem(contest_id: str, problem_id: str, username: str) -> tuple[dict, dict]:
    conn = connect()
    row = conn.execute("SELECT * FROM teacher_contests WHERE id = ? AND status = 'published'", (contest_id,)).fetchone()
    conn.close()
    if not row:
        raise ValueError("周赛不存在或尚未发布")
    scope = row["class_scope"] or "all"
    if scope != "all" and not student_in_class(username, scope):
        raise PermissionError("你不在本场周赛的参赛班级中")
    now = datetime.now()
    if row["start_at"] and now < datetime.fromisoformat(row["start_at"]):
        raise ValueError("周赛尚未开始")
    if row["end_at"] and now > datetime.fromisoformat(row["end_at"]):
        raise ValueError("周赛已经结束")
    problems = json.loads(row["problems_json"])
    problem = next((item for item in problems if item.get("id") == problem_id), None)
    if not problem:
        raise ValueError("赛题不存在")
    return dict(row), problem


def _store_submission(contest_id: str, problem_id: str, username: str, language: str, source: str, result: dict) -> dict:
    submission_id = uuid.uuid4().hex[:16]
    created_at = datetime.now().isoformat()
    conn = connect()
    conn.execute(
        "INSERT INTO contest_submissions (id, contest_id, problem_id, username, language, source, status, score, passed_tests, total_tests, error_message, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (submission_id, contest_id, problem_id, username, language, source, result["status"], result["score"], result["passed_tests"], result["total_tests"], result.get("error_message", "")[:4000], result["duration_ms"], created_at),
    )
    conn.commit()
    conn.close()
    return {"id": submission_id, "contest_id": contest_id, "problem_id": problem_id, "status": result["status"], "score": result["score"], "passed_tests": result["passed_tests"], "total_tests": result["total_tests"], "error_message": result.get("error_message", ""), "duration_ms": result["duration_ms"], "created_at": created_at}


def judge_submission(contest_id: str, problem_id: str, username: str, source: str, runners: dict | None = None) -> dict:
    contest, problem = _load_problem(contest_id, problem_id, username)
    source = str(source or "")
    if not source.strip():
        raise ValueError("请先输入代码后再提交")
    language = str(problem.get("language") or contest["language"])
    conn = connect()
    latest = conn.execute(
        "SELECT created_at FROM contest_submissions WHERE username = ? AND contest_id = ? ORDER BY created_at DESC LIMIT 1",
        (username, contest_id),
    ).fetchone()
    conn.close()
    if latest and datetime.fromisoformat(latest["created_at"]) > datetime.now() - timedelta(seconds=2):
        raise ValueError("提交过于频繁，请稍后再试")
    if language == "scratch":
        return _store_submission(
            contest_id,
            problem_id,
            username,
            language,
            source,
            {
                "status": "submitted",
                "score": 0,
                "passed_tests": 0,
                "total_tests": 0,
                "error_message": "",
                "duration_ms": 0,
            },
        )
    if language not in {"python", "cpp"}:
        raise ValueError("当前后端判题只支持 Python 和 C++")
    # 周赛/月赛只负责收集作品，正确性和最终积分由老师人工评定。
    if contest:
        return _store_submission(
            contest_id,
            problem_id,
            username,
            language,
            source,
            {
                "status": "submitted",
                "score": 0,
                "passed_tests": 0,
                "total_tests": 0,
                "error_message": "",
                "duration_ms": 0,
            },
        )

    tests = problem.get("test_cases") or problem.get("examples") or []
    tests = [item for item in tests if isinstance(item, dict)][:20]
    if not tests:
        raise ValueError("老师尚未配置判题测试点")
    runner = (runners or {}).get(language) or (run_python if language == "python" else run_cpp)
    started = time.monotonic()
    passed = 0
    status = "accepted"
    error_message = ""
    for test in tests:
        run = runner(source, str(test.get("input") or ""))
        if run.get("timed_out"):
            status, error_message = "time_limit", "程序运行超时"
            break
        if run.get("stderr") or int(run.get("exit_code") or 0) != 0:
            status = "compile_error" if language == "cpp" and passed == 0 else "runtime_error"
            error_message = str(run.get("stderr") or "程序运行失败")[:4000]
            break
        if _normalize_output(run.get("stdout", "")) != _normalize_output(test.get("output", "")):
            status = "wrong_answer"
            break
        passed += 1
    points = min(100, max(1, int(problem.get("points") or 20)))
    result = {
        "status": status,
        "score": points if status == "accepted" else int(points * passed / len(tests)),
        "passed_tests": passed,
        "total_tests": len(tests),
        "error_message": error_message,
        "duration_ms": int((time.monotonic() - started) * 1000),
    }
    return _store_submission(contest_id, problem_id, username, language, source, result)


def contest_progress(username: str, contest_id: str) -> dict:
    conn = connect()
    rows = conn.execute(
        "SELECT problem_id, MAX(score) AS score, MAX(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted, COUNT(*) AS attempts "
        "FROM contest_submissions WHERE username = ? AND contest_id = ? GROUP BY problem_id",
        (username, contest_id),
    ).fetchall()
    conn.close()
    return {
        "contest_id": contest_id,
        "solved_problem_ids": [row["problem_id"] for row in rows if row["accepted"]],
        "submitted_problem_ids": [row["problem_id"] for row in rows],
        "score": sum(row["score"] for row in rows),
        "attempts": sum(row["attempts"] for row in rows),
        "problems": [dict(row) for row in rows],
    }


def record_oj_completion(username: str, problem_id: str, points: int) -> dict:
    safe_points = min(100, max(0, int(points or 0)))
    if not problem_id:
        raise ValueError("题目编号不能为空")
    conn = connect()
    conn.execute(
        "INSERT INTO oj_progress (username, problem_id, points, solved_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(username, problem_id) DO UPDATE SET points = MAX(oj_progress.points, excluded.points), solved_at = excluded.solved_at",
        (username, problem_id[:100], safe_points, datetime.now().isoformat()),
    )
    conn.commit()
    row = conn.execute(
        "SELECT username, problem_id, points, solved_at FROM oj_progress WHERE username = ? AND problem_id = ?",
        (username, problem_id[:100]),
    ).fetchone()
    conn.close()
    return dict(row)


def oj_leaderboard() -> list[dict]:
    conn = connect()
    rows = conn.execute(
        "SELECT u.username, COUNT(p.problem_id) AS solved_count, COALESCE(SUM(p.points), 0) AS points "
        "FROM users u LEFT JOIN oj_progress p ON p.username = u.username "
        "WHERE COALESCE(u.role, 'user') = 'user' GROUP BY u.username "
        "ORDER BY points DESC, solved_count DESC, u.username"
    ).fetchall()
    conn.close()
    return [
        {"rank": index, "username": row["username"], "solved_count": row["solved_count"], "points": row["points"]}
        for index, row in enumerate(rows, start=1)
    ]


def set_contest_grade(teacher: str, contest_id: str, username: str, score: int) -> dict:
    safe_score = min(100, max(0, int(score)))
    conn = connect()
    contest = conn.execute(
        "SELECT class_scope FROM teacher_contests WHERE id = ? AND teacher = ?",
        (contest_id, teacher),
    ).fetchone()
    conn.close()
    if not contest:
        raise ValueError("周赛不存在或无权评分")
    scope = contest["class_scope"] or "all"
    if scope != "all" and not student_in_class(username, scope):
        raise ValueError("该学生不在本场周赛的参赛班级中")
    now = datetime.now().isoformat()
    conn = connect()
    conn.execute(
        "INSERT INTO contest_grades (contest_id, username, score, updated_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(contest_id, username) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at",
        (contest_id, username[:40], safe_score, now),
    )
    conn.commit()
    conn.close()
    return {"contest_id": contest_id, "username": username[:40], "final_score": safe_score, "updated_at": now}


def set_contest_problem_grade(teacher: str, contest_id: str, username: str, problem_id: str, score: int, feedback: str = "") -> dict:
    conn = connect()
    contest = conn.execute(
        "SELECT * FROM teacher_contests WHERE id = ? AND teacher = ?",
        (contest_id, teacher),
    ).fetchone()
    if not contest:
        conn.close()
        raise ValueError("比赛不存在或无权批改")
    problems = json.loads(contest["problems_json"])
    problem = next((item for item in problems if item.get("id") == problem_id), None)
    if not problem or problem.get("type", "programming") not in {"fill_blank", "short_answer", "programming"}:
        conn.close()
        raise ValueError("只有简答题和编程题需要老师批改")
    maximum = max(0, int(problem.get("points") or 0))
    safe_score = int(score)
    if safe_score < 0 or safe_score > maximum:
        conn.close()
        raise ValueError(f"本题评分必须在 0 到 {maximum} 分之间")
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO contest_problem_grades (contest_id, username, problem_id, score, feedback, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(contest_id, username, problem_id) DO UPDATE SET score = excluded.score, feedback = excluded.feedback, updated_at = excluded.updated_at",
        (contest_id, username[:40], problem_id, safe_score, str(feedback or "").strip()[:1000], now),
    )
    manual_ids = [item["id"] for item in problems if item.get("type", "programming") in {"fill_blank", "short_answer", "programming"}]
    manual_rows = conn.execute(
        "SELECT problem_id, score FROM contest_problem_grades WHERE contest_id = ? AND username = ?",
        (contest_id, username),
    ).fetchall()
    manual_scores = {row["problem_id"]: int(row["score"]) for row in manual_rows}
    final_score = None
    if all(item in manual_scores for item in manual_ids):
        attempt = conn.execute(
            "SELECT score FROM contest_attempts WHERE contest_id = ? AND username = ? AND status != 'in_progress'",
            (contest_id, username),
        ).fetchone()
        if attempt:
            final_score = int(attempt["score"] or 0) + sum(manual_scores[item] for item in manual_ids)
            conn.execute(
                "INSERT INTO contest_grades (contest_id, username, score, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(contest_id, username) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at",
                (contest_id, username[:40], final_score, now),
            )
    else:
        conn.execute("DELETE FROM contest_grades WHERE contest_id = ? AND username = ?", (contest_id, username))
    conn.commit()
    conn.close()
    return {"contest_id": contest_id, "username": username[:40], "problem_id": problem_id, "score": safe_score, "final_score": final_score, "updated_at": now}


def contest_leaderboard(contest_id: str, username: str, role: str) -> dict:
    conn = connect()
    contest = conn.execute("SELECT * FROM teacher_contests WHERE id = ? AND status = 'published'", (contest_id,)).fetchone()
    if not contest:
        conn.close()
        raise ValueError("周赛不存在或尚未发布")
    scope = contest["class_scope"] or "all"
    if role == "teacher":
        if contest["teacher"] != username:
            conn.close()
            raise PermissionError("无权查看该周赛排行榜")
        usernames = list_teacher_student_usernames(username, scope)
    else:
        if scope != "all" and not student_in_class(username, scope):
            conn.close()
            raise PermissionError("你不在本场周赛的参赛班级中")
        # "all" means all students managed by the contest teacher, not every
        # account on the platform. A contest leaderboard must stay class-scoped.
        usernames = list_teacher_student_usernames(contest["teacher"], scope)
    submission_rows = conn.execute(
        "SELECT username, COUNT(DISTINCT problem_id) AS solved_count "
        "FROM contest_submissions WHERE contest_id = ? GROUP BY username",
        (contest_id,),
    ).fetchall()
    grade_rows = conn.execute("SELECT username, score FROM contest_grades WHERE contest_id = ?", (contest_id,)).fetchall()
    attempt_rows = conn.execute("SELECT username, score FROM contest_attempts WHERE contest_id = ? AND status != 'in_progress'", (contest_id,)).fetchall()
    auto_scores = {row["username"]: int(row["score"] or 0) for row in attempt_rows}
    solved_counts = {row["username"]: int(row["solved_count"] or 0) for row in submission_rows}
    final_scores = {row["username"]: int(row["score"]) for row in grade_rows}
    conn.close()
    students = [{"username": item, "solved_count": solved_counts.get(item, 0), "auto_score": auto_scores.get(item, 0), "final_score": final_scores.get(item)} for item in usernames]
    students.sort(key=lambda item: (item["final_score"] is None, -(item["final_score"] if item["final_score"] is not None else item["auto_score"]), -item["solved_count"], item["username"]))
    for index, student in enumerate(students, start=1):
        student["rank"] = index
    return {"contest_id": contest_id, "title": contest["title"], "class_scope": scope, "students": students}


def contest_analytics(teacher: str, contest_id: str) -> dict:
    conn = connect()
    contest = conn.execute(
        "SELECT * FROM teacher_contests WHERE id = ? AND teacher = ?",
        (contest_id, teacher),
    ).fetchone()
    if not contest:
        conn.close()
        raise ValueError("周赛不存在或无权查看")
    problems = json.loads(contest["problems_json"])
    usernames = list_teacher_student_usernames(teacher, contest["class_scope"] or "all")
    rows = conn.execute(
        "SELECT username, problem_id, MAX(score) AS score, MAX(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted, "
        "COUNT(*) AS attempts, MAX(created_at) AS last_submitted_at FROM contest_submissions WHERE contest_id = ? GROUP BY username, problem_id",
        (contest_id,),
    ).fetchall()
    grade_rows = conn.execute("SELECT username, score FROM contest_grades WHERE contest_id = ?", (contest_id,)).fetchall()
    attempt_rows = conn.execute("SELECT username, answers_json, score, status, submitted_at FROM contest_attempts WHERE contest_id = ?", (contest_id,)).fetchall()
    problem_grade_rows = conn.execute("SELECT username, problem_id, score, feedback FROM contest_problem_grades WHERE contest_id = ?", (contest_id,)).fetchall()
    submission_detail_rows = conn.execute("SELECT username, problem_id, status, source FROM contest_submissions WHERE contest_id = ? ORDER BY created_at DESC", (contest_id,)).fetchall()
    final_scores = {row["username"]: int(row["score"]) for row in grade_rows}
    attempts_by_student = {row["username"]: row for row in attempt_rows}
    answers_by_student = {row["username"]: json.loads(row["answers_json"] or "{}") for row in attempt_rows}
    grades_by_problem = {(row["username"], row["problem_id"]): {"score": int(row["score"]), "feedback": row["feedback"] or ""} for row in problem_grade_rows}
    submissions_by_problem: dict[tuple[str, str], dict] = {}
    for row in submission_detail_rows:
        submissions_by_problem.setdefault((row["username"], row["problem_id"]), {"status": row["status"], "source": row["source"]})
    conn.close()
    by_student: dict[str, dict] = {username: {"username": username, "score": 0, "solved_count": 0, "submitted_count": 0, "last_submitted_at": None} for username in usernames}
    by_problem = {problem.get("id"): {"problem_id": problem.get("id"), "title": problem.get("title", ""), "points": int(problem.get("points") or 0), "submitted": 0, "solved": 0} for problem in problems}
    for row in rows:
        if row["username"] not in by_student:
            continue
        student = by_student[row["username"]]
        student["score"] += int(row["score"] or 0)
        student["submitted_count"] += 1
        student["solved_count"] += int(row["accepted"] or 0)
        if not student["last_submitted_at"] or row["last_submitted_at"] > student["last_submitted_at"]:
            student["last_submitted_at"] = row["last_submitted_at"]
        problem = by_problem.get(row["problem_id"])
        if problem:
            problem["submitted"] += 1
            problem["solved"] += int(row["accepted"] or 0)
    total_problems = len(problems)
    for student in by_student.values():
        attempt = attempts_by_student.get(student["username"])
        answered_count = len([value for value in answers_by_student.get(student["username"], {}).values() if str(value).strip()]) + student["submitted_count"]
        student["completion_rate"] = round(min(answered_count, total_problems) / total_problems * 100) if total_problems else 0
        student["auto_score"] = int(attempt["score"] or 0) if attempt and attempt["status"] != "in_progress" else 0
        student["score"] = student["auto_score"]
        student["submitted"] = bool(attempt and attempt["status"] != "in_progress")
        student["last_submitted_at"] = attempt["submitted_at"] if attempt and attempt["submitted_at"] else student["last_submitted_at"]
        student["final_score"] = final_scores.get(student["username"])
    for student in by_student.values():
        items = []
        for problem in problems:
            if problem.get("type", "programming") not in {"fill_blank", "short_answer", "programming"}:
                continue
            detail = {"problem_id": problem.get("id"), "title": problem.get("title", ""), "type": problem.get("type", "programming"), "points": int(problem.get("points") or 0), "answer": answers_by_student.get(student["username"], {}).get(problem.get("id"), "")}
            detail.update(submissions_by_problem.get((student["username"], problem.get("id")), {}))
            detail.update(grades_by_problem.get((student["username"], problem.get("id")), {}))
            items.append(detail)
        student["manual_items"] = items
    students = sorted(by_student.values(), key=lambda item: (item["final_score"] is None, -(item["final_score"] if item["final_score"] is not None else item["score"]), -item["solved_count"], item["username"]))
    for index, student in enumerate(students, start=1):
        student["rank"] = index
    submitted_students = sum(1 for student in students if student["submitted"])
    scores = [student["final_score"] for student in students if student["final_score"] is not None]
    return {
        "contest": {"id": contest["id"], "title": contest["title"], "class_scope": contest["class_scope"] or "all", "problem_count": total_problems, "points": sum(int(problem.get("points") or 0) for problem in problems)},
        "summary": {"participant_count": len(students), "submitted_count": submitted_students, "unsubmitted_count": len(students) - submitted_students, "completion_rate": round(sum(student["completion_rate"] for student in students) / len(students)) if students else 0, "average_score": round(sum(scores) / len(scores), 1) if scores else 0, "graded_count": len(scores)},
        "problems": [{**problem, "correct_rate": round(problem["solved"] / problem["submitted"] * 100) if problem["submitted"] else 0} for problem in by_problem.values()],
        "students": students,
    }
