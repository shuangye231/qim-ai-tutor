import re
import uuid
from pathlib import Path

from fastapi import UploadFile

from backend.config import PROJECT_DIR


MAX_AVATAR_SIZE = 5 * 1024 * 1024
AVATAR_TYPES = {
    "image/jpeg": (".jpg", lambda raw: raw.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda raw: raw.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/gif": (".gif", lambda raw: raw.startswith((b"GIF87a", b"GIF89a"))),
    "image/webp": (".webp", lambda raw: len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"),
}


class AvatarUploadError(ValueError):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def remove_avatar_url(url: str) -> None:
    prefix = "/static/avatars/"
    if not str(url or "").startswith(prefix):
        return
    relative = str(url)[len(prefix):]
    target = (PROJECT_DIR / "static" / "avatars" / relative).resolve()
    root = (PROJECT_DIR / "static" / "avatars").resolve()
    if root not in target.parents:
        return
    target.unlink(missing_ok=True)


async def save_avatar(file: UploadFile, category: str, owner_key: str) -> str:
    if category not in {"users", "groups"}:
        raise ValueError("头像目录无效")
    content_type = str(file.content_type or "").lower()
    avatar_type = AVATAR_TYPES.get(content_type)
    if not avatar_type:
        raise AvatarUploadError(415, "头像仅支持 JPG、PNG、WebP 和 GIF")
    raw = await file.read(MAX_AVATAR_SIZE + 1)
    if not raw:
        raise AvatarUploadError(400, "头像文件不能为空")
    if len(raw) > MAX_AVATAR_SIZE:
        raise AvatarUploadError(413, "头像不能超过 5MB")
    suffix, matches_signature = avatar_type
    if not matches_signature(raw):
        raise AvatarUploadError(400, "图片内容与文件格式不匹配")

    safe_key = re.sub(r"[^A-Za-z0-9_-]", "-", owner_key)[:80] or "avatar"
    directory = PROJECT_DIR / "static" / "avatars" / category
    directory.mkdir(parents=True, exist_ok=True)
    for old_file in directory.glob(f"{safe_key}-*"):
        if old_file.is_file():
            old_file.unlink(missing_ok=True)
    filename = f"{safe_key}-{uuid.uuid4().hex[:12]}{suffix}"
    (directory / filename).write_bytes(raw)
    return f"/static/avatars/{category}/{filename}"
