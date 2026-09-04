import sqlite3
from datetime import datetime

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from backend.database import connect
from backend.security import (
    create_user_session,
    hash_password,
    password_needs_upgrade,
    require_authenticated_user,
    session_user,
    verify_password,
)
from backend.services.institutions import init_institution_db, validate_teacher_institution
from backend.services.avatars import AvatarUploadError, remove_avatar_url, save_avatar
from backend.services.account_deletion import delete_user_account


router = APIRouter(prefix="/api", tags=["auth"])
USER_AVATARS = {"👤", "🙂", "😎", "🧑‍💻", "🧑‍🎓", "🌟", "🚀", "💡"}
AI_AVATARS = {"🤖", "🧠", "🧑‍🏫", "✨", "🔮", "🛰️", "📚", "🎓"}


def _ensure_profile_columns() -> None:
    conn = connect()
    columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    for column in ("avatar_url", "ai_avatar_url"):
        if column not in columns:
            conn.execute(f"ALTER TABLE users ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
    conn.commit()
    conn.close()


def _profile(username: str) -> dict:
    _ensure_profile_columns()
    conn = connect()
    row = conn.execute("SELECT avatar_url, ai_avatar_url FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "用户不存在")
    return {"avatar_url": row["avatar_url"] or "", "ai_avatar_url": row["ai_avatar_url"] or ""}


def _set_profile_avatar(username: str, kind: str, value: str) -> dict:
    column = "avatar_url" if kind == "user" else "ai_avatar_url"
    current = _profile(username)
    previous = current[column]
    conn = connect()
    conn.execute(f"UPDATE users SET {column} = ? WHERE username = ?", (value, username))
    conn.commit()
    conn.close()
    if previous != value:
        remove_avatar_url(previous)
    return _profile(username)


@router.post("/register")
async def register(data: dict):
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        raise HTTPException(400, "用户名和密码不能为空")
    if not 2 <= len(username) <= 20:
        raise HTTPException(400, "用户名长度应为 2-20 个字符")
    if len(password) < 8:
        raise HTTPException(400, "密码至少 8 位")

    conn = connect()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), datetime.now().isoformat()),
        )
        conn.commit()
        return {"status": "ok", "message": "注册成功"}
    except sqlite3.IntegrityError as error:
        raise HTTPException(400, "用户名已存在") from error
    finally:
        conn.close()


@router.post("/login")
async def login(data: dict):
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    portal = str(data.get("portal") or "").strip()
    expected_roles = {"student": "user", "teacher": "teacher", "developer": "developer"}
    if portal not in expected_roles:
        raise HTTPException(400, "请选择学生、教师或开发者登录")
    init_institution_db()
    conn = connect()
    row = conn.execute(
        "SELECT username, password_hash, COALESCE(role, 'user') FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if not row or not verify_password(password, row[1]):
        conn.close()
        raise HTTPException(400, "用户名或密码错误")
    if row[2] != expected_roles[portal]:
        conn.close()
        raise HTTPException(403, "账号类型与当前登录入口不匹配")
    if portal == "teacher":
        conn.close()
        try:
            institution_code = validate_teacher_institution(username, data.get("institution_code", ""))
        except ValueError as error:
            raise HTTPException(400, str(error)) from error
        conn = connect()
    else:
        institution_code = None
    if password_needs_upgrade(row[1]):
        conn.execute("UPDATE users SET password_hash = ? WHERE username = ?", (hash_password(password), username))
        conn.commit()
    conn.close()
    return {
        "status": "ok",
        "message": "登录成功",
        "username": username,
        "role": row[2],
        "institution_code": institution_code,
        "session_token": create_user_session(username),
    }


@router.post("/password")
async def change_password(data: dict, x_session_token: str = Header(default="")):
    username = data.get("username", "").strip()
    require_authenticated_user(username, x_session_token)
    old_password = data.get("old_password", "")
    new_password = data.get("new_password", "")
    if not old_password or len(new_password) < 8:
        raise HTTPException(400, "请填写完整信息，新密码至少 8 位")

    conn = connect()
    row = conn.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if not row or not verify_password(old_password, row[0]):
        conn.close()
        raise HTTPException(400, "原密码不正确")
    conn.execute("UPDATE users SET password_hash = ? WHERE username = ?", (hash_password(new_password), username))
    conn.commit()
    conn.close()
    return {"status": "ok", "message": "密码已修改"}


@router.delete("/profile/account")
async def delete_profile_account(data: dict, x_session_token: str = Header(default="")):
    username = str(data.get("username") or "").strip()
    user = session_user(x_session_token)
    require_authenticated_user(username, x_session_token)
    if user["role"] == "developer":
        raise HTTPException(403, "开发者账号不可注销")
    try:
        delete_user_account(username)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    # The legacy chat engine keeps recent conversations in process memory.
    try:
        from backend.legacy import clear_runtime_user_state
        clear_runtime_user_state(username)
    except ImportError:
        pass
    return {"status": "ok", "message": "账号已注销"}


@router.get("/profile")
async def user_profile(username: str, x_session_token: str = Header(default="")):
    require_authenticated_user(username, x_session_token)
    return _profile(username)


@router.put("/profile/avatar")
async def choose_profile_avatar(data: dict, x_session_token: str = Header(default="")):
    username = str(data.get("username") or "").strip()
    require_authenticated_user(username, x_session_token)
    kind = str(data.get("kind") or "")
    value = str(data.get("value") or "")
    allowed = USER_AVATARS if kind == "user" else AI_AVATARS if kind == "ai" else set()
    if value not in allowed:
        raise HTTPException(400, "头像选项无效")
    return _set_profile_avatar(username, kind, value)


@router.post("/profile/avatar")
async def upload_profile_avatar(
    username: str = Form(...),
    kind: str = Form(...),
    file: UploadFile = File(...),
    x_session_token: str = Header(default=""),
):
    require_authenticated_user(username, x_session_token)
    if kind not in {"user", "ai"}:
        raise HTTPException(400, "头像类型无效")
    try:
        avatar_url = await save_avatar(file, "users", f"{username}-{kind}")
    except AvatarUploadError as error:
        raise HTTPException(error.status_code, str(error)) from error
    return _set_profile_avatar(username, kind, avatar_url)
