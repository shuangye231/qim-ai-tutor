import uuid
from datetime import datetime, timedelta

from backend.config import APP_TIMEZONE, FREE_DAILY_QUESTIONS
from backend.database import connect


class QuotaExceeded(Exception):
    pass


def _now() -> datetime:
    return datetime.now(APP_TIMEZONE)


def _restore_reservation(conn, row) -> None:
    if row["source"] == "daily":
        conn.execute(
            "UPDATE ai_daily_quota SET used = MAX(0, used - 1) WHERE username = ? AND usage_date = ?",
            (row["username"], row["usage_date"]),
        )
    elif row["grant_id"] is not None:
        conn.execute("UPDATE credit_grants SET remaining = remaining + 1 WHERE id = ?", (row["grant_id"],))


def _release_stale(conn, now: datetime) -> None:
    cutoff = (now - timedelta(minutes=30)).isoformat()
    rows = conn.execute(
        "SELECT * FROM quota_reservations WHERE status = 'reserved' AND created_at < ?",
        (cutoff,),
    ).fetchall()
    for row in rows:
        _restore_reservation(conn, row)
        conn.execute(
            "UPDATE quota_reservations SET status = 'released', updated_at = ? WHERE id = ?",
            (now.isoformat(), row["id"]),
        )


def get_quota(username: str) -> dict:
    now = _now()
    today = now.date().isoformat()
    conn = connect()
    used_row = conn.execute(
        "SELECT used FROM ai_daily_quota WHERE username = ? AND usage_date = ?",
        (username, today),
    ).fetchone()
    paid_row = conn.execute(
        "SELECT COALESCE(SUM(remaining), 0) AS remaining, MIN(expires_at) AS next_expiry "
        "FROM credit_grants WHERE username = ? AND remaining > 0 AND expires_at > ?",
        (username, now.isoformat()),
    ).fetchone()
    conn.close()
    daily_used = int(used_row["used"]) if used_row else 0
    daily_remaining = max(0, FREE_DAILY_QUESTIONS - daily_used)
    paid_remaining = int(paid_row["remaining"] or 0)
    return {
        "daily_limit": FREE_DAILY_QUESTIONS,
        "daily_used": daily_used,
        "daily_remaining": daily_remaining,
        "paid_remaining": paid_remaining,
        "total_remaining": daily_remaining + paid_remaining,
        "next_expiry": paid_row["next_expiry"],
    }


def list_account_quotas(institution_code: str = "", role: str = "") -> list[dict]:
    """Return non-developer accounts and their current available quota."""
    from backend.services.institutions import institution_usernames

    allowed = institution_usernames(institution_code, role)
    conn = connect()
    rows = conn.execute(
        "SELECT username, COALESCE(role, 'user') AS role FROM users "
        "WHERE COALESCE(role, 'user') != 'developer' ORDER BY username"
    ).fetchall()
    conn.close()
    return [
        {"username": row["username"], "role": row["role"], **get_quota(row["username"])}
        for row in rows
        if allowed is None or row["username"] in allowed
    ]


def set_account_quota(username: str, credits: int) -> dict:
    """Set an account's available managed credits to an exact amount."""
    username = str(username or "").strip()[:40]
    if not username:
        raise ValueError("账号不能为空")
    try:
        credits = int(credits)
    except (TypeError, ValueError) as error:
        raise ValueError("次数必须是整数") from error
    if not 0 <= credits <= 1_000_000:
        raise ValueError("次数需要在 0 到 1000000 之间")
    now = _now()
    expires_at = (now + timedelta(days=3650)).isoformat()
    conn = connect()
    try:
        if not conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            raise ValueError("账号不存在")
        conn.execute("BEGIN IMMEDIATE")
        reserved = {row["grant_id"] for row in conn.execute(
            "SELECT grant_id FROM quota_reservations WHERE username = ? AND status = 'reserved' AND grant_id IS NOT NULL",
            (username,),
        ).fetchall()}
        grants = conn.execute(
            "SELECT id FROM credit_grants WHERE username = ? AND remaining > 0 AND expires_at > ?",
            (username, now.isoformat()),
        ).fetchall()
        for grant in grants:
            if grant["id"] not in reserved:
                conn.execute("UPDATE credit_grants SET remaining = 0 WHERE id = ?", (grant["id"],))
        order_id = f"admin:{uuid.uuid4().hex}"
        conn.execute(
            "INSERT INTO credit_grants (order_id, username, total, remaining, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (order_id, username, credits, credits, expires_at, now.isoformat()),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"username": username, **get_quota(username)}


def reserve_question(username: str) -> str:
    now = _now()
    today = now.date().isoformat()
    reservation_id = uuid.uuid4().hex
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        _release_stale(conn, now)
        row = conn.execute(
            "SELECT used FROM ai_daily_quota WHERE username = ? AND usage_date = ?",
            (username, today),
        ).fetchone()
        used = int(row["used"]) if row else 0
        if used < FREE_DAILY_QUESTIONS:
            conn.execute(
                "INSERT INTO ai_daily_quota (username, usage_date, used) VALUES (?, ?, 1) "
                "ON CONFLICT(username, usage_date) DO UPDATE SET used = used + 1",
                (username, today),
            )
            source, grant_id = "daily", None
        else:
            grant = conn.execute(
                "SELECT id FROM credit_grants "
                "WHERE username = ? AND remaining > 0 AND expires_at > ? "
                "ORDER BY expires_at, id LIMIT 1",
                (username, now.isoformat()),
            ).fetchone()
            if not grant:
                raise QuotaExceeded
            conn.execute("UPDATE credit_grants SET remaining = remaining - 1 WHERE id = ?", (grant["id"],))
            source, grant_id = "paid", grant["id"]
        conn.execute(
            "INSERT INTO quota_reservations "
            "(id, username, source, grant_id, usage_date, status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?)",
            (reservation_id, username, source, grant_id, today, now.isoformat(), now.isoformat()),
        )
        conn.commit()
        return reservation_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def reserve_questions(username: str, count: int) -> list[str]:
    reservations: list[str] = []
    try:
        for _ in range(max(1, count)):
            reservations.append(reserve_question(username))
        return reservations
    except Exception:
        for reservation_id in reservations:
            release_question(reservation_id)
        raise


def confirm_questions(reservation_ids: list[str]) -> None:
    for reservation_id in reservation_ids:
        confirm_question(reservation_id)


def release_questions(reservation_ids: list[str]) -> None:
    for reservation_id in reservation_ids:
        release_question(reservation_id)


def confirm_question(reservation_id: str) -> None:
    conn = connect()
    conn.execute(
        "UPDATE quota_reservations SET status = 'succeeded', updated_at = ? "
        "WHERE id = ? AND status = 'reserved'",
        (_now().isoformat(), reservation_id),
    )
    conn.commit()
    conn.close()


def release_question(reservation_id: str) -> None:
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT * FROM quota_reservations WHERE id = ? AND status = 'reserved'",
            (reservation_id,),
        ).fetchone()
        if row:
            _restore_reservation(conn, row)
            conn.execute(
                "UPDATE quota_reservations SET status = 'released', updated_at = ? WHERE id = ?",
                (_now().isoformat(), reservation_id),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
