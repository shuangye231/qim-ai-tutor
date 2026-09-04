import json
import uuid
from datetime import datetime

from backend.database import connect
from backend.services.classes import student_in_class, teacher_owns_class


def init_contest_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS teacher_contests (
            id TEXT PRIMARY KEY,
            teacher TEXT NOT NULL,
            title TEXT NOT NULL,
            language TEXT NOT NULL,
            duration INTEGER NOT NULL DEFAULT 60,
            status TEXT NOT NULL DEFAULT 'draft',
            source_name TEXT NOT NULL,
            problems_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            published_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_teacher_contests_status
            ON teacher_contests(status, created_at DESC);
        """
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(teacher_contests)").fetchall()}
    migrations = {
        "start_at": "TEXT",
        "end_at": "TEXT",
        "ai_policy": "TEXT NOT NULL DEFAULT 'hints'",
        "ranking_visible": "INTEGER NOT NULL DEFAULT 1",
        "class_scope": "TEXT NOT NULL DEFAULT 'all'",
    }
    for name, definition in migrations.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE teacher_contests ADD COLUMN {name} {definition}")
    conn.commit()
    conn.close()


def _serialize(row) -> dict:
    result = dict(row)
    result["problems"] = json.loads(result.pop("problems_json"))
    result["problem_count"] = len(result["problems"])
    result["points"] = sum(int(problem.get("points", 0)) for problem in result["problems"])
    result["ranking_visible"] = bool(result.get("ranking_visible", 1))
    return result


def public_contest(contest: dict) -> dict:
    result = dict(contest)
    result["problems"] = [{key: value for key, value in problem.items() if key not in {"test_cases", "correct_answer"}} for problem in contest["problems"]]
    return result


def create_contest(
    teacher: str,
    title: str,
    language: str,
    duration: int,
    source_name: str,
    problems: list[dict],
    start_at: str = "",
    end_at: str = "",
    ai_policy: str = "hints",
    ranking_visible: bool = True,
    class_scope: str = "all",
) -> dict:
    contest_id = uuid.uuid4().hex[:12]
    now = datetime.now().isoformat()
    conn = connect()
    conn.execute(
        "INSERT INTO teacher_contests (id, teacher, title, language, duration, source_name, problems_json, created_at, start_at, end_at, ai_policy, ranking_visible, class_scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (contest_id, teacher, title[:120], language, duration, source_name[:160], json.dumps(problems, ensure_ascii=False), now, start_at or None, end_at or None, ai_policy, int(ranking_visible), class_scope or "all"),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM teacher_contests WHERE id = ?", (contest_id,)).fetchone()
    conn.close()
    return _serialize(row)


def update_contest(contest_id: str, teacher: str, data: dict) -> dict | None:
    conn = connect()
    row = conn.execute("SELECT * FROM teacher_contests WHERE id = ? AND teacher = ? AND status = 'draft'", (contest_id, teacher)).fetchone()
    if not row:
        conn.close()
        return None
    current = _serialize(row)
    problems = data.get("problems", current["problems"])
    if not isinstance(problems, list) or not 1 <= len(problems) <= 50:
        conn.close()
        raise ValueError("周赛必须包含 1 到 50 道题")
    cleaned = []
    for index, problem in enumerate(problems, start=1):
        title = str(problem.get("title") or "").strip()
        if not title:
            conn.close()
            raise ValueError(f"第 {index} 题缺少题目名称")
        item = dict(problem)
        item_type = str(item.get("type") or "programming")
        if item_type not in {"single_choice", "true_false", "fill_blank", "short_answer", "programming"}:
            item_type = "programming"
        item["type"] = item_type
        item["title"] = title[:120]
        item["description"] = str(item.get("description") or "")[:20_000]
        item["input"] = str(item.get("input") or "")[:5_000]
        item["output"] = str(item.get("output") or "")[:5_000]
        item["points"] = min(100, max(1, int(item.get("points") or 20)))
        if item_type == "single_choice":
            raw_options = item.get("options") or []
            item["options"] = [
                {"key": str(option.get("key") or "").strip()[:2], "text": str(option.get("text") or "").strip()[:500]}
                for option in raw_options[:8] if isinstance(option, dict) and str(option.get("text") or "").strip()
            ]
            if len(item["options"]) < 2:
                conn.close()
                raise ValueError(f"第 {index} 题至少需要 2 个选项")
            item["correct_answer"] = str(item.get("correct_answer") or "").strip()[:2]
            if not item["correct_answer"]:
                conn.close()
                raise ValueError(f"第 {index} 题必须设置正确答案")
            if item["correct_answer"] not in {option["key"] for option in item["options"]}:
                conn.close()
                raise ValueError(f"第 {index} 题的正确答案不在选项中")
        elif item_type == "true_false":
            item["options"] = []
            answer = item.get("correct_answer")
            if answer is None or (isinstance(answer, str) and not answer.strip()):
                conn.close()
                raise ValueError(f"第 {index} 题必须设置正确或错误答案")
            item["correct_answer"] = answer if isinstance(answer, bool) else str(answer).lower() in {"true", "1", "正确", "对", "是"}
        elif item_type in {"fill_blank", "short_answer"}:
            item["options"] = []
            item["correct_answer"] = str(item.get("correct_answer") or "").strip()[:200]
        else:
            item["options"] = []
        raw_tests = item.get("test_cases") or item.get("examples") or []
        item["test_cases"] = [
            {"input": str(test.get("input") or "")[:8_000], "output": str(test.get("output") or "")[:8_000]}
            for test in raw_tests[:20] if isinstance(test, dict)
        ]
        if item_type == "programming" and not item["test_cases"]:
            conn.close()
            raise ValueError(f"第 {index} 题至少需要 1 个判题测试点")
        cleaned.append(item)
    title = str(data.get("title") or current["title"]).strip()[:120]
    duration = min(300, max(15, int(data.get("duration") or current["duration"])))
    ai_policy = str(data.get("ai_policy") or current.get("ai_policy") or "hints")
    if ai_policy not in {"disabled", "hints", "normal"}:
        ai_policy = "hints"
    start_at = str(data.get("start_at") or "").strip() or None
    end_at = str(data.get("end_at") or "").strip() or None
    if start_at and end_at and start_at >= end_at:
        conn.close()
        raise ValueError("比赛截止时间必须晚于开始时间")
    class_scope = str(data.get("class_scope") or current.get("class_scope") or "all").strip()[:40] or "all"
    if not teacher_owns_class(teacher, class_scope):
        conn.close()
        raise ValueError("只能选择自己创建的班级")
    conn.execute(
        "UPDATE teacher_contests SET title = ?, duration = ?, start_at = ?, end_at = ?, ai_policy = ?, ranking_visible = ?, class_scope = ?, problems_json = ? WHERE id = ? AND teacher = ? AND status = 'draft'",
        (title, duration, start_at, end_at, ai_policy, int(bool(data.get("ranking_visible", current.get("ranking_visible", True)))), class_scope, json.dumps(cleaned, ensure_ascii=False), contest_id, teacher),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM teacher_contests WHERE id = ?", (contest_id,)).fetchone()
    conn.close()
    return _serialize(updated)


def list_contests(status: str | None = None, teacher: str | None = None, username: str | None = None) -> list[dict]:
    clauses, params = [], []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if teacher:
        clauses.append("teacher = ?")
        params.append(teacher)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    conn = connect()
    if status == "published":
        clauses.append("source_name != ?")
        params.append("系统演示数据")
        where = f" WHERE {' AND '.join(clauses)}"
    rows = conn.execute(f"SELECT * FROM teacher_contests{where} ORDER BY created_at DESC", params).fetchall()
    conn.close()
    return [_serialize(row) for row in rows if row["class_scope"] in (None, "", "all") or (username and student_in_class(username, row["class_scope"]))]


def publish_contest(contest_id: str, teacher: str) -> dict | None:
    conn = connect()
    current = conn.execute("SELECT * FROM teacher_contests WHERE id = ? AND teacher = ? AND status = 'draft'", (contest_id, teacher)).fetchone()
    if not current:
        conn.close()
        return None
    problems = json.loads(current["problems_json"])
    for index, problem in enumerate(problems, start=1):
        kind = problem.get("type", "programming")
        if kind == "single_choice" and not str(problem.get("correct_answer") or "").strip():
            conn.close()
            raise ValueError(f"第 {index} 题必须设置选择题正确答案")
        if kind == "true_false" and (problem.get("correct_answer") is None or (isinstance(problem.get("correct_answer"), str) and not problem.get("correct_answer").strip())):
            conn.close()
            raise ValueError(f"第 {index} 题必须设置判断题答案")
    if any(problem.get("type", "programming") == "programming" and not (problem.get("test_cases") or problem.get("examples")) for problem in problems):
        conn.close()
        raise ValueError("每道题至少需要 1 个判题测试点")
    now = datetime.now().isoformat()
    conn.execute("UPDATE teacher_contests SET status = 'published', published_at = ? WHERE id = ? AND teacher = ?", (now, contest_id, teacher))
    conn.commit()
    row = conn.execute("SELECT * FROM teacher_contests WHERE id = ? AND teacher = ?", (contest_id, teacher)).fetchone()
    conn.close()
    return _serialize(row) if row else None


def delete_contest(contest_id: str, teacher: str) -> dict | None:
    conn = connect()
    row = conn.execute(
        "SELECT id, title, status FROM teacher_contests WHERE id = ? AND teacher = ?",
        (contest_id, teacher),
    ).fetchone()
    if not row:
        conn.close()
        return None
    tables = {
        item[0]
        for item in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('contest_attempts', 'contest_submissions')"
        ).fetchall()
    }
    with conn:
        if "contest_submissions" in tables:
            conn.execute("DELETE FROM contest_submissions WHERE contest_id = ?", (contest_id,))
        if "contest_attempts" in tables:
            conn.execute("DELETE FROM contest_attempts WHERE contest_id = ?", (contest_id,))
        conn.execute(
            "DELETE FROM teacher_contests WHERE id = ? AND teacher = ?",
            (contest_id, teacher),
        )
    result = dict(row)
    conn.close()
    return result


def get_public_problem(contest_id: str, problem_id: str, username: str = "") -> dict | None:
    conn = connect()
    row = conn.execute("SELECT * FROM teacher_contests WHERE id = ? AND status = 'published'", (contest_id,)).fetchone()
    conn.close()
    if not row or (row["class_scope"] not in (None, "", "all") and (not username or not student_in_class(username, row["class_scope"]))):
        return None
    contest = _serialize(row)
    problem = next(({key: value for key, value in item.items() if key not in {"test_cases", "correct_answer"}} for item in contest["problems"] if item.get("id") == problem_id), None)
    return {"contest": {key: contest[key] for key in ("id", "title", "teacher", "language", "duration")}, "problem": problem} if problem else None
