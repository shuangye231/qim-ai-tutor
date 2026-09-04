from datetime import datetime

from backend.database import connect


def init_user_ai_key_db() -> None:
    conn = connect()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_ai_keys (
            username TEXT PRIMARY KEY,
            api_key TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _mask(value: str) -> str:
    value = str(value or "")
    if len(value) <= 8:
        return "••••••••"
    return f"{value[:4]}{'•' * min(12, max(4, len(value) - 8))}{value[-4:]}"


def list_user_ai_keys(institution_code: str = "", role: str = "") -> list[dict]:
    from backend.services.institutions import institution_usernames

    allowed = institution_usernames(institution_code, role)
    init_user_ai_key_db()
    conn = connect()
    rows = conn.execute(
        "SELECT u.username, COALESCE(u.role, 'user') AS role, k.api_key, k.updated_at "
        "FROM users u LEFT JOIN user_ai_keys k ON k.username = u.username "
        "WHERE COALESCE(u.role, 'user') != 'developer' ORDER BY u.username"
    ).fetchall()
    conn.close()
    return [
        {
            "username": row["username"],
            "role": row["role"],
            "has_custom_key": bool(row["api_key"]),
            "api_key": str(row["api_key"] or ""),
            "masked_key": _mask(row["api_key"]) if row["api_key"] else "使用服务器默认 Key",
            "updated_at": row["updated_at"],
        }
        for row in rows
        if allowed is None or row["username"] in allowed
    ]


def set_user_ai_key(username: str, api_key: str) -> dict:
    username = str(username or "").strip()[:40]
    api_key = str(api_key or "").strip()
    if not username:
        raise ValueError("账号不能为空")
    if not 8 <= len(api_key) <= 500:
        raise ValueError("API Key 长度应为 8-500 个字符")
    init_user_ai_key_db()
    conn = connect()
    user = conn.execute(
        "SELECT username, COALESCE(role, 'user') AS role FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if not user:
        conn.close()
        raise ValueError("账号不存在")
    if user["role"] == "developer":
        conn.close()
        raise ValueError("不能为开发者账号设置用户 Key")
    conn.execute(
        "INSERT INTO user_ai_keys (username, api_key, updated_at) VALUES (?, ?, ?) "
        "ON CONFLICT(username) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at",
        (username, api_key, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return next(item for item in list_user_ai_keys() if item["username"] == username)


def clear_user_ai_key(username: str) -> bool:
    username = str(username or "").strip()[:40]
    init_user_ai_key_db()
    conn = connect()
    user = conn.execute(
        "SELECT COALESCE(role, 'user') AS role FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if not user:
        conn.close()
        raise ValueError("账号不存在")
    if user["role"] == "developer":
        conn.close()
        raise ValueError("不能操作开发者账号")
    deleted = conn.execute("DELETE FROM user_ai_keys WHERE username = ?", (username,)).rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def get_user_ai_key(username: str) -> str:
    username = str(username or "").strip()[:40]
    if not username or username.startswith("api:"):
        return ""
    init_user_ai_key_db()
    conn = connect()
    row = conn.execute("SELECT api_key FROM user_ai_keys WHERE username = ?", (username,)).fetchone()
    conn.close()
    return str(row["api_key"] or "") if row else ""
