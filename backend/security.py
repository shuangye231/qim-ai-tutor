import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException

from backend.database import connect


PASSWORD_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return "$".join(
        (
            "pbkdf2_sha256",
            str(PASSWORD_ITERATIONS),
            base64.urlsafe_b64encode(salt).decode(),
            base64.urlsafe_b64encode(digest).decode(),
        )
    )


def verify_password(password: str, encoded: str) -> bool:
    if encoded.startswith("pbkdf2_sha256$"):
        try:
            _, iterations, salt, expected = encoded.split("$", 3)
            digest = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode(),
                base64.urlsafe_b64decode(salt),
                int(iterations),
            )
            return hmac.compare_digest(base64.urlsafe_b64encode(digest).decode(), expected)
        except (TypeError, ValueError):
            return False
    legacy = hashlib.sha256(password.encode()).hexdigest()
    return hmac.compare_digest(legacy, encoded)


def password_needs_upgrade(encoded: str) -> bool:
    return not encoded.startswith("pbkdf2_sha256$")


def hash_api_key(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def create_user_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    conn = connect()
    conn.execute("DELETE FROM user_sessions WHERE expires_at < ?", (now.isoformat(),))
    conn.execute(
        "INSERT INTO user_sessions (token_hash, username, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (hash_api_key(token), username[:40], (now + timedelta(days=30)).isoformat(), now.isoformat()),
    )
    conn.commit()
    conn.close()
    return token


def session_user(session_token: str) -> dict:
    if not session_token:
        raise HTTPException(401, "登录已失效，请重新登录")
    conn = connect()
    row = conn.execute(
        "SELECT s.username, s.expires_at, COALESCE(u.role, 'user') AS role "
        "FROM user_sessions s JOIN users u ON u.username = s.username "
        "WHERE s.token_hash = ?",
        (hash_api_key(session_token),),
    ).fetchone()
    conn.close()
    if not row or row["expires_at"] < datetime.now().isoformat():
        raise HTTPException(401, "登录已失效，请重新登录")
    return {"username": row["username"], "role": row["role"]}


def require_authenticated_user(username: str, session_token: str) -> str:
    user = session_user(session_token)
    if not username or user["username"] != username[:40]:
        raise HTTPException(401, "登录已失效，请重新登录")
    return user["username"]


def require_admin(admin_key: str) -> None:
    configured = os.getenv("ADMIN_API_KEY", "").strip()
    if not configured or not secrets.compare_digest(admin_key or "", configured):
        raise HTTPException(403, "管理员密钥无效或未配置")
