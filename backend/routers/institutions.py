from fastapi import APIRouter, Header, HTTPException
from openai import OpenAI

import rag_engine

from backend.database import connect
from backend.security import session_user
from backend.services.account_deletion import delete_user_account
from backend.services.institutions import create_institution, list_institutions, set_institution_active
from backend.services.quota import list_account_quotas, set_account_quota
from backend.services.user_ai_keys import clear_user_ai_key, list_user_ai_keys, set_user_ai_key
from backend.services.ai_settings import (
    DEFAULT_SCOPE,
    clear_ai_settings,
    get_ai_settings,
    has_ai_settings,
    resolve_ai_settings,
    set_ai_settings,
)


router = APIRouter(prefix="/api/developer/institutions", tags=["institutions"])


def _developer(token: str) -> dict:
    user = session_user(token)
    if user["role"] != "developer":
        raise HTTPException(403, "仅开发者可以管理机构代码")
    return user


@router.get("")
async def developer_institutions(x_session_token: str = Header(default="")):
    _developer(x_session_token)
    return {"institutions": list_institutions()}


@router.post("")
async def add_institution(data: dict, x_session_token: str = Header(default="")):
    developer = _developer(x_session_token)
    try:
        institution = create_institution(data.get("name", ""), data.get("code", ""), developer["username"])
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "institution": institution}


@router.put("/{code}/status")
async def change_institution_status(code: str, data: dict, x_session_token: str = Header(default="")):
    _developer(x_session_token)
    try:
        institution = set_institution_active(code, bool(data.get("active")))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    if not institution:
        raise HTTPException(404, "机构代码不存在")
    return {"status": "ok", "institution": institution}


@router.get("/accounts")
async def developer_accounts(
    institution_code: str = "",
    role: str = "",
    x_session_token: str = Header(default=""),
):
    _developer(x_session_token)
    return {"accounts": list_account_quotas(institution_code, role)}


@router.get("/accounts/manage")
async def developer_manage_accounts(
    institution_code: str = "",
    role: str = "",
    x_session_token: str = Header(default=""),
):
    _developer(x_session_token)
    from backend.services.institutions import institution_usernames

    allowed = institution_usernames(institution_code, role)
    conn = connect()
    rows = conn.execute(
        "SELECT username, COALESCE(role, 'user') AS role, institution_code, created_at "
        "FROM users WHERE COALESCE(role, 'user') != 'developer' ORDER BY role, username"
    ).fetchall()
    conn.close()
    return {"accounts": [dict(row) for row in rows if allowed is None or row["username"] in allowed]}


@router.delete("/accounts/{username}")
async def developer_delete_account(
    username: str,
    institution_code: str = "",
    x_session_token: str = Header(default=""),
):
    developer = _developer(x_session_token)
    try:
        from backend.services.institutions import require_institution_account

        require_institution_account(institution_code, username)
        account = delete_user_account(
            username,
            actor_username=developer["username"],
            actor_role=developer["role"],
        )
    except PermissionError as error:
        raise HTTPException(403, str(error)) from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "message": "账号已注销", "account": account}


@router.put("/accounts/{username}/quota")
async def developer_account_quota(username: str, data: dict, x_session_token: str = Header(default="")):
    _developer(x_session_token)
    try:
        from backend.services.institutions import require_institution_account

        require_institution_account(str(data.get("institution_code") or ""), username)
        return {"status": "ok", "account": set_account_quota(username, data.get("credits"))}
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.get("/ai-keys")
async def developer_ai_keys(
    institution_code: str = "",
    role: str = "",
    x_session_token: str = Header(default=""),
):
    _developer(x_session_token)
    return {"accounts": list_user_ai_keys(institution_code, role)}


@router.get("/ai-settings/default")
async def developer_default_ai_settings(x_session_token: str = Header(default="")):
    _developer(x_session_token)
    return {"settings": get_ai_settings(DEFAULT_SCOPE)}


@router.put("/ai-settings/default")
async def developer_set_default_ai_settings(data: dict, x_session_token: str = Header(default="")):
    _developer(x_session_token)
    try:
        settings = set_ai_settings(DEFAULT_SCOPE, data)
        rag_engine.reset_llm_client()
        return {"status": "ok", "settings": settings}
    except (TypeError, ValueError) as error:
        raise HTTPException(400, str(error)) from error


@router.get("/ai-settings/accounts/{username}")
async def developer_account_ai_settings(
    username: str,
    institution_code: str = "",
    x_session_token: str = Header(default=""),
):
    _developer(x_session_token)
    from backend.services.institutions import require_institution_account

    try:
        require_institution_account(institution_code, username)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    settings = resolve_ai_settings(username)
    return {"settings": settings, "has_custom_settings": has_ai_settings(username)}


@router.put("/ai-settings/accounts/{username}")
async def developer_set_account_ai_settings(username: str, data: dict, x_session_token: str = Header(default="")):
    _developer(x_session_token)
    try:
        from backend.services.institutions import require_institution_account

        require_institution_account(str(data.get("institution_code") or ""), username)
        api_key = str(data.get("api_key") or "").strip()
        if not api_key:
            raise ValueError("API Key 不能为空")
        set_user_ai_key(username, api_key)
        settings = set_ai_settings(username, data)
        rag_engine.reset_llm_client()
        return {"status": "ok", "settings": settings}
    except (TypeError, ValueError) as error:
        raise HTTPException(400, str(error)) from error


@router.post("/ai-settings/test")
async def developer_test_ai_settings(data: dict, x_session_token: str = Header(default="")):
    _developer(x_session_token)
    try:
        candidate = set_ai_settings("__connection_test__", data)
        client = OpenAI(api_key=candidate["api_key"], base_url=candidate["api_url"], timeout=25.0, max_retries=0)
        request_options = {
            "temperature": candidate["temperature"],
            "top_p": candidate["top_p"],
            "max_tokens": candidate["max_tokens"] or 16,
        }
        for key, value in candidate.get("extra", {}).items():
            if key not in {"model", "messages", "stream"}:
                request_options[key] = value
        response = client.chat.completions.create(
            model=candidate["model"],
            messages=[{"role": "user", "content": "只回复：连接成功"}],
            **request_options,
        )
        reply = str(response.choices[0].message.content or "").strip()
        return {"status": "ok", "message": "API 连接成功", "reply": reply, "model": candidate["model"]}
    except Exception as error:
        detail = str(error).replace(str(data.get("api_key") or ""), "***")
        raise HTTPException(400, f"API 连接失败：{detail[:300]}") from error
    finally:
        try:
            clear_ai_settings("__connection_test__")
        except Exception:
            pass


@router.put("/ai-keys/{username}")
async def developer_set_ai_key(username: str, data: dict, x_session_token: str = Header(default="")):
    _developer(x_session_token)
    try:
        from backend.services.institutions import require_institution_account

        require_institution_account(str(data.get("institution_code") or ""), username)
        return {"status": "ok", "account": set_user_ai_key(username, data.get("api_key", ""))}
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.delete("/ai-keys/{username}")
async def developer_clear_ai_key(
    username: str,
    institution_code: str = "",
    x_session_token: str = Header(default=""),
):
    _developer(x_session_token)
    try:
        from backend.services.institutions import require_institution_account

        require_institution_account(institution_code, username)
        clear_user_ai_key(username)
        clear_ai_settings(username)
        rag_engine.reset_llm_client()
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {"status": "ok", "message": "已恢复使用服务器默认 Key"}
