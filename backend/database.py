import sqlite3

from backend.config import DB_PATH


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_commerce_db() -> None:
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS billing_orders (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            plan_code TEXT NOT NULL,
            channel TEXT NOT NULL,
            amount_fen INTEGER NOT NULL,
            credits INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            paid_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_billing_orders_user
            ON billing_orders(username, created_at DESC);

        CREATE TABLE IF NOT EXISTS credit_grants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL,
            total INTEGER NOT NULL,
            remaining INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_credit_grants_active
            ON credit_grants(username, expires_at, remaining);

        CREATE TABLE IF NOT EXISTS ai_daily_quota (
            username TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (username, usage_date)
        );

        CREATE TABLE IF NOT EXISTS quota_reservations (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            source TEXT NOT NULL,
            grant_id INTEGER,
            usage_date TEXT,
            status TEXT NOT NULL DEFAULT 'reserved',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()
