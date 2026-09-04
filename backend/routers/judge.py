import asyncio

from fastapi import APIRouter, Header, HTTPException

from backend.security import require_authenticated_user
from backend.services.compiler import CompilerUnavailable
from backend.services.judge import (
    contest_analytics,
    contest_leaderboard,
    contest_progress,
    init_judge_db,
    judge_submission,
    oj_leaderboard,
    record_oj_completion,
    set_contest_grade,
    set_contest_problem_grade,
)
from backend.security import session_user


router = APIRouter(prefix="/api/oj", tags=["judge"])
init_judge_db()


@router.post("/submit")
async def submit_contest_problem(data: dict, x_session_token: str = Header(default="")):
    username = require_authenticated_user(str(data.get("username") or "").strip(), x_session_token)
    try:
        submission = await asyncio.to_thread(
            judge_submission,
            str(data.get("contest_id") or "").strip(),
            str(data.get("problem_id") or "").strip(),
            username,
            data.get("source", ""),
        )
    except PermissionError as error:
        raise HTTPException(403, str(error)) from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except CompilerUnavailable as error:
        raise HTTPException(503, str(error)) from error
    return {"status": "ok", "submission": submission}


@router.get("/progress")
async def get_contest_progress(username: str, contest_id: str, x_session_token: str = Header(default="")):
    username = require_authenticated_user(username, x_session_token)
    return contest_progress(username, contest_id)


@router.post("/complete")
async def complete_oj_problem(data: dict, x_session_token: str = Header(default="")):
    username = require_authenticated_user(str(data.get("username") or "").strip(), x_session_token)
    try:
        return {"status": "ok", "completion": record_oj_completion(username, str(data.get("problem_id") or "").strip(), int(data.get("points") or 0))}
    except (TypeError, ValueError) as error:
        raise HTTPException(400, str(error)) from error


@router.get("/leaderboard")
async def get_oj_leaderboard(x_session_token: str = Header(default="")):
    session_user(x_session_token)
    return {"students": oj_leaderboard()}


@router.get("/contests/{contest_id}/leaderboard")
async def get_contest_leaderboard(contest_id: str, username: str, x_session_token: str = Header(default="")):
    user = session_user(x_session_token)
    if user["username"] != username:
        raise HTTPException(401, "登录已失效，请重新登录")
    try:
        return contest_leaderboard(contest_id, username, user["role"])
    except PermissionError as error:
        raise HTTPException(403, str(error)) from error
    except ValueError as error:
        raise HTTPException(404, str(error)) from error


@router.put("/teacher/contests/{contest_id}/grades/{student}")
async def update_contest_grade(contest_id: str, student: str, data: dict, username: str, x_session_token: str = Header(default="")):
    user = session_user(x_session_token)
    if user["username"] != username or user["role"] != "teacher":
        raise HTTPException(403, "仅本场周赛教师可以评分")
    try:
        score = int(data.get("score"))
        return {"status": "ok", "grade": set_contest_grade(username, contest_id, student, score)}
    except (TypeError, ValueError) as error:
        raise HTTPException(400, "评分必须是 0 到 100 的整数") from error


@router.put("/teacher/contests/{contest_id}/grades/{student}/problems/{problem_id}")
async def update_contest_problem_grade(contest_id: str, student: str, problem_id: str, data: dict, username: str, x_session_token: str = Header(default="")):
    user = session_user(x_session_token)
    if user["username"] != username or user["role"] != "teacher":
        raise HTTPException(403, "仅本场比赛教师可以批改")
    try:
        return {"status": "ok", "grade": set_contest_problem_grade(username, contest_id, student, problem_id, int(data.get("score")), data.get("feedback", ""))}
    except (TypeError, ValueError) as error:
        raise HTTPException(400, str(error)) from error


@router.get("/teacher/contests/{contest_id}/analytics")
async def get_contest_analytics(contest_id: str, username: str, x_session_token: str = Header(default="")):
    user = session_user(x_session_token)
    if user["username"] != username or user["role"] != "teacher":
        raise HTTPException(403, "仅教师或机构账号可以查看周赛分析")
    try:
        return contest_analytics(username, contest_id)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
