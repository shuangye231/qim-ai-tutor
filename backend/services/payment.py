import uuid
from datetime import datetime, timedelta

from backend.config import APP_TIMEZONE, PAYMENT_PROVIDER, PLANS
from backend.database import connect


def _now() -> datetime:
    return datetime.now(APP_TIMEZONE)


def public_plans() -> list[dict]:
    return [
        {
            **plan,
            "amount_yuan": plan["amount_fen"] / 100,
        }
        for plan in PLANS.values()
    ]


def create_order(username: str, plan_code: str, channel: str) -> dict:
    plan = PLANS.get(plan_code)
    if not plan:
        raise ValueError("套餐不存在")
    if channel not in {"wechat", "alipay"}:
        raise ValueError("请选择微信支付或支付宝")
    order_id = uuid.uuid4().hex
    now = _now().isoformat()
    conn = connect()
    conn.execute(
        "INSERT INTO billing_orders "
        "(id, username, plan_code, channel, amount_fen, credits, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
        (order_id, username, plan_code, channel, plan["amount_fen"], plan["credits"], now),
    )
    conn.commit()
    conn.close()
    return get_order(order_id, username)


def get_order(order_id: str, username: str) -> dict | None:
    conn = connect()
    row = conn.execute(
        "SELECT * FROM billing_orders WHERE id = ? AND username = ?",
        (order_id, username),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def complete_mock_payment(order_id: str, username: str) -> dict:
    if PAYMENT_PROVIDER != "mock":
        raise RuntimeError("模拟支付未启用")
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM billing_orders WHERE id = ? AND username = ?",
            (order_id, username),
        ).fetchone()
        if not row:
            raise LookupError("订单不存在")
        if row["status"] == "paid":
            conn.commit()
            return dict(row)
        if row["status"] != "pending":
            raise ValueError("订单状态不可支付")
        now = _now()
        expires_at = (now + timedelta(days=PLANS[row["plan_code"]]["valid_days"])).isoformat()
        conn.execute(
            "UPDATE billing_orders SET status = 'paid', paid_at = ? WHERE id = ?",
            (now.isoformat(), order_id),
        )
        conn.execute(
            "INSERT INTO credit_grants "
            "(order_id, username, total, remaining, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (order_id, username, row["credits"], row["credits"], expires_at, now.isoformat()),
        )
        conn.commit()
        return get_order(order_id, username)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
