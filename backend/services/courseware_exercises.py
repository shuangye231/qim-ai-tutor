import json
import re
import uuid
from datetime import datetime

from backend.database import connect


COURSES = {"scratch", "python", "cpp"}
DIFFICULTIES = ("入门", "基础", "进阶")
QUESTION_TYPES = {"选择题", "填空题", "编程题"}


def init_courseware_exercise_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS courseware_exercise_drafts (
            id TEXT PRIMARY KEY,
            teacher TEXT NOT NULL,
            source_stored_name TEXT NOT NULL,
            title TEXT NOT NULL,
            course_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            questions_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_courseware_exercise_teacher
            ON courseware_exercise_drafts(teacher, updated_at DESC);
        """
    )
    conn.commit()
    conn.close()


def _question(item: dict, index: int) -> dict:
    if not isinstance(item, dict):
        raise ValueError(f"第 {index} 题格式不正确")
    difficulty = str(item.get("difficulty") or "").strip()
    question_type = str(item.get("type") or "").strip()
    title = str(item.get("title") or "").strip()
    prompt = str(item.get("prompt") or "").strip()
    answer = str(item.get("answer") or "").strip()
    if difficulty not in DIFFICULTIES:
        raise ValueError(f"第 {index} 题难度必须是入门、基础或进阶")
    if question_type not in QUESTION_TYPES:
        raise ValueError(f"第 {index} 题类型必须是选择题、填空题或编程题")
    if not title or not prompt or not answer:
        raise ValueError(f"第 {index} 题的标题、题目描述和参考答案不能为空")
    points = item.get("knowledge_points") or []
    if isinstance(points, str):
        points = re.split(r"[,，、/]", points)
    return {
        "id": str(item.get("id") or uuid.uuid4().hex[:12])[:40],
        "difficulty": difficulty,
        "type": question_type,
        "title": title[:120],
        "prompt": prompt[:8_000],
        "answer": answer[:8_000],
        "explanation": str(item.get("explanation") or "").strip()[:8_000],
        "knowledge_points": [str(point).strip()[:60] for point in points[:8] if str(point).strip()],
    }


def validate_questions(questions: list) -> list[dict]:
    if not isinstance(questions, list) or not 3 <= len(questions) <= 30:
        raise ValueError("练习草稿必须包含 3 到 30 道题")
    cleaned = [_question(item, index) for index, item in enumerate(questions, start=1)]
    missing = [difficulty for difficulty in DIFFICULTIES if not any(item["difficulty"] == difficulty for item in cleaned)]
    if missing:
        raise ValueError("练习草稿缺少难度：" + "、".join(missing))
    return cleaned


def parse_generated_questions(content: str) -> list[dict]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(content or "").strip(), flags=re.IGNORECASE)
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", cleaned)
        if not match:
            raise ValueError("AI 没有返回可识别的题目 JSON")
        try:
            payload = json.loads(match.group())
        except json.JSONDecodeError as error:
            raise ValueError("AI 返回的题目格式不正确，请重新生成") from error
    questions = payload.get("questions") if isinstance(payload, dict) else payload
    return validate_questions(questions)


def create_draft(teacher: str, source_stored_name: str, title: str, course_id: str, questions: list) -> dict:
    if course_id not in COURSES:
        raise ValueError("课程类型不支持")
    questions = validate_questions(questions)
    draft_id = uuid.uuid4().hex[:12]
    now = datetime.now().isoformat()
    conn = connect()
    conn.execute(
        "INSERT INTO courseware_exercise_drafts (id, teacher, source_stored_name, title, course_id, questions_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (draft_id, teacher, source_stored_name, title.strip()[:120] or "课件练习", course_id, json.dumps(questions, ensure_ascii=False), now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM courseware_exercise_drafts WHERE id = ?", (draft_id,)).fetchone()
    conn.close()
    return _serialize(row)


def _serialize(row) -> dict:
    result = dict(row)
    result["questions"] = json.loads(result.pop("questions_json"))
    return result


def list_drafts(teacher: str) -> list[dict]:
    conn = connect()
    rows = conn.execute(
        "SELECT * FROM courseware_exercise_drafts WHERE teacher = ? ORDER BY updated_at DESC",
        (teacher,),
    ).fetchall()
    conn.close()
    return [_serialize(row) for row in rows]


def update_draft(draft_id: str, teacher: str, data: dict) -> dict | None:
    conn = connect()
    row = conn.execute(
        "SELECT * FROM courseware_exercise_drafts WHERE id = ? AND teacher = ?",
        (draft_id, teacher),
    ).fetchone()
    if not row:
        conn.close()
        return None
    current = _serialize(row)
    course_id = str(data.get("course_id") or current["course_id"])
    if course_id not in COURSES:
        conn.close()
        raise ValueError("课程类型不支持")
    questions = validate_questions(data.get("questions", current["questions"]))
    title = str(data.get("title") or current["title"]).strip()[:120]
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE courseware_exercise_drafts SET title = ?, course_id = ?, status = 'draft', questions_json = ?, updated_at = ? WHERE id = ? AND teacher = ?",
        (title, course_id, json.dumps(questions, ensure_ascii=False), now, draft_id, teacher),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM courseware_exercise_drafts WHERE id = ?", (draft_id,)).fetchone()
    conn.close()
    return _serialize(updated)


def confirm_draft(draft_id: str, teacher: str) -> dict | None:
    conn = connect()
    row = conn.execute(
        "SELECT * FROM courseware_exercise_drafts WHERE id = ? AND teacher = ?",
        (draft_id, teacher),
    ).fetchone()
    if not row:
        conn.close()
        return None
    validate_questions(json.loads(row["questions_json"]))
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE courseware_exercise_drafts SET status = 'saved', updated_at = ? WHERE id = ? AND teacher = ?",
        (now, draft_id, teacher),
    )
    conn.commit()
    saved = conn.execute("SELECT * FROM courseware_exercise_drafts WHERE id = ?", (draft_id,)).fetchone()
    conn.close()
    return _serialize(saved)
