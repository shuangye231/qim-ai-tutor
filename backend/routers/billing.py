from fastapi import APIRouter, Header, HTTPException

from backend.config import PAYMENT_PROVIDER
from backend.security import session_user
from backend.services.payment import complete_mock_payment, create_order, get_order, public_plans
from backend.services.quota import get_quota


router = APIRouter(prefix="/api/billing", tags=["billing"])


def _username(token: str) -> str:
    return session_user(token)["username"]


@router.get("/plans")
async def plans():
    return {"plans": public_plans(), "payment_provider": PAYMENT_PROVIDER}


@router.get("/quota")
async def quota(x_session_token: str = Header(default="")):
    return get_quota(_username(x_session_token))


@router.post("/orders")
async def new_order(data: dict, x_session_token: str = Header(default="")):
    try:
        return create_order(_username(x_session_token), data.get("plan_code", ""), data.get("channel", ""))
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.get("/orders/{order_id}")
async def order(order_id: str, x_session_token: str = Header(default="")):
    result = get_order(order_id, _username(x_session_token))
    if not result:
        raise HTTPException(404, "订单不存在")
    return result


@router.post("/orders/{order_id}/mock-pay")
async def mock_pay(order_id: str, x_session_token: str = Header(default="")):
    try:
        result = complete_mock_payment(order_id, _username(x_session_token))
        return {"status": "ok", "order": result}
    except LookupError as error:
        raise HTTPException(404, str(error)) from error
    except (RuntimeError, ValueError) as error:
        raise HTTPException(400, str(error)) from error
