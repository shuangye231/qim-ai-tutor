import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from backend.config import PROJECT_DIR

from backend.security import session_user
from backend.services.classes import (
    create_class,
    init_class_db,
    join_class,
    list_student_classes,
    list_teacher_classes,
    class_members,
    create_class_message,
    init_class_chat_db,
    list_class_messages,
    leave_class,
    member_is_muted,
    remove_class_member,
    set_member_muted,
    student_in_class,
    teacher_owns_class,
    update_class_settings,
    archive_class,
    update_class_avatar,
    member_in_class,
    list_private_messages,
    create_private_message,
)
from backend.services.avatars import AvatarUploadError, save_avatar


router = APIRouter(prefix="/api", tags=["classes"])
init_class_db()
init_class_chat_db()
CLASS_MEDIA_DIR = PROJECT_DIR / "static" / "class-media"
CLASS_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
CLASS_EMOJI_DIR = PROJECT_DIR / "static" / "class-emojis"
CLASS_EMOJI_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
ALLOWED_FILE_SUFFIXES = {
    ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2",
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".csv", ".md", ".txt", ".py", ".c", ".cpp", ".java", ".js", ".ts", ".json",
}


def _user(username: str, token: str) -> dict:
    user = session_user(token)
    if user["username"] != username:
        raise HTTPException(401, "登录已失效，请重新登录")
    return user


def _teacher(username: str, token: str) -> dict:
    user = _user(username, token)
    if user["role"] != "teacher":
        raise HTTPException(403, "仅教师或机构账号可以管理班级")
    return user


@router.get("/teacher/classes")
async def teacher_classes(username: str, x_session_token: str = Header(default="")):
    user = _teacher(username, x_session_token)
    return {"classes": list_teacher_classes(user["username"])}


@router.post("/teacher/classes")
async def create_teacher_class(data: dict, x_session_token: str = Header(default="")):
    user = _teacher(str(data.get("username") or ""), x_session_token)
    try:
        result = create_class(user["username"], data.get("name", ""))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "class": result}


@router.get("/classes")
async def my_classes(username: str, x_session_token: str = Header(default="")):
    user = _user(username, x_session_token)
    classes = list_teacher_classes(user["username"]) if user["role"] == "teacher" else list_student_classes(user["username"])
    return {"classes": classes}


@router.post("/classes/join")
async def join_student_class(data: dict, x_session_token: str = Header(default="")):
    user = _user(str(data.get("username") or ""), x_session_token)
    if user["role"] != "user":
        raise HTTPException(400, "教师账号无需通过邀请码加入班级")
    try:
        result = join_class(user["username"], data.get("invite_code", ""))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "class": result}


def _class_access(username: str, token: str, class_id: str) -> dict:
    user = _user(username, token)
    allowed = teacher_owns_class(username, class_id) if user["role"] == "teacher" else student_in_class(username, class_id)
    if not allowed:
        raise HTTPException(403, "你不是这个班级的成员")
    return user


@router.get("/classes/{class_id}/chat")
async def class_chat(class_id: str, username: str, x_session_token: str = Header(default="")):
    _class_access(username, x_session_token, class_id)
    return {"members": class_members(class_id), "messages": list_class_messages(class_id)}


@router.put("/classes/{class_id}/settings")
async def update_class_group_settings(class_id: str, data: dict, x_session_token: str = Header(default="")):
    user = _teacher(str(data.get("username") or ""), x_session_token)
    try:
        result = update_class_settings(user["username"], class_id, data.get("name", ""), data.get("announcement", ""))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "class": result}


@router.delete("/classes/{class_id}")
async def archive_class_group(class_id: str, username: str, x_session_token: str = Header(default="")):
    user = _teacher(username, x_session_token)
    try:
        archive_class(user["username"], class_id)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok"}


@router.post("/classes/{class_id}/avatar")
async def upload_class_avatar(
    class_id: str,
    username: str = Form(...),
    file: UploadFile = File(...),
    x_session_token: str = Header(default=""),
):
    user = _teacher(username, x_session_token)
    if not teacher_owns_class(user["username"], class_id):
        raise HTTPException(403, "班级不存在或无权管理")
    try:
        avatar_url = await save_avatar(file, "groups", class_id)
        result = update_class_avatar(user["username"], class_id, avatar_url)
    except AvatarUploadError as error:
        raise HTTPException(error.status_code, str(error)) from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "class": result}


