import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from backend.config import PROJECT_DIR

from backend.security import session_user
from backend.services.assignments import (
    create_assignment,
    get_assignment,
    grade_submission,
    init_assignment_db,
    list_assignments,
    list_submissions,
    remind_assignment,
    submit_assignment,
)


router = APIRouter(prefix="/api/assignments", tags=["assignments"])
init_assignment_db()
SUBMISSION_DIR = PROJECT_DIR / "static" / "assignment-submissions"
SUBMISSION_DIR.mkdir(parents=True, exist_ok=True)


def _user(username: str, token: str) -> dict:
    user = session_user(token)
    if user["username"] != username:
        raise HTTPException(401, "登录已失效，请重新登录")
    return user


@router.get("")
async def assignments(username: str, class_id: str | None = None, x_session_token: str = Header(default="")):
    user = _user(username, x_session_token)
    return {"assignments": list_assignments(username, user["role"], class_id)}


@router.post("")
async def create(data: dict, x_session_token: str = Header(default="")):
    user = _user(str(data.get("username") or ""), x_session_token)
    if user["role"] != "teacher":
        raise HTTPException(403, "只有老师可以布置作业")
    try:
        result = create_assignment(user["username"], str(data.get("class_id") or ""), data.get("title"), data.get("instructions"), data.get("due_at"), data.get("questions"), data.get("course_id"))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "assignment": result}


@router.get("/{assignment_id}")
async def detail(assignment_id: str, username: str, x_session_token: str = Header(default="")):
    user = _user(username, x_session_token)
    try:
        return {"assignment": get_assignment(username, user["role"], assignment_id)}
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@router.post("/{assignment_id}/submit")
async def submit(assignment_id: str, data: dict, x_session_token: str = Header(default="")):
    user = _user(str(data.get("username") or ""), x_session_token)
    if user["role"] != "user":
        raise HTTPException(403, "只有学生可以提交作业")
    try:
        return {"status": "ok", "submission": submit_assignment(user["username"], assignment_id, data.get("answers") or {})}
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.post("/{assignment_id}/remind")
async def remind(assignment_id: str, data: dict, x_session_token: str = Header(default="")):
    user = _user(str(data.get("username") or ""), x_session_token)
    if user["role"] != "teacher":
        raise HTTPException(403, "只有老师可以提醒作业")
    try:
        return remind_assignment(user["username"], assignment_id)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.get("/{assignment_id}/submissions")
async def submissions(assignment_id: str, username: str, x_session_token: str = Header(default="")):
    user = _user(username, x_session_token)
    if user["role"] != "teacher":
        raise HTTPException(403, "只有老师可以查看提交")
    try:
        return {"submissions": list_submissions(username, assignment_id)}
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@router.put("/{assignment_id}/submissions/{student}/grade")
async def grade(assignment_id: str, student: str, data: dict, x_session_token: str = Header(default="")):
    user = _user(str(data.get("username") or ""), x_session_token)
    if user["role"] != "teacher":
        raise HTTPException(403, "只有老师可以批改作业")
    try:
        return {"submission": grade_submission(user["username"], assignment_id, student, data.get("score"), data.get("total"), data.get("feedback"))}
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.post("/{assignment_id}/scratch-project")
async def upload_scratch_project(
    assignment_id: str,
    username: str = Form(...),
    question_id: str = Form(...),
    file: UploadFile = File(...),
    x_session_token: str = Header(default=""),
):
    user = _user(username, x_session_token)
    if user["role"] != "user":
        raise HTTPException(403, "只有学生可以提交 Scratch 项目")
    try:
        assignment = get_assignment(username, user["role"], assignment_id)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    if assignment.get("course_id") != "scratch":
        raise HTTPException(400, "这不是 Scratch 作业")
    if Path(file.filename or "").suffix.lower() != ".sb3":
        raise HTTPException(400, "请选择 Scratch 的 .sb3 项目文件")
    content = await file.read()
    if not content or len(content) > 20 * 1024 * 1024:
        raise HTTPException(400, "Scratch 项目不能为空且不能超过 20MB")
    stored_name = f"{assignment_id}-{username[:40]}-{question_id[:40]}-{uuid.uuid4().hex[:8]}.sb3"
    (SUBMISSION_DIR / stored_name).write_bytes(content)
    return {"url": f"/static/assignment-submissions/{stored_name}", "name": Path(file.filename or "project.sb3").name}
