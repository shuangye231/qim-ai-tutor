import secrets
import sqlite3
import uuid
from datetime import datetime

from backend.database import connect


def init_class_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS teaching_classes (
            id TEXT PRIMARY KEY,
            teacher TEXT NOT NULL,
            name TEXT NOT NULL,
            invite_code TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_teaching_classes_teacher
            ON teaching_classes(teacher, created_at DESC);
        CREATE TABLE IF NOT EXISTS class_members (
            class_id TEXT NOT NULL,
            username TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            joined_at TEXT NOT NULL,
            PRIMARY KEY(class_id, username),
            FOREIGN KEY(class_id) REFERENCES teaching_classes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_class_members_user
            ON class_members(username, joined_at DESC);
        """
    )
    class_columns = {row["name"] for row in conn.execute("PRAGMA table_info(teaching_classes)").fetchall()}
    if "announcement" not in class_columns:
        conn.execute("ALTER TABLE teaching_classes ADD COLUMN announcement TEXT NOT NULL DEFAULT ''")
    if "avatar_url" not in class_columns:
        conn.execute("ALTER TABLE teaching_classes ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''")
    member_columns = {row["name"] for row in conn.execute("PRAGMA table_info(class_members)").fetchall()}
    if "muted" not in member_columns:
        conn.execute("ALTER TABLE class_members ADD COLUMN muted INTEGER NOT NULL DEFAULT 0")
    conn.commit()
    conn.close()


def _serialize(row, member_count: int = 0) -> dict:
    return {
        "id": row["id"],
        "teacher": row["teacher"],
        "name": row["name"],
        "invite_code": row["invite_code"],
        "created_at": row["created_at"],
        "archived": bool(row["archived"]),
        "member_count": member_count,
        "announcement": row["announcement"] if "announcement" in row.keys() else "",
        "avatar_url": row["avatar_url"] if "avatar_url" in row.keys() else "",
    }


def _new_invite_code(conn) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(20):
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if not conn.execute("SELECT 1 FROM teaching_classes WHERE invite_code = ?", (code,)).fetchone():
            return code
    raise RuntimeError("暂时无法生成班级邀请码，请重试")


def create_class(teacher: str, name: str) -> dict:
    name = " ".join(str(name or "").split())[:80]
    if not name:
        raise ValueError("班级名称不能为空")
    conn = connect()
    class_id = uuid.uuid4().hex[:12]
    now = datetime.now().isoformat()
    code = _new_invite_code(conn)
    conn.execute(
        "INSERT INTO teaching_classes (id, teacher, name, invite_code, created_at) VALUES (?, ?, ?, ?, ?)",
        (class_id, teacher[:40], name, code, now),
    )
    conn.execute(
        "INSERT INTO class_members (class_id, username, role, joined_at) VALUES (?, ?, 'teacher', ?)",
        (class_id, teacher[:40], now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM teaching_classes WHERE id = ?", (class_id,)).fetchone()
    conn.close()
    return _serialize(row, 1)


def list_teacher_classes(teacher: str) -> list[dict]:
    conn = connect()
    rows = conn.execute(
        "SELECT c.*, COUNT(CASE WHEN m.role = 'student' THEN 1 END) AS member_count "
        "FROM teaching_classes c LEFT JOIN class_members m ON m.class_id = c.id "
        "WHERE c.teacher = ? AND c.archived = 0 GROUP BY c.id ORDER BY c.created_at DESC",
        (teacher,),
    ).fetchall()
    conn.close()
    return [_serialize(row, row["member_count"]) for row in rows]


def list_student_classes(username: str) -> list[dict]:
    conn = connect()
    rows = conn.execute(
        "SELECT c.*, COUNT(CASE WHEN all_members.role = 'student' THEN 1 END) AS member_count "
        "FROM class_members mine JOIN teaching_classes c ON c.id = mine.class_id "
        "LEFT JOIN class_members all_members ON all_members.class_id = c.id "
        "WHERE mine.username = ? AND c.archived = 0 GROUP BY c.id ORDER BY c.created_at DESC",
        (username,),
    ).fetchall()
    conn.close()
    return [_serialize(row, row["member_count"]) for row in rows]


def join_class(username: str, invite_code: str) -> dict:
    code = "".join(str(invite_code or "").upper().split())
    if len(code) != 6:
        raise ValueError("请输入 6 位班级邀请码")
    conn = connect()
    row = conn.execute("SELECT * FROM teaching_classes WHERE invite_code = ? AND archived = 0", (code,)).fetchone()
    if not row:
        conn.close()
        raise ValueError("邀请码无效或班级已关闭")
    now = datetime.now().isoformat()
    try:
        conn.execute(
            "INSERT INTO class_members (class_id, username, role, joined_at) VALUES (?, ?, 'student', ?)",
            (row["id"], username[:40], now),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError("你已经加入这个班级")
    result = _serialize(row)
    conn.close()
    return result


def teacher_owns_class(teacher: str, class_id: str) -> bool:
    if not class_id or class_id == "all":
        return class_id == "all"
    conn = connect()
    row = conn.execute("SELECT 1 FROM teaching_classes WHERE id = ? AND teacher = ? AND archived = 0", (class_id, teacher)).fetchone()
    conn.close()
    return bool(row)


def student_in_class(username: str, class_id: str) -> bool:
    conn = connect()
    row = conn.execute(
        "SELECT 1 FROM class_members m JOIN teaching_classes c ON c.id = m.class_id "
        "WHERE m.class_id = ? AND m.username = ? AND c.archived = 0",
        (class_id, username),
    ).fetchone()
    conn.close()
    return bool(row)


def member_in_class(username: str, class_id: str) -> bool:
    conn = connect()
    row = conn.execute(
        "SELECT 1 FROM class_members m JOIN teaching_classes c ON c.id = m.class_id "
        "WHERE m.class_id = ? AND m.username = ? AND c.archived = 0",
        (class_id, username),
    ).fetchone()
    conn.close()
    return bool(row)


def init_class_chat_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS class_messages (
            id TEXT PRIMARY KEY,
            class_id TEXT NOT NULL,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'message',
            media_url TEXT,
            media_name TEXT,
            media_type TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(class_id) REFERENCES teaching_classes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_class_messages_class_time
            ON class_messages(class_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS class_private_messages (
            id TEXT PRIMARY KEY,
            class_id TEXT NOT NULL,
            sender TEXT NOT NULL,
            recipient TEXT NOT NULL,
            content TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'message',
            media_url TEXT,
            media_name TEXT,
            media_type TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(class_id) REFERENCES teaching_classes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_private_messages_pair_time
            ON class_private_messages(class_id, sender, recipient, created_at DESC);
        """
    )
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(class_messages)").fetchall()}
    for name in ("media_url", "media_name", "media_type"):
        if name not in columns:
            conn.execute(f"ALTER TABLE class_messages ADD COLUMN {name} TEXT")
    conn.commit()
    conn.close()


def class_members(class_id: str) -> list[dict]:
    conn = connect()
    user_columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    avatar_select = "COALESCE(u.avatar_url, '')" if "avatar_url" in user_columns else "''"
    rows = conn.execute(
        f"SELECT m.username, m.role, m.joined_at, m.muted, {avatar_select} AS avatar_url "
        "FROM class_members m LEFT JOIN users u ON u.username = m.username "
        "WHERE m.class_id = ? ORDER BY m.role DESC, m.joined_at",
        (class_id,),
    ).fetchall()
    conn.close()
    return [{**dict(row), "muted": bool(row["muted"])} for row in rows]


def member_is_muted(class_id: str, username: str) -> bool:
    conn = connect()
    row = conn.execute("SELECT muted FROM class_members WHERE class_id = ? AND username = ?", (class_id, username)).fetchone()
    conn.close()
    return bool(row and row["muted"])


def update_class_settings(teacher: str, class_id: str, name: str, announcement: str) -> dict:
    safe_name = " ".join(str(name or "").split())[:80]
    if not safe_name:
        raise ValueError("群名称不能为空")
    safe_announcement = str(announcement or "").strip()[:1000]
    conn = connect()
    cursor = conn.execute(
        "UPDATE teaching_classes SET name = ?, announcement = ? WHERE id = ? AND teacher = ? AND archived = 0",
        (safe_name, safe_announcement, class_id, teacher),
    )
    if not cursor.rowcount:
        conn.close()
        raise ValueError("班级不存在或无权管理")
    conn.commit()
    row = conn.execute("SELECT * FROM teaching_classes WHERE id = ?", (class_id,)).fetchone()
    member_count = conn.execute("SELECT COUNT(*) FROM class_members WHERE class_id = ? AND role = 'student'", (class_id,)).fetchone()[0]
    conn.close()
    return _serialize(row, member_count)


def archive_class(teacher: str, class_id: str) -> None:
    conn = connect()
    cursor = conn.execute(
        "UPDATE teaching_classes SET archived = 1 WHERE id = ? AND teacher = ? AND archived = 0",
        (class_id, teacher),
    )
    if not cursor.rowcount:
        conn.close()
        raise ValueError("班级不存在或无权解散")
    conn.commit()
    conn.close()


def update_class_avatar(teacher: str, class_id: str, avatar_url: str) -> dict:
    conn = connect()
    cursor = conn.execute(
        "UPDATE teaching_classes SET avatar_url = ? WHERE id = ? AND teacher = ? AND archived = 0",
        (avatar_url, class_id, teacher),
    )
    if not cursor.rowcount:
        conn.close()
        raise ValueError("班级不存在或无权管理")
    conn.commit()
    row = conn.execute("SELECT * FROM teaching_classes WHERE id = ?", (class_id,)).fetchone()
    member_count = conn.execute("SELECT COUNT(*) FROM class_members WHERE class_id = ? AND role = 'student'", (class_id,)).fetchone()[0]
    conn.close()
    return _serialize(row, member_count)


def set_member_muted(teacher: str, class_id: str, username: str, muted: bool) -> None:
    conn = connect()
    cursor = conn.execute(
        "UPDATE class_members SET muted = ? WHERE class_id = ? AND username = ? AND role = 'student' "
        "AND EXISTS (SELECT 1 FROM teaching_classes WHERE id = ? AND teacher = ? AND archived = 0)",
        (int(muted), class_id, username, class_id, teacher),
    )
    if not cursor.rowcount:
        conn.close()
        raise ValueError("学生不存在或无权管理")
    conn.commit()
    conn.close()


def remove_class_member(teacher: str, class_id: str, username: str) -> None:
    conn = connect()
    cursor = conn.execute(
        "DELETE FROM class_members WHERE class_id = ? AND username = ? AND role = 'student' "
        "AND EXISTS (SELECT 1 FROM teaching_classes WHERE id = ? AND teacher = ? AND archived = 0)",
        (class_id, username, class_id, teacher),
    )
    if not cursor.rowcount:
        conn.close()
        raise ValueError("学生不存在或无权移除")
    conn.commit()
    conn.close()


def leave_class(username: str, class_id: str) -> None:
    conn = connect()
    cursor = conn.execute(
        "DELETE FROM class_members WHERE class_id = ? AND username = ? AND role = 'student'",
        (class_id, username),
    )
    if not cursor.rowcount:
        conn.close()
        raise ValueError("你不在这个班级中")
    conn.commit()
    conn.close()


def list_class_messages(class_id: str, limit: int = 100) -> list[dict]:
    conn = connect()
    rows = conn.execute(
        "SELECT id, class_id, username, content, kind, media_url, media_name, media_type, created_at FROM class_messages "
        "WHERE class_id = ? ORDER BY created_at DESC LIMIT ?",
        (class_id, max(1, min(limit, 200))),
    ).fetchall()
    conn.close()
    return [dict(row) for row in reversed(rows)]


def create_class_message(class_id: str, username: str, content: str, kind: str = "message", media: dict | None = None) -> dict:
    text = " ".join(str(content or "").split())[:2000]
    if not text and not media:
        raise ValueError("消息内容不能为空")
    message_id = uuid.uuid4().hex[:12]
    created_at = datetime.now().isoformat()
    safe_kind = kind if kind in {"notice", "emoji"} else "message"
    conn = connect()
    conn.execute(
        "INSERT INTO class_messages (id, class_id, username, content, kind, media_url, media_name, media_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (message_id, class_id, username[:40], text, safe_kind, (media or {}).get("url"), (media or {}).get("name"), (media or {}).get("type"), created_at),
    )
    conn.commit()
    conn.close()
    return {"id": message_id, "class_id": class_id, "username": username, "content": text, "kind": safe_kind, "media_url": (media or {}).get("url"), "media_name": (media or {}).get("name"), "media_type": (media or {}).get("type"), "created_at": created_at}


def list_private_messages(class_id: str, sender: str, recipient: str, limit: int = 100) -> list[dict]:
    conn = connect()
    rows = conn.execute(
        "SELECT id, class_id, sender AS username, recipient, content, kind, media_url, media_name, media_type, created_at "
        "FROM class_private_messages WHERE class_id = ? AND ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)) "
        "ORDER BY created_at DESC LIMIT ?",
        (class_id, sender, recipient, recipient, sender, max(1, min(limit, 200))),
    ).fetchall()
    conn.close()
    return [dict(row) for row in reversed(rows)]


def create_private_message(class_id: str, sender: str, recipient: str, content: str, kind: str = "message", media: dict | None = None) -> dict:
    text = " ".join(str(content or "").split())[:2000]
    if not text and not media:
        raise ValueError("消息内容不能为空")
    if not member_in_class(sender, class_id) or not member_in_class(recipient, class_id):
        raise ValueError("只能联系同班成员")
    message_id = uuid.uuid4().hex[:12]
    created_at = datetime.now().isoformat()
    safe_kind = "emoji" if kind == "emoji" else "message"
    conn = connect()
    conn.execute(
        "INSERT INTO class_private_messages (id, class_id, sender, recipient, content, kind, media_url, media_name, media_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (message_id, class_id, sender[:40], recipient[:40], text, safe_kind, (media or {}).get("url"), (media or {}).get("name"), (media or {}).get("type"), created_at),
    )
    conn.commit()
    conn.close()
    return {"id": message_id, "class_id": class_id, "username": sender, "recipient": recipient, "content": text, "kind": safe_kind, "media_url": (media or {}).get("url"), "media_name": (media or {}).get("name"), "media_type": (media or {}).get("type"), "created_at": created_at}


def list_teacher_student_usernames(teacher: str, class_id: str = "all") -> list[str]:
    conn = connect()
    if class_id and class_id != "all":
        rows = conn.execute(
            "SELECT m.username FROM class_members m JOIN teaching_classes c ON c.id = m.class_id "
            "WHERE c.id = ? AND c.teacher = ? AND c.archived = 0 AND m.role = 'student' ORDER BY m.username",
            (class_id, teacher),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT DISTINCT m.username FROM class_members m JOIN teaching_classes c ON c.id = m.class_id "
            "WHERE c.teacher = ? AND c.archived = 0 AND m.role = 'student' ORDER BY m.username",
            (teacher,),
        ).fetchall()
    conn.close()
    return [row["username"] for row in rows]
