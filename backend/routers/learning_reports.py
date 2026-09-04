from fastapi import APIRouter, Header, HTTPException

from backend.security import require_authenticated_user
from backend.services.learning_reports import init_learning_report_db, mark_mistake_mastered, mastery_matrix, mistake_book, parent_report


router = APIRouter(prefix="/api/learning", tags=["learning-reports"])
init_learning_report_db()


@router.get("/mistake-book/{username}")
async def get_mistake_book(username: str, x_session_token: str = Header(default="")):
    username = require_authenticated_user(username, x_session_token)
    return mistake_book(username)


@router.post("/mistake-book/{username}/mastered")
async def complete_mistake(username: str, data: dict, x_session_token: str = Header(default="")):
    username = require_authenticated_user(username, x_session_token)
    try:
        mark_mistake_mastered(username, str(data.get("item_id") or ""))
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    return {"status": "ok"}


@router.get("/parent-report/{username}")
async def get_parent_report(username: str, x_session_token: str = Header(default="")):
    username = require_authenticated_user(username, x_session_token)
    return parent_report(username)


@router.get("/mastery/{username}")
async def get_mastery_matrix(username: str, x_session_token: str = Header(default="")):
    username = require_authenticated_user(username, x_session_token)
    return mastery_matrix(username)