@router.put("/classes/{class_id}/members/{member_username}/mute")
async def mute_class_member(class_id: str, member_username: str, data: dict, x_session_token: str = Header(default="")):
    user = _teacher(str(data.get("username") or ""), x_session_token)
    try:
        set_member_muted(user["username"], class_id, member_username, bool(data.get("muted")))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok"}


@router.delete("/classes/{class_id}/members/{member_username}")
async def delete_class_member(class_id: str, member_username: str, username: str, x_session_token: str = Header(default="")):
    user = _teacher(username, x_session_token)
    try:
        remove_class_member(user["username"], class_id, member_username)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok"}


@router.delete("/classes/{class_id}/leave")
async def leave_class_group(class_id: str, username: str, x_session_token: str = Header(default="")):
    user = _user(username, x_session_token)
    if user["role"] != "user":
        raise HTTPException(400, "群主不能退出自己的班级")
    try:
        leave_class(user["username"], class_id)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok"}


@router.post("/classes/{class_id}/chat")
async def send_class_chat(class_id: str, data: dict, x_session_token: str = Header(default="")):
    user = _class_access(str(data.get("username") or ""), x_session_token, class_id)
    kind = str(data.get("kind") or "message")
    if kind == "notice" and user["role"] != "teacher":
        raise HTTPException(403, "只有老师可以发布通知")
    if user["role"] != "teacher" and member_is_muted(class_id, user["username"]):
        raise HTTPException(403, "你已被老师禁言，暂时不能发送消息")
    try:
        message = create_class_message(class_id, user["username"], data.get("content", ""), kind)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "message": message}


@router.post("/classes/{class_id}/media")
async def send_class_media(
    class_id: str,
    username: str = Form(...),
    content: str = Form(default=""),
    file: UploadFile = File(...),
    x_session_token: str = Header(default=""),
):
    user = _class_access(username, x_session_token, class_id)
    if user["role"] != "teacher" and member_is_muted(class_id, user["username"]):
        raise HTTPException(403, "你已被老师禁言，暂时不能发送文件")
    content_type = str(file.content_type or "").lower()
    suffix = Path(file.filename or "media").suffix.lower()
    if content_type in ALLOWED_IMAGE_TYPES:
        media_type, max_size = "image", 15 * 1024 * 1024
    elif content_type in ALLOWED_VIDEO_TYPES:
        media_type, max_size = "video", 100 * 1024 * 1024
    elif suffix in ALLOWED_FILE_SUFFIXES:
        media_type, max_size = "file", 100 * 1024 * 1024
    else:
        raise HTTPException(415, "支持图片、视频、压缩包及 PDF、Word、PPT、Excel、MD 等常用文件")
    raw = await file.read(max_size + 1)
    if len(raw) > max_size:
        raise HTTPException(413, "图片不能超过 15MB，视频不能超过 100MB")
    suffix = suffix[:10]
    stored_name = f"{class_id}-{uuid.uuid4().hex}{suffix}"
    (CLASS_MEDIA_DIR / stored_name).write_bytes(raw)
    message = create_class_message(
        class_id,
        user["username"],
        content,
        media={"url": f"/static/class-media/{stored_name}", "name": Path(file.filename or "媒体文件").name[:160], "type": media_type},
    )
    return {"status": "ok", "message": message}


@router.get("/classes/{class_id}/direct/{peer_username}")
async def direct_messages(class_id: str, peer_username: str, username: str, x_session_token: str = Header(default="")):
    _class_access(username, x_session_token, class_id)
    if not member_in_class(peer_username, class_id):
        raise HTTPException(404, "这位成员不在当前班级")
    return {"messages": list_private_messages(class_id, username, peer_username), "peer": peer_username}


