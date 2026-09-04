import asyncio

from fastapi import APIRouter, Header, HTTPException

from backend.security import require_authenticated_user
from backend.services.compiler import CompilerUnavailable, run_cpp, run_python
from backend.services.courses import normalize_course_id


router = APIRouter(prefix="/api/compiler", tags=["compiler"])


@router.post("/run")
async def run_program(data: dict, x_session_token: str = Header(default="")):
    require_authenticated_user(str(data.get("username") or "").strip(), x_session_token)
    course_id = normalize_course_id(data.get("course_id", ""))
    if course_id not in {"cpp", "python"}:
        raise HTTPException(400, "当前接口仅用于 Python 和 C++ 编译")
    try:
        runner = run_python if course_id == "python" else run_cpp
        return await asyncio.to_thread(runner, data.get("source", ""), data.get("stdin", ""))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except CompilerUnavailable as error:
        raise HTTPException(503, str(error)) from error
