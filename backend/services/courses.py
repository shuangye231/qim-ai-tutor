import json
from datetime import datetime

from backend.database import connect


COURSE_IDS = {"scratch", "python", "cpp"}
COURSE_STAGE_TOPIC_COUNTS = {
    "scratch": [12] * 6,
    "python": [12] * 8,
    "cpp": [12] * 9,
}

COURSE_CONTEXT = {
    "scratch": "当前课程是 Scratch 创意编程。优先使用角色、舞台、积木、事件、循环、条件、变量、广播、克隆和小游戏项目来讲解，不要混入 Python 或 C++ 语法，除非学生明确要求比较。",
    "python": "当前课程是 Python 编程。示例默认使用 Python 3，围绕变量、条件、循环、数据结构、函数、模块、文件和小项目循序讲解，不要改用 Scratch 或 C++，除非学生明确要求比较。",
    "cpp": "当前课程是 C++ 编程与竞赛启蒙。示例默认使用标准 C++17，围绕输入输出、控制流程、数组字符串、函数、STL 和基础算法讲解，并提醒边界、复杂度和调试方法。",
}


def normalize_course_id(value: str) -> str:
    course_id = str(value or "scratch").strip().lower()
    return course_id if course_id in COURSE_IDS else "scratch"


def conversation_key(username: str, course_id: str, session_id: str) -> str:
    return f"{username[:40]}:{normalize_course_id(course_id)}:{str(session_id or 'default')[:80]}"


def course_context(course_id: str) -> str:
    return COURSE_CONTEXT[normalize_course_id(course_id)]


def init_course_db() -> None:
    conn = connect()
    conn.execute(
        "CREATE TABLE IF NOT EXISTS course_progress ("
        "username TEXT NOT NULL, course_id TEXT NOT NULL, completed_json TEXT NOT NULL DEFAULT '[]', "
        "updated_at TEXT NOT NULL, PRIMARY KEY (username, course_id))"
    )
    conn.commit()
    conn.close()


def get_course_progress(username: str, course_id: str) -> list[str]:
    course_id = normalize_course_id(course_id)
    conn = connect()
    row = conn.execute(
        "SELECT completed_json FROM course_progress WHERE username = ? AND course_id = ?",
        (username[:40], course_id),
    ).fetchone()
    conn.close()
    if not row:
        return []
    try:
        completed = json.loads(row[0])
    except (TypeError, json.JSONDecodeError):
        return []
    return [step_id for step_id in completed if _valid_step_id(course_id, step_id)]


def toggle_course_step(username: str, course_id: str, step_id: str) -> list[str]:
    course_id = normalize_course_id(course_id)
    if not _valid_step_id(course_id, step_id):
        raise ValueError("课程知识点不存在")
    completed = get_course_progress(username, course_id)
    stage_number, _, _ = _topic_position(step_id)
    active_stage = _active_stage(course_id, completed)
    if stage_number != active_stage:
        if stage_number < active_stage:
            raise ValueError("已完成阶段只能回看，不能回退进度")
        raise ValueError("请先完成当前阶段，再解锁后续内容")
    if step_id in completed:
        completed.remove(step_id)
    else:
        completed.append(step_id)
    completed.sort(key=_topic_position)
    conn = connect()
    conn.execute(
        "INSERT INTO course_progress (username, course_id, completed_json, updated_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(username, course_id) DO UPDATE SET completed_json=excluded.completed_json, updated_at=excluded.updated_at",
        (username[:40], course_id, json.dumps(completed, ensure_ascii=False), datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return completed


def _valid_step_id(course_id: str, step_id: str) -> bool:
    try:
        stage_number, module_number, topic_number = _topic_position(step_id)
        counts = COURSE_STAGE_TOPIC_COUNTS[course_id]
        return str(step_id).startswith(course_id + "-") and 1 <= stage_number <= len(counts) and 1 <= module_number <= 3 and 1 <= topic_number <= 4
    except (KeyError, TypeError, ValueError):
        return False


def _topic_position(step_id: str) -> tuple[int, int, int]:
    prefix, stage, module, topic = str(step_id or "").rsplit("-", 3)
    if not prefix or not stage.isdigit() or not module.isdigit() or not topic.isdigit():
        raise ValueError("知识点编号不合法")
    return int(stage), int(module), int(topic)


def _active_stage(course_id: str, completed: list[str]) -> int:
    for stage_number, _ in enumerate(COURSE_STAGE_TOPIC_COUNTS[course_id], start=1):
        expected = {f"{course_id}-{stage_number}-{module_number}-{topic_number}" for module_number in range(1, 4) for topic_number in range(1, 5)}
        if not expected.issubset(completed):
            return stage_number
    return len(COURSE_STAGE_TOPIC_COUNTS[course_id]) + 1
