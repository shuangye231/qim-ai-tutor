import re
import uuid
from datetime import datetime

from backend.database import connect


CODE_PATTERN = re.compile(r"^[A-Z0-9-]{4,20}$")


def init_institution_db() -> None:
    conn = connect()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS institutions (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if columns and "institution_code" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN institution_code TEXT")
    conn.commit()
    conn.close()


def normalize_code(value: str) -> str:
    code = str(value or "").strip().upper()
    if not CODE_PATTERN.fullmatch(code):
        raise ValueError("机构代码应为 4-20 位大写字母、数字或短横线")
    return code


def create_institution(name: str, code: str, developer: str) -> dict:
    name = str(name or "").strip()
    if not 2 <= len(name) <= 80:
        raise ValueError("机构名称应为 2-80 个字符")
    code = normalize_code(code)
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO institutions (id, code, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
            (uuid.uuid4().hex[:12], code, name, developer, datetime.now().isoformat()),
        )
        conn.commit()
    except Exception as error:
        if "UNIQUE" in str(error).upper():
            raise ValueError("该机构代码已存在") from error
        raise
    row = conn.execute("SELECT * FROM institutions WHERE code = ?", (code,)).fetchone()
    conn.close()
    return _serialize(row)


def _serialize(row) -> dict:
    result = dict(row)
    result["active"] = bool(result["active"])
    return result


def list_institutions() -> list[dict]:
    conn = connect()
    rows = conn.execute(
        "SELECT i.*, COUNT(u.username) AS teacher_count FROM institutions i "
        "LEFT JOIN users u ON u.institution_code = i.code AND u.role = 'teacher' "
        "GROUP BY i.id ORDER BY i.created_at DESC"
    ).fetchall()
    conn.close()
    return [_serialize(row) for row in rows]


def institution_usernames(institution_code: str = "", role: str = "") -> set[str] | None:
    """Return accounts belonging to an institution, or None when unfiltered."""
    code = str(institution_code or "").strip().upper()
    requested_role = str(role or "").strip().lower()
    if not code:
        return None
    if requested_role not in {"teacher", "user", "student"}:
        requested_role = ""
    if requested_role == "student":
        requested_role = "user"
    conn = connect()
    rows = conn.execute(
        "SELECT u.username, COALESCE(u.role, 'user') AS role FROM users u WHERE "
        "(u.role = 'teacher' AND u.institution_code = ?) OR "
        "(u.role = 'user' AND EXISTS ("
        "SELECT 1 FROM class_members cm JOIN teaching_classes tc ON tc.id = cm.class_id "
        "JOIN users t ON t.username = tc.teacher "
        "WHERE cm.username = u.username AND COALESCE(cm.role, 'student') = 'student' "
        "AND t.institution_code = ?))",
        (code, code),
    ).fetchall()
    conn.close()
    usernames = {row["username"] for row in rows}
    if requested_role == "teacher":
        return {row["username"] for row in rows if row["role"] == "teacher"}
    if requested_role == "user":
        return {row["username"] for row in rows if row["role"] != "teacher"}
    return usernames


def require_institution_account(institution_code: str, username: str) -> None:
    if institution_code and username not in (institution_usernames(institution_code) or set()):
        raise ValueError("该账号不属于当前机构")


def set_institution_active(code: str, active: bool) -> dict | None:
    code = normalize_code(code)
    conn = connect()
    conn.execute("UPDATE institutions SET active = ? WHERE code = ?", (int(active), code))
    conn.commit()
    row = conn.execute("SELECT * FROM institutions WHERE code = ?", (code,)).fetchone()
    conn.close()
    return _serialize(row) if row else None


def validate_teacher_institution(username: str, code: str) -> str:
    code = normalize_code(code)
    conn = connect()
    institution = conn.execute(
        "SELECT code FROM institutions WHERE code = ? AND active = 1",
        (code,),
    ).fetchone()
    user = conn.execute("SELECT institution_code FROM users WHERE username = ?", (username,)).fetchone()
    if not institution:
        conn.close()
        raise ValueError("机构代码无效或已停用")
    bound_code = str(user["institution_code"] or "") if user else ""
    if bound_code and bound_code != code:
        conn.close()
        raise ValueError("该教师账号不属于此机构")
    if not bound_code:
        conn.execute("UPDATE users SET institution_code = ? WHERE username = ?", (code, username))
        conn.commit()
    conn.close()
    return code