@router.post("/classes/{class_id}/direct/{peer_username}")
async def send_direct_message(class_id: str, peer_username: str, data: dict, x_session_token: str = Header(default="")):
    user = _class_access(str(data.get("username") or ""), x_session_token, class_id)
    if not member_in_class(peer_username, class_id):
        raise HTTPException(404, "这位成员不在当前班级")
    if user["role"] != "teacher" and member_is_muted(class_id, user["username"]):
        raise HTTPException(403, "你已被老师禁言，暂时不能发送消息")
    try:
        message = create_private_message(class_id, user["username"], peer_username, data.get("content", ""))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "message": message}


@router.post("/classes/{class_id}/direct/{peer_username}/media")
async def send_direct_media(
    class_id: str,
    peer_username: str,
    username: str = Form(...),
    content: str = Form(default=""),
    file: UploadFile = File(...),
    x_session_token: str = Header(default=""),
):
    user = _class_access(username, x_session_token, class_id)
    if not member_in_class(peer_username, class_id):
        raise HTTPException(404, "这位成员不在当前班级")
    if user["role"] != "teacher" and member_is_muted(class_id, user["username"]):
        raise HTTPException(403, "你已被老师禁言，暂时不能发送文件")
    content_type = str(file.content_type or "").lower()
    suffix = Path(file.filename or "media").suffix.lower()
    if content_type in ALLOWED_IMAGE_TYPES:
        media_type, max_size = "image", 15 * 1024 * 1024
    elif content_type in ALLOWED_VIDEO_TYPES:
        media_type, max_size = "video", 100 * 1024 * 1024
    elif suffix in ALLOWED_FILE_SUFFIXES:
        media_type, max_size = "file", 100 * 1024 * 1024
    else:
        raise HTTPException(415, "支持图片、视频、压缩包及 PDF、Word、PPT、Excel、MD 等常用文件")
    raw = await file.read(max_size + 1)
    if len(raw) > max_size:
        raise HTTPException(413, "图片不能超过 15MB，视频不能超过 100MB")
    suffix = suffix[:10]
    stored_name = f"private-{class_id}-{uuid.uuid4().hex}{suffix}"
    (CLASS_MEDIA_DIR / stored_name).write_bytes(raw)
    try:
        message = create_private_message(class_id, user["username"], peer_username, content, "message", {"url": f"/static/class-media/{stored_name}", "name": Path(file.filename or "媒体文件").name[:160], "type": media_type})
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "message": message}


async def _save_emoji(file: UploadFile, class_id: str) -> dict:
    content_type = str(file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, "自定义表情仅支持 JPG、PNG、WebP 和 GIF")
    raw = await file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "表情图片不能超过 5MB")
    suffix = Path(file.filename or "emoji").suffix.lower()[:10]
    stored_name = f"{class_id}-{uuid.uuid4().hex}{suffix}"
    (CLASS_EMOJI_DIR / stored_name).write_bytes(raw)
    return {"url": f"/static/class-emojis/{stored_name}", "name": Path(file.filename or "自定义表情").name[:160], "type": "emoji"}


@router.post("/classes/{class_id}/emoji")
async def send_group_emoji(
    class_id: str,
    username: str = Form(...),
    content: str = Form(default=""),
    file: UploadFile = File(...),
    x_session_token: str = Header(default=""),
):
    user = _class_access(username, x_session_token, class_id)
    if user["role"] != "teacher" and member_is_muted(class_id, user["username"]):
        raise HTTPException(403, "你已被老师禁言，暂时不能发送表情")
    media = await _save_emoji(file, class_id)
    message = create_class_message(class_id, user["username"], content, "emoji", media)
    return {"status": "ok", "message": message}


@router.post("/classes/{class_id}/direct/{peer_username}/emoji")
async def send_direct_emoji(
    class_id: str,
    peer_username: str,
    username: str = Form(...),
    content: str = Form(default=""),
    file: UploadFile = File(...),
    x_session_token: str = Header(default=""),
):
    user = _class_access(username, x_session_token, class_id)
    if not member_in_class(peer_username, class_id):
        raise HTTPException(404, "这位成员不在当前班级")
    if user["role"] != "teacher" and member_is_muted(class_id, user["username"]):
        raise HTTPException(403, "你已被老师禁言，暂时不能发送表情")
    media = await _save_emoji(file, class_id)
    try:
        message = create_private_message(class_id, user["username"], peer_username, content, "emoji", media)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "message": message}
