from pathlib import Path

from backend.config import DATA_DIR, PROJECT_DIR
from backend.database import connect
from backend.services.avatars import remove_avatar_url


def _in_clause(values: list[str]) -> tuple[str, list[str]]:
    return ", ".join("?" for _ in values), list(values)


def _table_exists(conn, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone() is not None


def _table_columns(conn, table: str) -> set[str]:
    if not _table_exists(conn, table):
        return set()
    return {item["name"] for item in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _delete_user_column(conn, table: str, column: str, username: str) -> None:
    if column in _table_columns(conn, table):
        conn.execute(f"DELETE FROM {table} WHERE {column} = ?", (username,))


def _delete_class_rows(conn, table: str, class_ids: list[str]) -> None:
    if not class_ids or not _table_exists(conn, table):
        return
    placeholders, params = _in_clause(class_ids)
    conn.execute(f"DELETE FROM {table} WHERE class_id IN ({placeholders})", params)


def _delete_assignment_rows(conn, assignment_ids: list[str]) -> None:
    if not assignment_ids or not _table_exists(conn, "assignment_submissions"):
        return
    placeholders, params = _in_clause(assignment_ids)
    conn.execute(
        f"DELETE FROM assignment_submissions WHERE assignment_id IN ({placeholders})", params
    )


def _delete_contest_rows(conn, table: str, contest_ids: list[str]) -> None:
    if not contest_ids or not _table_exists(conn, table):
        return
    placeholders, params = _in_clause(contest_ids)
    conn.execute(f"DELETE FROM {table} WHERE contest_id IN ({placeholders})", params)


def _remove_upload_files(stored_names: list[str]) -> None:
    upload_root = (DATA_DIR / "uploads").resolve()
    for stored_name in stored_names:
        target = (upload_root / Path(stored_name).name).resolve()
        if upload_root == target.parent:
            target.unlink(missing_ok=True)


def _remove_static_files(urls: list[str]) -> None:
    roots = {
        "/static/class-media/": PROJECT_DIR / "static" / "class-media",
        "/static/class-emojis/": PROJECT_DIR / "static" / "class-emojis",
        "/static/avatars/groups/": PROJECT_DIR / "static" / "avatars" / "groups",
    }
    for url in urls:
        for prefix, root in roots.items():
            if not str(url or "").startswith(prefix):
                continue
            target = (root / Path(str(url)[len(prefix):]).name).resolve()
            if root.resolve() == target.parent:
                target.unlink(missing_ok=True)
            break


def delete_user_account(
    username: str,
    *,
    actor_username: str | None = None,
    actor_role: str | None = None,
) -> dict:
    """Permanently remove a student or teacher and their owned records."""
    username = str(username or "").strip()[:40]
    if not username:
        raise ValueError("账号不能为空")
    if actor_role is not None and actor_role != "developer":
        raise PermissionError("仅开发者可以注销其他账号")
    if actor_username and actor_username == username:
        raise ValueError("不能注销当前开发者账号")

    conn = connect()
    removed_uploads: list[str] = []
    removed_media: list[str] = []
    avatar_urls: list[str] = []
    try:
        user_columns = _table_columns(conn, "users")
        avatar_select = ", ".join(
            f"COALESCE({column}, '') AS {column}" if column in user_columns else f"'' AS {column}"
            for column in ("avatar_url", "ai_avatar_url")
        )
        row = conn.execute(
            f"SELECT username, COALESCE(role, 'user') AS role, {avatar_select} FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if not row:
            raise ValueError("账号不存在")
        if row["role"] == "developer":
            raise ValueError("开发者账号不可注销")
        avatar_urls = [value for value in (row["avatar_url"], row["ai_avatar_url"]) if value]

        conn.execute("BEGIN IMMEDIATE")
        role = row["role"]
        class_ids = [
            item["id"]
            for item in conn.execute(
                "SELECT id FROM teaching_classes WHERE teacher = ?", (username,)
            ).fetchall()
        ] if role == "teacher" and _table_exists(conn, "teaching_classes") else []
        class_placeholders = ", ".join("?" for _ in class_ids) or "NULL"
        assignment_ids = [
            item["id"]
            for item in conn.execute(
                "SELECT id FROM assignments WHERE teacher = ? OR class_id IN "
                f"({class_placeholders})",
                [username, *class_ids],
            ).fetchall()
        ] if _table_exists(conn, "assignments") else []
        contest_ids = [
            item["id"]
            for item in conn.execute(
                "SELECT id FROM teacher_contests WHERE teacher = ?", (username,)
            ).fetchall()
        ] if role == "teacher" and _table_exists(conn, "teacher_contests") else []
        if _table_exists(conn, "knowledge_uploads"):
            removed_uploads = [
                item["stored_name"]
                for item in conn.execute(
                    "SELECT stored_name FROM knowledge_uploads WHERE username = ?", (username,)
                ).fetchall()
            ]

        if class_ids:
            placeholders, params = _in_clause(class_ids)
            for table, owner_clause in (
                ("class_messages", "1 = 1"),
                ("class_private_messages", "1 = 1"),
            ):
                if "media_url" in _table_columns(conn, table):
                    removed_media.extend(
                        item["media_url"]
                        for item in conn.execute(
                            f"SELECT media_url FROM {table} WHERE class_id IN ({placeholders}) AND {owner_clause} AND media_url IS NOT NULL",
                            params,
                        ).fetchall()
                    )
            if "avatar_url" in _table_columns(conn, "teaching_classes"):
                removed_media.extend(
                    item["avatar_url"]
                    for item in conn.execute(
                        f"SELECT avatar_url FROM teaching_classes WHERE id IN ({placeholders}) AND avatar_url IS NOT NULL",
                        params,
                    ).fetchall()
                )

        if role != "teacher":
            for table in ("class_messages", "class_private_messages"):
                if "media_url" not in _table_columns(conn, table):
                    continue
                owner = "username" if table == "class_messages" else "sender"
                removed_media.extend(
                    item["media_url"]
                    for item in conn.execute(
                        f"SELECT media_url FROM {table} WHERE {owner} = ? AND media_url IS NOT NULL",
                        (username,),
                    ).fetchall()
                )

        # Remove records owned by classes, assignments, and contests before their parents.
        _delete_class_rows(conn, "class_messages", class_ids)
        _delete_class_rows(conn, "class_private_messages", class_ids)
        _delete_class_rows(conn, "class_members", class_ids)
        _delete_assignment_rows(conn, assignment_ids)
        _delete_contest_rows(conn, "contest_submissions", contest_ids)
        _delete_contest_rows(conn, "contest_attempts", contest_ids)
        _delete_contest_rows(conn, "contest_grades", contest_ids)
        _delete_contest_rows(conn, "contest_problem_grades", contest_ids)
        if assignment_ids and _table_exists(conn, "assignments"):
            placeholders, params = _in_clause(assignment_ids)
            conn.execute(f"DELETE FROM assignments WHERE id IN ({placeholders})", params)
        if contest_ids and _table_exists(conn, "teacher_contests"):
            placeholders, params = _in_clause(contest_ids)
            conn.execute(f"DELETE FROM teacher_contests WHERE id IN ({placeholders})", params)
        if class_ids and _table_exists(conn, "teaching_classes"):
            placeholders, params = _in_clause(class_ids)
            conn.execute(f"DELETE FROM teaching_classes WHERE id IN ({placeholders})", params)

        # A student's own rows and any teacher-owned records not covered above.
        _delete_user_column(conn, "class_members", "username", username)
        _delete_user_column(conn, "class_messages", "username", username)
        if _table_exists(conn, "class_private_messages"):
            conn.execute(
                "DELETE FROM class_private_messages WHERE sender = ? OR recipient = ?",
                (username, username),
            )
        _delete_user_column(conn, "assignment_submissions", "username", username)
        _delete_user_column(conn, "contest_attempts", "username", username)
        _delete_user_column(conn, "contest_submissions", "username", username)
        _delete_user_column(conn, "contest_grades", "username", username)
        _delete_user_column(conn, "contest_problem_grades", "username", username)
        _delete_user_column(conn, "courseware_exercise_drafts", "teacher", username)
        _delete_user_column(conn, "knowledge_uploads", "username", username)

        for table in (
            "learning_plans",
            "learning_session_plans",
            "learning_notes",
            "learning_memory",
            "learning_reviews",
            "learning_shares",
            "practice_attempts",
            "daily_learning_goals",
            "course_progress",
            "oj_progress",
            "oj_mistake_mastery",
            "stats",
            "daily_stats",
            "ai_daily_quota",
            "quota_reservations",
            "billing_orders",
            "credit_grants",
            "user_ai_keys",
            "workspace_roots",
        ):
            _delete_user_column(conn, table, "username", username)
        _delete_user_column(conn, "api_keys", "owner", username)
        _delete_user_column(conn, "ai_settings", "scope", username)
        _delete_user_column(conn, "user_sessions", "username", username)
        conn.execute("DELETE FROM users WHERE username = ?", (username,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    for avatar_url in avatar_urls:
        remove_avatar_url(avatar_url)
    _remove_upload_files(removed_uploads)
    _remove_static_files(removed_media)
    return {"username": username, "role": row["role"]}
