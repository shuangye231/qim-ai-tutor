import json
import uuid
from datetime import datetime

from backend.database import connect
from backend.services.classes import create_class_message, student_in_class, teacher_owns_class


QUESTION_TYPES = {"choice", "judgment", "text", "code"}
CODE_LANGUAGES = {"python", "cpp", "javascript", "scratch"}
ASSIGNMENT_COURSES = {"python", "cpp", "scratch"}


def init_assignment_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS assignments (
            id TEXT PRIMARY KEY,
            class_id TEXT NOT NULL,
            teacher TEXT NOT NULL,
            title TEXT NOT NULL,
            instructions TEXT NOT NULL DEFAULT '',
            due_at TEXT,
            questions_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'published',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_assignments_class_time
            ON assignments(class_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS assignment_submissions (
            assignment_id TEXT NOT NULL,
            username TEXT NOT NULL,
            answers_json TEXT NOT NULL DEFAULT '{}',
            score INTEGER,
            total INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            submitted_at TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(assignment_id, username),
            FOREIGN KEY(assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user
            ON assignment_submissions(username, updated_at DESC);
        """
    )
    assignment_columns = {row["name"] for row in conn.execute("PRAGMA table_info(assignments)").fetchall()}
    if "course_id" not in assignment_columns:
        conn.execute("ALTER TABLE assignments ADD COLUMN course_id TEXT NOT NULL DEFAULT 'python'")
    submission_columns = {row["name"] for row in conn.execute("PRAGMA table_info(assignment_submissions)").fetchall()}
    if "feedback" not in submission_columns:
        conn.execute("ALTER TABLE assignment_submissions ADD COLUMN feedback TEXT NOT NULL DEFAULT ''")
    conn.commit()
    conn.close()


def _questions(value) -> list[dict]:
    if not isinstance(value, list):
        raise ValueError("至少添加一道题目")
    result = []
    for item in value[:30]:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or "text")
        if kind not in QUESTION_TYPES:
            kind = "text"
        title = " ".join(str(item.get("title") or "").split())[:120]
        prompt = str(item.get("prompt") or "").strip()[:2000]
        if not title or not prompt:
            continue
        options = [" ".join(str(option).split())[:160] for option in (item.get("options") or []) if str(option).strip()][:6]
        answer = str(item.get("answer") or "").strip()[:160]
        if kind == "choice" and options:
            try:
                answer = str(max(0, min(int(answer), len(options) - 1)))
            except ValueError:
                answer = "0"
        if kind == "judgment":
            answer = "true" if answer.lower() in {"true", "1", "yes", "正确"} else "false"
        normalized = {
            "id": str(item.get("id") or uuid.uuid4().hex[:10]),
            "type": kind,
            "title": title,
            "prompt": prompt,
            "options": options,
            "answer": answer,
        }
        if kind == "code":
            language = str(item.get("language") or "python").strip().lower()
            normalized["language"] = language if language in CODE_LANGUAGES else "python"
            normalized["starter_code"] = str(item.get("starter_code") or "").strip()[:4000]
        result.append(normalized)
    if not result:
        raise ValueError("至少添加一道完整题目")
    return result


def _serialize(row, submission=None) -> dict:
    questions = json.loads(row["questions_json"] or "[]")
    for question in questions:
        question.pop("answer", None)
    payload = {
        "id": row["id"],
        "class_id": row["class_id"],
        "class_name": row["class_name"] if "class_name" in row.keys() else "",
        "teacher": row["teacher"],
        "title": row["title"],
        "instructions": row["instructions"],
        "course_id": row["course_id"] if "course_id" in row.keys() else "python",
        "due_at": row["due_at"],
        "status": row["status"],
        "created_at": row["created_at"],
        "questions": questions,
        "question_count": len(questions),
    }
    if submission is not None:
        payload["submission"] = {
            "answers": json.loads(submission["answers_json"] or "{}"),
            "score": submission["score"],
            "total": submission["total"],
            "status": submission["status"],
            "submitted_at": submission["submitted_at"],
            "updated_at": submission["updated_at"],
            "feedback": submission["feedback"] if "feedback" in submission.keys() else "",
        }
    return payload


def _assignment_row(conn, assignment_id: str):
    row = conn.execute(
        "SELECT a.*, c.name AS class_name FROM assignments a JOIN teaching_classes c ON c.id = a.class_id WHERE a.id = ? AND c.archived = 0",
        (assignment_id,),
    ).fetchone()
    if not row:
        raise ValueError("作业不存在或已关闭")
    return row


def create_assignment(teacher: str, class_id: str, title: str, instructions: str, due_at: str | None, questions, course_id: str = "python") -> dict:
    if not teacher_owns_class(teacher, class_id):
        raise ValueError("你没有权限在这个班级布置作业")
    safe_title = " ".join(str(title or "").split())[:120]
    if not safe_title:
        raise ValueError("作业标题不能为空")
    parsed_questions = _questions(questions)
    assignment_id = uuid.uuid4().hex[:12]
    created_at = datetime.now().isoformat()
    safe_due = str(due_at or "").strip()[:40] or None
    safe_course = str(course_id or "python").strip().lower()
    if safe_course not in ASSIGNMENT_COURSES:
        raise ValueError("请选择 Python、C++ 或 Scratch 作业")
    conn = connect()
    conn.execute(
        "INSERT INTO assignments (id, class_id, teacher, title, instructions, due_at, questions_json, created_at, course_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (assignment_id, class_id, teacher[:40], safe_title, str(instructions or "").strip()[:2000], safe_due, json.dumps(parsed_questions, ensure_ascii=False), created_at, safe_course),
    )
    row = _assignment_row(conn, assignment_id)
    conn.commit()
    conn.close()
    result = _serialize(row)
    create_class_message(class_id, teacher, f"📚 新作业：{safe_title}，共 {len(parsed_questions)} 题。打开作业中心即可完成。", "notice")
    return result


def list_assignments(username: str, role: str, class_id: str | None = None) -> list[dict]:
    conn = connect()
    params: list[str] = [username]
    if role == "teacher":
        sql = "SELECT a.*, c.name AS class_name FROM assignments a JOIN teaching_classes c ON c.id = a.class_id WHERE a.teacher = ? AND c.archived = 0"
    else:
        sql = "SELECT a.*, c.name AS class_name FROM assignments a JOIN teaching_classes c ON c.id = a.class_id JOIN class_members m ON m.class_id = c.id AND m.username = ? WHERE m.role = 'student' AND c.archived = 0"
    if class_id:
        sql += " AND a.class_id = ?"
        params.append(class_id)
    sql += " ORDER BY COALESCE(a.due_at, a.created_at) DESC, a.created_at DESC"
    rows = conn.execute(sql, params).fetchall()
    result = []
    for row in rows:
        submission = conn.execute("SELECT * FROM assignment_submissions WHERE assignment_id = ? AND username = ?", (row["id"], username)).fetchone()
        result.append(_serialize(row, submission))
    conn.close()
    return result


def get_assignment(username: str, role: str, assignment_id: str) -> dict:
    conn = connect()
    row = _assignment_row(conn, assignment_id)
    allowed = teacher_owns_class(username, row["class_id"]) if role == "teacher" else student_in_class(username, row["class_id"])
    if not allowed:
        conn.close()
        raise ValueError("你不是这个班级的成员")
    submission = conn.execute("SELECT * FROM assignment_submissions WHERE assignment_id = ? AND username = ?", (assignment_id, username)).fetchone()
    result = _serialize(row, submission)
    conn.close()
    return result


def submit_assignment(username: str, assignment_id: str, answers: dict) -> dict:
    conn = connect()
    row = _assignment_row(conn, assignment_id)
    if not student_in_class(username, row["class_id"]):
        conn.close()
        raise ValueError("你不是这个班级的学生")
    safe_answers = {str(key)[:40]: str(value)[:20000] for key, value in (answers or {}).items()}
    status = "submitted"
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO assignment_submissions (assignment_id, username, answers_json, score, total, status, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(assignment_id, username) DO UPDATE SET answers_json=excluded.answers_json, score=excluded.score, total=excluded.total, status=excluded.status, submitted_at=excluded.submitted_at, updated_at=excluded.updated_at",
        (assignment_id, username[:40], json.dumps(safe_answers, ensure_ascii=False), None, 0, status, now, now),
    )
    conn.commit()
    conn.close()
    return {"status": status, "score": None, "total": 0, "submitted_at": now}


def remind_assignment(teacher: str, assignment_id: str) -> dict:
    conn = connect()
    row = _assignment_row(conn, assignment_id)
    if row["teacher"] != teacher:
        conn.close()
        raise ValueError("你没有权限提醒这份作业")
    conn.close()
    create_class_message(row["class_id"], teacher, f"⏰ 作业提醒：{row['title']}，请同学在截止时间前完成。", "notice")
    return {"status": "ok"}


def list_submissions(teacher: str, assignment_id: str) -> list[dict]:
    conn = connect()
    row = _assignment_row(conn, assignment_id)
    if row["teacher"] != teacher:
        conn.close()
        raise ValueError("你没有权限查看提交")
    rows = conn.execute("SELECT username, answers_json, score, total, status, submitted_at, updated_at, feedback FROM assignment_submissions WHERE assignment_id = ? ORDER BY updated_at DESC", (assignment_id,)).fetchall()
    conn.close()
    return [{**dict(item), "answers": json.loads(item["answers_json"] or "{}")} for item in rows]


def grade_submission(teacher: str, assignment_id: str, student: str, score, total, feedback: str) -> dict:
    conn = connect()
    row = _assignment_row(conn, assignment_id)
    if row["teacher"] != teacher:
        conn.close()
        raise ValueError("你没有权限批改这份作业")
    try:
        safe_score = max(0, int(score))
        safe_total = max(1, int(total))
    except (TypeError, ValueError) as error:
        conn.close()
        raise ValueError("请填写有效分数") from error
    if safe_score > safe_total:
        conn.close()
        raise ValueError("得分不能高于满分")
    now = datetime.now().isoformat()
    cursor = conn.execute(
        "UPDATE assignment_submissions SET score = ?, total = ?, feedback = ?, status = 'graded', updated_at = ? WHERE assignment_id = ? AND username = ?",
        (safe_score, safe_total, str(feedback or "").strip()[:1000], now, assignment_id, student[:40]),
    )
    if not cursor.rowcount:
        conn.close()
        raise ValueError("学生尚未提交这份作业")
    conn.commit()
    conn.close()
    return {"username": student, "score": safe_score, "total": safe_total, "feedback": str(feedback or "").strip()[:1000], "status": "graded", "updated_at": now}
