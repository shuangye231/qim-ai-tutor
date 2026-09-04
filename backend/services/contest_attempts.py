import json
import uuid
from datetime import datetime, timedelta

from backend.database import connect
from backend.services.classes import student_in_class


def init_contest_attempt_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS contest_attempts (
            id TEXT PRIMARY KEY,
            contest_id TEXT NOT NULL,
            username TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'in_progress',
            answers_json TEXT NOT NULL DEFAULT '{}',
            marked_json TEXT NOT NULL DEFAULT '[]',
            started_at TEXT NOT NULL,
            submitted_at TEXT,
            score INTEGER NOT NULL DEFAULT 0,
            total_score INTEGER NOT NULL DEFAULT 0,
            UNIQUE(contest_id, username)
        );
        CREATE INDEX IF NOT EXISTS idx_contest_attempts_contest
            ON contest_attempts(contest_id, status, submitted_at);
        """
    )
    conn.commit()
    conn.close()


def _load_contest(conn, contest_id: str, username: str):
    row = conn.execute("SELECT * FROM teacher_contests WHERE id = ? AND status = 'published'", (contest_id,)).fetchone()
    if not row:
        raise ValueError("周赛不存在或尚未发布")
    scope = row["class_scope"] or "all"
    if scope != "all" and not student_in_class(username, scope):
        raise PermissionError("你不在本场周赛的参赛班级中")
    now = datetime.now()
    if row["start_at"] and now < datetime.fromisoformat(row["start_at"]):
        raise ValueError("周赛尚未开始")
    return row


def _deadline(contest, started_at: str) -> datetime:
    deadline = datetime.fromisoformat(started_at) + timedelta(minutes=int(contest["duration"]))
    if contest["end_at"]:
        deadline = min(deadline, datetime.fromisoformat(contest["end_at"]))
    return deadline


def _serialize(attempt, contest) -> dict:
    result = dict(attempt)
    result["answers"] = json.loads(result.pop("answers_json"))
    result["marked"] = json.loads(result.pop("marked_json"))
    result["expires_at"] = _deadline(contest, result["started_at"]).isoformat()
    conn = connect()
    grade = conn.execute(
        "SELECT score FROM contest_grades WHERE contest_id = ? AND username = ?",
        (result["contest_id"], result["username"]),
    ).fetchone()
    conn.close()
    result["final_score"] = int(grade["score"]) if grade else None
    problems = json.loads(contest["problems_json"])
    result["manual_problem_count"] = sum(
        1 for problem in problems if problem.get("type", "programming") in {"fill_blank", "short_answer", "programming"}
    )
    return result


def _score_attempt(conn, attempt, contest, status: str = "submitted") -> dict:
    problems = json.loads(contest["problems_json"])
    answers = json.loads(attempt["answers_json"])
    score = 0
    for problem in problems:
        kind = problem.get("type", "programming")
        if kind == "single_choice" and str(answers.get(problem["id"], "")) == str(problem.get("correct_answer", "")):
            score += int(problem.get("points") or 0)
        elif kind == "true_false" and str(answers.get(problem["id"], "")).lower() == str(problem.get("correct_answer", "")).lower():
            score += int(problem.get("points") or 0)
        # 简答题和编程题由老师批改，交卷时不计入自动分数。
    total = sum(int(problem.get("points") or 0) for problem in problems)
    submitted_at = datetime.now().isoformat()
    conn.execute(
        "UPDATE contest_attempts SET status = ?, submitted_at = ?, score = ?, total_score = ? WHERE id = ?",
        (status, submitted_at, score, total, attempt["id"]),
    )
    if not any(problem.get("type", "programming") in {"fill_blank", "short_answer", "programming"} for problem in problems):
        conn.execute(
            "INSERT INTO contest_grades (contest_id, username, score, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(contest_id, username) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at",
            (contest["id"], attempt["username"], score, submitted_at),
        )
    conn.commit()
    return conn.execute("SELECT * FROM contest_attempts WHERE id = ?", (attempt["id"],)).fetchone()


def _auto_submit_if_expired(conn, attempt, contest):
    if attempt["status"] == "in_progress" and datetime.now() >= _deadline(contest, attempt["started_at"]):
        return _score_attempt(conn, attempt, contest, "auto_submitted")
    return attempt


def start_attempt(contest_id: str, username: str) -> dict:
    conn = connect()
    try:
        contest = _load_contest(conn, contest_id, username)
        attempt = conn.execute("SELECT * FROM contest_attempts WHERE contest_id = ? AND username = ?", (contest_id, username)).fetchone()
        if not attempt:
            now = datetime.now()
            if contest["end_at"] and now >= datetime.fromisoformat(contest["end_at"]):
                raise ValueError("周赛已经结束")
            conn.execute(
                "INSERT INTO contest_attempts (id, contest_id, username, started_at) VALUES (?, ?, ?, ?)",
                (uuid.uuid4().hex[:16], contest_id, username, now.isoformat()),
            )
            conn.commit()
            attempt = conn.execute("SELECT * FROM contest_attempts WHERE contest_id = ? AND username = ?", (contest_id, username)).fetchone()
        attempt = _auto_submit_if_expired(conn, attempt, contest)
        return _serialize(attempt, contest)
    finally:
        conn.close()


def get_attempt(contest_id: str, username: str) -> dict | None:
    conn = connect()
    try:
        contest = _load_contest(conn, contest_id, username)
        attempt = conn.execute("SELECT * FROM contest_attempts WHERE contest_id = ? AND username = ?", (contest_id, username)).fetchone()
        if not attempt:
            return None
        return _serialize(_auto_submit_if_expired(conn, attempt, contest), contest)
    finally:
        conn.close()


def save_attempt(contest_id: str, username: str, answers: dict, marked: list) -> dict:
    conn = connect()
    try:
        contest = _load_contest(conn, contest_id, username)
        attempt = conn.execute("SELECT * FROM contest_attempts WHERE contest_id = ? AND username = ?", (contest_id, username)).fetchone()
        if not attempt:
            raise ValueError("请先进入考试")
        attempt = _auto_submit_if_expired(conn, attempt, contest)
        if attempt["status"] != "in_progress":
            return _serialize(attempt, contest)
        problems = json.loads(contest["problems_json"])
        objective = {problem["id"]: problem for problem in problems if problem.get("type") in {"single_choice", "true_false", "fill_blank", "short_answer"}}
        clean_answers = {key: str(value)[:20] for key, value in answers.items() if key in objective}
        problem_ids = {problem["id"] for problem in problems}
        clean_marked = [str(item) for item in marked if str(item) in problem_ids][:50]
        conn.execute("UPDATE contest_attempts SET answers_json = ?, marked_json = ? WHERE id = ?", (json.dumps(clean_answers, ensure_ascii=False), json.dumps(clean_marked), attempt["id"]))
        conn.commit()
        updated = conn.execute("SELECT * FROM contest_attempts WHERE id = ?", (attempt["id"],)).fetchone()
        return _serialize(updated, contest)
    finally:
        conn.close()


def submit_attempt(contest_id: str, username: str) -> dict:
    conn = connect()
    try:
        contest = _load_contest(conn, contest_id, username)
        attempt = conn.execute("SELECT * FROM contest_attempts WHERE contest_id = ? AND username = ?", (contest_id, username)).fetchone()
        if not attempt:
            raise ValueError("请先进入考试")
        if attempt["status"] == "in_progress":
            attempt = _score_attempt(conn, attempt, contest)
        return _serialize(attempt, contest)
    finally:
        conn.close()
