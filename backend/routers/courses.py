from fastapi import APIRouter, Header, HTTPException

from backend.security import require_authenticated_user
from backend.services.courses import get_course_progress, normalize_course_id, toggle_course_step


router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("/{course_id}/progress/{username}")
async def course_progress(course_id: str, username: str, x_session_token: str = Header(default="")):
    username = require_authenticated_user(username, x_session_token)
    course_id = normalize_course_id(course_id)
    return {"course_id": course_id, "completed": get_course_progress(username, course_id)}


@router.post("/progress/toggle")
async def toggle_progress(data: dict, x_session_token: str = Header(default="")):
    username = require_authenticated_user(data.get("username", "").strip(), x_session_token)
    course_id = normalize_course_id(data.get("course_id", ""))
    try:
        completed = toggle_course_step(username, course_id, data.get("step_id", ""))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "course_id": course_id, "completed": completed}
