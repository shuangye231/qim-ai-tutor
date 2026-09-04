"""Persisted AI endpoint settings managed by the developer console."""

import json
from datetime import datetime

from backend.database import connect
import os


DEFAULT_SCOPE = "__default__"


def _env_defaults() -> dict:
    return {
        "api_url": os.getenv("CLOUD_BASE_URL", "https://api.ccode.vip/v1").strip(),
        "api_key": os.getenv("CCODE_API_KEY", "") or os.getenv("PRO_API_KEY", ""),
        "model": os.getenv("AI_MODEL", "glm-5.2-free").strip(),
        "temperature": 0.7,
        "max_tokens": 0,
        "top_p": 1.0,
        "extra": {},
    }


def init_ai_settings_db() -> None:
    conn = connect()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_settings (
            scope TEXT PRIMARY KEY,
            api_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            model TEXT NOT NULL,
            temperature REAL NOT NULL DEFAULT 0.7,
            max_tokens INTEGER NOT NULL DEFAULT 0,
            top_p REAL NOT NULL DEFAULT 1.0,
            extra_json TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _normalize(value: dict | None, fallback: dict | None = None) -> dict:
    base = dict(fallback or _env_defaults())
    if value:
        for key in ("api_url", "api_key", "model"):
            if value.get(key) is not None:
                base[key] = str(value[key]).strip()
        for key in ("temperature", "top_p"):
            if value.get(key) is not None:
                base[key] = float(value[key])
        if value.get("max_tokens") is not None:
            base["max_tokens"] = int(value["max_tokens"])
        if value.get("extra") is not None:
            base["extra"] = value["extra"] if isinstance(value["extra"], dict) else {}
    base["api_url"] = base["api_url"].rstrip("/") or "https://api.ccode.vip/v1"
    base["model"] = base["model"] or "glm-5.2-free"
    base["temperature"] = max(0.0, min(2.0, float(base["temperature"])))
    base["top_p"] = max(0.0, min(1.0, float(base["top_p"])))
    base["max_tokens"] = max(0, int(base["max_tokens"]))
    return base


def get_ai_settings(scope: str = DEFAULT_SCOPE) -> dict:
    init_ai_settings_db()
    conn = connect()
    row = conn.execute("SELECT * FROM ai_settings WHERE scope = ?", (scope,)).fetchone()
    conn.close()
    if not row:
        return _normalize(None)
    try:
        extra = json.loads(row["extra_json"] or "{}")
    except (TypeError, ValueError):
        extra = {}
    return _normalize(
        {
            "api_url": row["api_url"],
            "api_key": row["api_key"],
            "model": row["model"],
            "temperature": row["temperature"],
            "max_tokens": row["max_tokens"],
            "top_p": row["top_p"],
            "extra": extra,
        }
    )


def has_ai_settings(scope: str) -> bool:
    init_ai_settings_db()
    conn = connect()
    exists = conn.execute("SELECT 1 FROM ai_settings WHERE scope = ?", (scope,)).fetchone() is not None
    conn.close()
    return exists


def resolve_ai_settings(username: str = "", model_id: str | None = None) -> dict:
    default = get_ai_settings()
    username = str(username or "").strip()
    if username and not username.startswith("api:"):
        scoped = get_ai_settings(username)
        # A missing row returns env defaults; only use it when a custom row exists.
        if has_ai_settings(username):
            default = _normalize(scoped, default)
    return default


def set_ai_settings(scope: str, data: dict) -> dict:
    scope = str(scope or DEFAULT_SCOPE).strip()[:80] or DEFAULT_SCOPE
    current = get_ai_settings(scope if scope != DEFAULT_SCOPE else DEFAULT_SCOPE)
    value = _normalize(data, current)
    if len(value["api_key"]) > 1000:
        raise ValueError("API Key 不能超过 1000 个字符")
    if not value["api_url"].startswith(("http://", "https://")):
        raise ValueError("API URL 必须以 http:// 或 https:// 开头")
    now = datetime.now().isoformat()
    init_ai_settings_db()
    conn = connect()
    conn.execute(
        "INSERT INTO ai_settings (scope, api_url, api_key, model, temperature, max_tokens, top_p, extra_json, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(scope) DO UPDATE SET api_url=excluded.api_url, api_key=excluded.api_key, model=excluded.model, "
        "temperature=excluded.temperature, max_tokens=excluded.max_tokens, top_p=excluded.top_p, extra_json=excluded.extra_json, updated_at=excluded.updated_at",
        (scope, value["api_url"], value["api_key"], value["model"], value["temperature"], value["max_tokens"], value["top_p"], json.dumps(value["extra"], ensure_ascii=False), now),
    )
    conn.commit()
    conn.close()
    return {**value, "scope": scope, "updated_at": now}


def clear_ai_settings(scope: str) -> bool:
    scope = str(scope or "").strip()[:80]
    if not scope or scope == DEFAULT_SCOPE:
        raise ValueError("不能删除默认 API 配置")
    init_ai_settings_db()
    conn = connect()
    deleted = conn.execute("DELETE FROM ai_settings WHERE scope = ?", (scope,)).rowcount > 0
    conn.commit()
    conn.close()
    return deleted
