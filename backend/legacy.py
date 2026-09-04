"""
md-rag-tutor / app.py
FastAPI 后端 - 全能 AI 导师（统一引擎，RAG+Agent 合并）
"""
import os
import re
import uuid
import hashlib
import sqlite3
import json
import secrets
import shutil
import subprocess
import io
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import rag_engine
from rag_engine import UnifiedRagAgent, list_models, switch_model, get_llm, MODEL_CONFIG, get_token_stats
from learning_insights import REVIEW_INTERVAL_DAYS, next_review_at, weekly_suggestions
from backend.config import APP_NAME, DATA_DIR, DB_PATH, PROJECT_DIR
import backend.database as database
from backend.database import init_commerce_db
from backend.routers.auth import (
    change_password,
    login,
    register,
    router as auth_router,
)
from backend.routers.billing import router as billing_router
from backend.routers.courses import router as courses_router
from backend.routers.compiler import router as compiler_router
from backend.routers.contests import router as contests_router
from backend.routers.classes import router as classes_router
from backend.routers.judge import router as judge_router
from backend.routers.learning_reports import router as learning_reports_router
from backend.routers.institutions import router as institutions_router
from backend.routers.assignments import router as assignments_router
from backend.security import (
    create_user_session,
    hash_api_key,
    hash_password,
    password_needs_upgrade,
    require_admin,
    require_authenticated_user,
    session_user,
    verify_password,
)
from backend.services.courses import (
    conversation_key,
    course_context as get_course_context,
    init_course_db,
    normalize_course_id,
)
from backend.services.code_context import format_code_context
from backend.services.classes import student_in_class, teacher_owns_class
from backend.services.document_text import (
    DocumentTextError,
    SUPPORTED_SUFFIXES as COURSEWARE_SUFFIXES,
    extract_document_text as extract_courseware_text,
)
from backend.services.institutions import init_institution_db
from backend.services.user_ai_keys import init_user_ai_key_db
from backend.services.quota import (
    QuotaExceeded,
    confirm_question,
    get_quota,
    release_question,
    reserve_question,
)

# ── 数据库初始化 ─────────────────────────────────────────
BASE_DIR = PROJECT_DIR

def init_db():
    database.DB_PATH = DB_PATH
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT, created_at TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS user_sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)")
    try:
        c.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
    except sqlite3.OperationalError:
        pass
    for column in ("avatar_url", "ai_avatar_url"):
        try:
            c.execute(f"ALTER TABLE users ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError:
            pass
    c.execute("CREATE TABLE IF NOT EXISTS stats (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, date TEXT, query_count INTEGER DEFAULT 0, token_count INTEGER DEFAULT 0, session_count INTEGER DEFAULT 0)")
    c.execute("CREATE TABLE IF NOT EXISTS daily_stats (username TEXT, date TEXT, query_count INTEGER DEFAULT 0, token_count INTEGER DEFAULT 0, PRIMARY KEY (username, date))")
    c.execute("CREATE TABLE IF NOT EXISTS shared_chats (share_id TEXT PRIMARY KEY, title TEXT NOT NULL, messages_json TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS api_keys (key_hash TEXT PRIMARY KEY, key_prefix TEXT NOT NULL, label TEXT NOT NULL, owner TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_used_at TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS learning_plans (username TEXT PRIMARY KEY, goal TEXT NOT NULL, plan_json TEXT NOT NULL, updated_at TEXT NOT NULL)")
    # Keep the original per-user table for existing installs; new plans belong to a chat session.
    c.execute("CREATE TABLE IF NOT EXISTS learning_session_plans (username TEXT NOT NULL, session_id TEXT NOT NULL, goal TEXT NOT NULL, plan_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (username, session_id))")
    c.execute("CREATE TABLE IF NOT EXISTS learning_notes (id TEXT PRIMARY KEY, username TEXT NOT NULL, session_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS practice_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, session_id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, expected_answer TEXT NOT NULL, is_correct INTEGER NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS workspace_roots (username TEXT PRIMARY KEY, path TEXT NOT NULL, updated_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS knowledge_uploads (stored_name TEXT PRIMARY KEY, original_name TEXT NOT NULL, username TEXT NOT NULL, chunks INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)")
    try:
        c.execute("ALTER TABLE knowledge_uploads ADD COLUMN class_id TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE knowledge_uploads ADD COLUMN category TEXT NOT NULL DEFAULT 'material'")
    except sqlite3.OperationalError:
        pass
    c.execute("CREATE TABLE IF NOT EXISTS learning_memory (username TEXT PRIMARY KEY, active_topics_json TEXT NOT NULL DEFAULT '[]', weak_points_json TEXT NOT NULL DEFAULT '[]', mastery_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS daily_learning_goals (username TEXT NOT NULL, date TEXT NOT NULL, goal TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (username, date))")
    c.execute("CREATE TABLE IF NOT EXISTS learning_shares (share_id TEXT PRIMARY KEY, username TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS learning_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, topic TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0, due_at TEXT NOT NULL, last_reviewed_at TEXT, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(username, source_type, source_id))")
    try:
        c.execute("ALTER TABLE practice_attempts ADD COLUMN mastered INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()
    init_commerce_db()
    init_course_db()
    init_institution_db()
    init_user_ai_key_db()

init_db()

TUTOR_MODES = {"explain", "socratic", "interview", "review", "quiz"}

BRAND_IDENTITY_ANSWER = (
    "我是启码 AI 学伴，由产品团队开发和维护，专门帮助孩子学习少儿编程。"
    "底层技术与供应链属于内部实现，不对外披露，不影响你的使用。"
)


def is_brand_identity_question(query: str) -> bool:
    """识别询问当前产品身份或底层供应商的问题。"""
    normalized = re.sub(r"[\s，。！？?、：:（）()]+", "", query).lower()
    direct_questions = (
        "你是什么模型", "你用的什么模型", "你用什么模型", "你是哪个模型",
        "用的哪个模型", "底层是什么模型", "底层模型是什么", "模型供应商",
        "谁开发的", "谁训练的", "你是哪家公司", "你是谁家的",
    )
    vendor_questions = (
        "你是deepseek", "你是glm", "你是ollama", "你是qwen",
        "你是openai", "你是chatgpt", "你是claude",
        "你用deepseek", "你用glm", "你用ollama", "你用qwen",
    )
    return any(item in normalized for item in direct_questions + vendor_questions)

def get_learning_memory(username: str) -> dict:
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute("SELECT active_topics_json, weak_points_json, mastery_json FROM learning_memory WHERE username = ?", (username[:40],)).fetchone()
    conn.close()
    if not row:
        return {"active_topics": [], "weak_points": [], "mastery": {}}
    try:
        return {"active_topics": json.loads(row[0]), "weak_points": json.loads(row[1]), "mastery": json.loads(row[2])}
    except (TypeError, json.JSONDecodeError):
        return {"active_topics": [], "weak_points": [], "mastery": {}}

def save_learning_memory(username: str, memory: dict):
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        "INSERT INTO learning_memory (username, active_topics_json, weak_points_json, mastery_json, updated_at) VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(username) DO UPDATE SET active_topics_json=excluded.active_topics_json, weak_points_json=excluded.weak_points_json, mastery_json=excluded.mastery_json, updated_at=excluded.updated_at",
        (username[:40], json.dumps(memory.get("active_topics", [])[:8], ensure_ascii=False), json.dumps(memory.get("weak_points", [])[:10], ensure_ascii=False), json.dumps(memory.get("mastery", {}), ensure_ascii=False), datetime.now().isoformat()),
    )
    conn.commit(); conn.close()

def update_learning_memory(username: str, query: str):
    memory = get_learning_memory(username)
    topic = " ".join(query.split())[:56]
    if topic:
        memory["active_topics"] = [topic] + [item for item in memory["active_topics"] if item != topic]
    if any(word in query for word in ("不会", "不懂", "不理解", "困难", "错", "复习")) and topic:
        memory["weak_points"] = [topic] + [item for item in memory["weak_points"] if item != topic]
    save_learning_memory(username, memory)
    return memory

def learning_context(memory: dict) -> str:
    parts = []
    if memory.get("active_topics"):
        parts.append("正在学习：" + "；".join(memory["active_topics"][:3]))
    if memory.get("weak_points"):
        parts.append("待巩固：" + "；".join(memory["weak_points"][:3]))
    if memory.get("mastery"):
        mastered = [name for name, value in memory["mastery"].items() if value]
        if mastered:
            parts.append("已掌握：" + "；".join(mastered[:3]))
    return "\n".join(parts)


def schedule_learning_review(username: str, topic: str, source_type: str, source_id: str, *, stage: int = 0, due_at: datetime | None = None):
    topic = " ".join(str(topic or "").split())[:120]
    if not topic or not source_id:
        return
    now = datetime.now()
    stage = max(0, min(int(stage), len(REVIEW_INTERVAL_DAYS) - 1))
    due = due_at or next_review_at(stage, now)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        "INSERT INTO learning_reviews (username, topic, source_type, source_id, stage, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(username, source_type, source_id) DO UPDATE SET topic=excluded.topic, completed=0",
        (username[:40], topic, source_type[:24], source_id[:80], stage, due.isoformat(), now.isoformat()),
    )
    conn.commit(); conn.close()


def ensure_learning_reviews(username: str):
    """Backfill review reminders for learning records created before this feature."""
    conn = sqlite3.connect(str(DB_PATH))
    attempts = conn.execute(
        "SELECT id, question, created_at FROM practice_attempts WHERE username = ? AND is_correct = 0 AND COALESCE(mastered, 0) = 0",
        (username[:40],),
    ).fetchall()
    notes = conn.execute(
        "SELECT id, title, created_at FROM learning_notes WHERE username = ?",
        (username[:40],),
    ).fetchall()
    now = datetime.now()
    for source_type, rows in (("mistake", attempts), ("note", notes)):
        for source_id, topic, created_at in rows:
            try:
                created = datetime.fromisoformat(created_at)
            except (TypeError, ValueError):
                created = now
            due = min(next_review_at(0, created) or now, now)
            conn.execute(
                "INSERT OR IGNORE INTO learning_reviews (username, topic, source_type, source_id, stage, due_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
                (username[:40], str(topic)[:120], source_type, str(source_id)[:80], due.isoformat(), created.isoformat()),
            )
    conn.commit(); conn.close()

# ── 初始化 ───────────────────────────────────────────────
app = FastAPI(title=APP_NAME, version="5.0.0")
app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(courses_router)
app.include_router(compiler_router)
app.include_router(contests_router)
app.include_router(classes_router)
app.include_router(judge_router)
app.include_router(learning_reports_router)
app.include_router(institutions_router)
app.include_router(assignments_router)
tutor = UnifiedRagAgent()
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
WEB_DIR = BASE_DIR / "web"
WEB_DIR.mkdir(exist_ok=True)
app.mount("/web", StaticFiles(directory=str(WEB_DIR)), name="web")
TEMPLATE_DIR = BASE_DIR / "templates"

UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
FEEDBACK_DIR = DATA_DIR / "feedback"
FEEDBACK_DIR.mkdir(exist_ok=True)
WORKSPACE_DIR = DATA_DIR / "workspaces"
WORKSPACE_DIR.mkdir(exist_ok=True)

# 会话管理
sessions = {}
session_stats = {}
session_attachments = {}
total_global_count = 0  # 所有会话总提问次数


def clear_runtime_user_state(username: str) -> None:
    prefix = f"{str(username or '')[:40]}:"
    for store in (sessions, session_stats, session_attachments):
        for key in list(store):
            if key.startswith(prefix):
                store.pop(key, None)

TEXT_ATTACHMENT_EXTENSIONS = {
    ".md", ".txt", ".csv", ".json", ".py", ".js", ".ts", ".tsx", ".jsx",
    ".html", ".css", ".xml", ".yaml", ".yml", ".log",
}


def extract_attachment_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in TEXT_ATTACHMENT_EXTENSIONS:
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue
        raise HTTPException(400, "无法识别文件编码，请转换为 UTF-8 后重试")

    if suffix == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content)) as document:
                return "\n".join(page.extract_text() or "" for page in document.pages)
        except ImportError:
            raise HTTPException(415, "当前环境暂不支持 PDF，请先转换为 Markdown 或文本文件")
        except Exception:
            raise HTTPException(400, "无法读取该 PDF，可能是扫描件或已加密")

    if suffix in {".docx", ".pptx", ".xlsx"}:
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                if suffix == ".docx":
                    names = ["word/document.xml"]
                elif suffix == ".pptx":
                    names = sorted(name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml"))
                else:
                    names = sorted(name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"))
                    if "xl/sharedStrings.xml" in archive.namelist():
                        names.insert(0, "xl/sharedStrings.xml")
                parts = []
                for name in names:
                    root = ET.fromstring(archive.read(name))
                    parts.extend(node.text for node in root.iter() if node.tag.endswith(("}t", "}v")) and node.text)
                return "\n".join(parts)
        except (KeyError, zipfile.BadZipFile, ET.ParseError):
            raise HTTPException(400, "无法读取该 Office 文件")

    raise HTTPException(415, "暂不支持该文件类型")


# ── 启动时加载模型 + 内置知识库 ──────────────────────────
@app.on_event("startup")
async def startup():
    print("正在加载 Embedding 模型...")
    tutor.load_model()
    print("正在加载内置知识库...")
    tutor.load_builtin_knowledge()
    print("启码 AI 学伴启动完成")


# ── 页面路由 ─────────────────────────────────────────────
def web_index_response() -> HTMLResponse:
    index_path = WEB_DIR / "dist" / "index.html"
    return HTMLResponse(index_path.read_text(encoding="utf-8"))


def legacy_index_response() -> HTMLResponse:
    page = (TEMPLATE_DIR / "index.html").read_text(encoding="utf-8")
    modals = (TEMPLATE_DIR / "partials" / "modals.html").read_text(encoding="utf-8")
    return HTMLResponse(page.replace("{{ MODALS }}", modals))


@app.get("/", response_class=HTMLResponse)
async def index():
    return web_index_response()


@app.get("/study", response_class=HTMLResponse)
async def study_page():
    return web_index_response()


@app.get("/contest", response_class=HTMLResponse)
async def contest_page():
    return web_index_response()


@app.get("/oj", response_class=HTMLResponse)
async def oj_page():
    return web_index_response()


@app.get("/legacy", response_class=HTMLResponse)
@app.get("/legacy/", response_class=HTMLResponse)
async def legacy_page():
    return legacy_index_response()


@app.get("/workspace", response_class=HTMLResponse)
async def workspace_page():
    return web_index_response()


@app.get("/learning", response_class=HTMLResponse)
async def learning_page():
    return web_index_response()


@app.get("/knowledge", response_class=HTMLResponse)
async def knowledge_page():
    return web_index_response()


@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return web_index_response()


# ═══════════════════════════════════════════════════════════
# 用户注册登录
# ═══════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════
# 统一问答接口
# ═══════════════════════════════════════════════════════════

@app.get("/api/admin/overview")
async def admin_overview(x_admin_key: str = Header(default="")):
    require_admin(x_admin_key)
    conn = sqlite3.connect(str(DB_PATH))
    users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    totals = conn.execute("SELECT COALESCE(SUM(query_count), 0), COALESCE(SUM(token_count), 0) FROM daily_stats").fetchone()
    keys = conn.execute("SELECT key_prefix, label, owner, active, created_at, last_used_at FROM api_keys ORDER BY created_at DESC").fetchall()
    conn.close()
    return {"users": users, "queries": totals[0], "tokens": totals[1], "api_keys": [dict(zip(("prefix", "label", "owner", "active", "created_at", "last_used_at"), row)) for row in keys]}


@app.post("/api/admin/keys")
async def create_api_key(data: dict, x_admin_key: str = Header(default="")):
    require_admin(x_admin_key)
    label = data.get("label", "External client").strip()[:60] or "External client"
    owner = data.get("owner", "admin").strip()[:40] or "admin"
    raw_key = "mdrag_" + secrets.token_urlsafe(24)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("INSERT INTO api_keys (key_hash, key_prefix, label, owner, created_at) VALUES (?, ?, ?, ?, ?)", (hash_api_key(raw_key), raw_key[:12], label, owner, datetime.now().isoformat()))
    conn.commit(); conn.close()
    return {"status": "ok", "api_key": raw_key, "warning": "此密钥只显示一次"}


@app.delete("/api/admin/keys/{key_prefix}")
async def revoke_api_key(key_prefix: str, x_admin_key: str = Header(default="")):
    require_admin(x_admin_key)
    conn = sqlite3.connect(str(DB_PATH))
    updated = conn.execute("UPDATE api_keys SET active = 0 WHERE key_prefix = ?", (key_prefix,)).rowcount
    conn.commit(); conn.close()
    if not updated:
        raise HTTPException(404, "API Key 不存在")
    return {"status": "ok", "message": "API Key 已撤销"}


@app.post("/api/ask")
async def ask_question(data: dict, x_api_key: str = Header(default=""), x_session_token: str = Header(default="")):
    global total_global_count
    query = data.get("query", "").strip()
    session_id = data.get("session_id", "default")
    course_id = normalize_course_id(data.get("course_id", "scratch"))
    username = data.get("username", "").strip()
    tutor_mode = data.get("tutor_mode", "explain")
    model_id = data.get("model_id", "flash")
    if model_id not in {"flash", "pro"}:
        model_id = "flash"
    if tutor_mode not in TUTOR_MODES:
        tutor_mode = "explain"
    if x_api_key:
        key_hash = hash_api_key(x_api_key)
        conn = sqlite3.connect(str(DB_PATH))
        row = conn.execute("SELECT owner FROM api_keys WHERE key_hash = ? AND active = 1", (key_hash,)).fetchone()
        if not row:
            conn.close()
            raise HTTPException(401, "API Key 无效或已撤销")
        username = "api:" + row[0]
        conn.execute("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?", (datetime.now().isoformat(), key_hash))
        conn.commit(); conn.close()
    else:
        username = require_authenticated_user(username, x_session_token)

    if not query:
        raise HTTPException(400, "请输入问题")

    scoped_session_id = conversation_key(username, course_id, session_id)
    if scoped_session_id not in sessions:
        sessions[scoped_session_id] = []
        session_stats[scoped_session_id] = {"count": 0, "model": "", "tokens": 0}
    history = sessions[scoped_session_id]

    if is_brand_identity_question(query):
        history.append({"role": "user", "content": query})
        history.append({"role": "assistant", "content": BRAND_IDENTITY_ANSWER})
        sessions[scoped_session_id] = history[-20:]
        return {
            "answer": BRAND_IDENTITY_ANSWER,
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "tokens": 0,
        }

    attachments = session_attachments.get(scoped_session_id, [])
    attachment_context = "\n\n".join(
        f"【附件：{item['name']}】\n{item['content']}" for item in attachments
    )
    request_context = []
    if attachment_context:
        request_context.append(f"【当前会话附件】\n{attachment_context}")
    code_context = format_code_context(data.get("code_context"), course_id)
    if code_context:
        request_context.append(code_context)
    context_text = "\n\n".join(request_context)
    model_query = query if not request_context else f"请结合平台提供的学习上下文回答。\n\n{context_text}\n\n【用户问题】\n{query}"

    reservation_id = ""
    if not username.startswith("api:"):
        try:
            reservation_id = reserve_question(username)
        except QuotaExceeded as error:
            raise HTTPException(402, "今日免费提问已用完，请联系机构老师充值后继续") from error

    # 统计
    session_stats[scoped_session_id]["count"] += 1
    total_global_count += 1
    session_stats[scoped_session_id]["model"] = MODEL_CONFIG[model_id]["name"]

    # 估算 token 数（中文约 1 字 2 token，英文约 1 词 1 token）
    input_tokens = len(query) * 2

    try:
        memory = get_learning_memory(username)
        course_learning_context = learning_context(memory) + "\n\n课程范围：" + get_course_context(course_id)
        answer = tutor.ask(
            model_query,
            history=history,
            learning_context=course_learning_context,
            tutor_mode=tutor_mode,
            model_id=model_id,
            username=username,
        )
    except Exception as e:
        if reservation_id:
            release_question(reservation_id)
        detail = str(e).lower()
        if "no available channel" in detail or "model_not_found" in detail:
            message = "当前云端模型暂时没有可用通道，请稍后重试或切换到本地模型。"
            error_type = "model_unavailable"
        else:
            message = "模型暂时无法响应，请稍后重试。"
            error_type = "model_error"
        return {
            "answer": "",
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "error": True,
            "error_type": error_type,
            "message": message,
        }

    output_tokens = len(answer) * 2
    total_tokens = input_tokens + output_tokens
    session_stats[scoped_session_id]["tokens"] += total_tokens

    history.append({"role": "user", "content": query})
    history.append({"role": "assistant", "content": answer})
    sessions[scoped_session_id] = history[-20:]

    if reservation_id:
        confirm_question(reservation_id)

    # 写入数据库统计
    if not username.startswith("api:"):
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        today = date.today().isoformat()
        c.execute("INSERT INTO daily_stats (username, date, query_count, token_count) VALUES (?, ?, 1, ?) "
                  "ON CONFLICT(username, date) DO UPDATE SET query_count = query_count + 1, token_count = token_count + ?",
                  (username, today, total_tokens, total_tokens))
        conn.commit()
        conn.close()
        update_learning_memory(username, query)

    return {
        "answer": answer,
        "session_id": session_id,
        "timestamp": datetime.now().isoformat(),
        "tokens": total_tokens,
        "quota": get_quota(username) if not username.startswith("api:") else None,
    }


def require_learning_user(data: dict, x_session_token: str = "") -> str:
    username = data.get("username", "").strip()
    return require_authenticated_user(username, x_session_token)

def require_path_user(username: str, x_session_token: str) -> str:
    return require_authenticated_user(username, x_session_token)


def _clean_learning_line(value: str, limit: int = 120) -> str:
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", str(value or ""))
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[`*_>#|]", "", text)
    text = re.sub(r"^\s*(?:[-+]\s+|\d+[.)、]\s*)", "", text)
    return " ".join(text.split()).strip("：:。；;，, ")[:limit]


def extract_learning_material(messages: list) -> dict:
    if not isinstance(messages, list):
        raise ValueError("会话内容格式不正确")
    assistant_answers = [
        str(item.get("content", "")).strip()
        for item in messages
        if isinstance(item, dict) and item.get("role") == "assistant" and str(item.get("content", "")).strip()
    ]
    if not assistant_answers:
        raise ValueError("请先让 AI 回答当前问题，再生成学习内容")

    questions = [
        _clean_learning_line(item.get("content", ""), 56)
        for item in messages
        if isinstance(item, dict) and item.get("role") == "user" and str(item.get("content", "")).strip()
    ]
    answer = "\n".join(assistant_answers[-3:])[-9000:]
    candidates = []
    for raw_line in answer.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        if re.match(r"^(?:#{1,6}\s+|[-*+]\s+|\d+[.)、]\s+)", stripped) or "**" in stripped:
            candidates.append(_clean_learning_line(stripped))
    candidates.extend(_clean_learning_line(item) for item in re.findall(r"[“\"]([^”\"]{4,100})[”\"]", answer))
    if len(candidates) < 5:
        candidates.extend(_clean_learning_line(part) for part in re.split(r"[。！？!?；;，,\n]+", answer))

    points = []
    for candidate in candidates:
        if len(candidate) < 4 or any(candidate in item or item in candidate for item in points):
            continue
        points.append(candidate)
        if len(points) == 5:
            break

    topic = next((item for item in reversed(questions) if item), "")
    if not topic:
        topic = points[0] if points else "当前会话主题"
    while len(points) < 3:
        points.append(topic)
    return {"topic": topic[:56], "points": points, "answer": _clean_learning_line(answer, 500)}


def build_plan(goal: str, messages: list | None = None) -> list:
    if not messages:
        topic = _clean_learning_line(goal, 56) or "当前会话主题"
        points = [topic, "核心概念与工作机制", "真实场景中的应用方法"]
    else:
        material = extract_learning_material(messages)
        topic, points = material["topic"], material["points"]
    return [
        {"day": 1, "title": f"梳理：{topic[:18]}", "task": f"根据本次 AI 回答，用自己的话概括“{topic}”，并列出 3 个关键词。", "done": False},
        {"day": 2, "title": f"理解：{points[0][:18]}", "task": f"回看 AI 对“{points[0]}”的说明，补充一个自己的例子。", "done": False},
        {"day": 3, "title": f"串联：{points[1][:18]}", "task": f"说明“{points[1]}”与当前主题的关系，并画出简单的因果链。", "done": False},
        {"day": 4, "title": f"应用：{points[2][:18]}", "task": f"为“{points[2]}”设计一个真实使用场景，写出执行步骤和预期结果。", "done": False},
        {"day": 5, "title": "输出与复盘", "task": "不看原回答完成一次复述，记录仍不清楚的部分，并整理为自己的学习笔记。", "done": False},
    ]


def build_quiz_from_messages(messages: list) -> list:
    material = extract_learning_material(messages)
    topic, points = material["topic"], material["points"]
    return [
        {
            "id": "q1",
            "question": f"请用自己的话解释“{points[0]}”，并说明它在“{topic}”中的作用。",
            "hint": "先说它解决什么问题，再补充一个具体特点。",
            "answer": points[0],
        },
        {
            "id": "q2",
            "question": f"AI 回答中提到了“{points[0]}”和“{points[1]}”，它们之间有什么联系？",
            "hint": "可以从目标、输入输出或先后顺序三个角度比较。",
            "answer": f"围绕“{topic}”说明二者的关系：{points[0]}；{points[1]}。",
        },
        {
            "id": "q3",
            "question": f"如果把“{points[2]}”用于一个真实场景，你会怎样设计步骤并验证结果？",
            "hint": "写清场景、执行步骤和判断是否成功的标准。",
            "answer": f"答案应结合“{points[2]}”，包含场景、步骤与验证标准。",
        },
    ]


@app.post("/api/learning/plan")
async def save_learning_plan(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    session_id = data.get("session_id", "").strip()[:80]
    if not session_id:
        raise HTTPException(400, "请先创建一个会话，再生成学习路线")
    messages = data.get("messages", [])
    try:
        material = extract_learning_material(messages)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    goal = f"掌握“{material['topic']}”并能独立应用"[:80]
    plan = build_plan(goal, messages)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        "INSERT INTO learning_session_plans (username, session_id, goal, plan_json, updated_at) VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(username, session_id) DO UPDATE SET goal=excluded.goal, plan_json=excluded.plan_json, updated_at=excluded.updated_at",
        (username, session_id, goal[:80], json.dumps(plan, ensure_ascii=False), datetime.now().isoformat()),
    )
    conn.commit(); conn.close()
    return {"status": "ok", "goal": goal[:80], "plan": plan}


@app.post("/api/learning/plan/toggle")
async def toggle_learning_plan(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    session_id = data.get("session_id", "").strip()[:80]
    if not session_id:
        raise HTTPException(400, "缺少会话信息")
    day = int(data.get("day", 0))
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute("SELECT goal, plan_json FROM learning_session_plans WHERE username = ? AND session_id = ?", (username, session_id)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "还没有学习路线")
    plan = json.loads(row[1])
    item = next((item for item in plan if item.get("day") == day), None)
    if not item:
        conn.close()
        raise HTTPException(404, "学习任务不存在")
    item["done"] = not item.get("done", False)
    conn.execute("UPDATE learning_session_plans SET plan_json = ?, updated_at = ? WHERE username = ? AND session_id = ?", (json.dumps(plan, ensure_ascii=False), datetime.now().isoformat(), username, session_id))
    conn.commit(); conn.close()
    if item["done"]:
        schedule_learning_review(username, item.get("title") or row[0], "plan", f"{session_id}:{day}")
    return {"status": "ok", "goal": row[0], "plan": plan}


@app.get("/api/learning/plan/{username}/{session_id}")
async def get_learning_plan(username: str, session_id: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute("SELECT goal, plan_json FROM learning_session_plans WHERE username = ? AND session_id = ?", (username[:40], session_id[:80])).fetchone()
    conn.close()
    return {"goal": row[0], "plan": json.loads(row[1])} if row else {"goal": "", "plan": []}


@app.post("/api/learning/note")
async def create_learning_note(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    session_id = data.get("session_id", "default")[:80]
    messages = data.get("messages", [])
    if not isinstance(messages, list) or not messages:
        raise HTTPException(400, "当前会话还没有可以整理的内容")
    questions = [str(item.get("content", "")).strip() for item in messages if item.get("role") == "user"]
    answers = [str(item.get("content", "")).strip() for item in messages if item.get("role") == "assistant"]
    title = (questions[0] if questions else "学习对话笔记")[:32]
    content = "# " + title + "\n\n## 我的问题\n" + "\n".join(f"- {item}" for item in questions[:5])
    if answers:
        content += "\n\n## 导师回答摘录\n" + "\n\n".join(answers[:3])
    content += "\n\n## 复习提示\n- 用自己的话复述上面的关键概念。\n- 找一个真实场景验证理解。"
    note_id = uuid.uuid4().hex[:12]
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("INSERT INTO learning_notes (id, username, session_id, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)", (note_id, username, session_id, title, content, datetime.now().isoformat()))
    conn.commit(); conn.close()
    schedule_learning_review(username, title, "note", note_id)
    return {"status": "ok", "id": note_id, "title": title, "content": content}


@app.get("/api/learning/notes/{username}/{session_id}")
async def get_learning_notes(username: str, session_id: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute("SELECT id, title, content, created_at FROM learning_notes WHERE username = ? AND session_id = ? ORDER BY created_at DESC LIMIT 20", (username[:40], session_id[:80])).fetchall()
    conn.close()
    return {"notes": [dict(zip(("id", "title", "content", "created_at"), row)) for row in rows]}


@app.delete("/api/learning/notes/{username}/{note_id}")
async def delete_learning_note(username: str, note_id: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    conn = sqlite3.connect(str(DB_PATH))
    deleted = conn.execute("DELETE FROM learning_notes WHERE id = ? AND username = ?", (note_id[:40], username[:40])).rowcount
    conn.execute("DELETE FROM learning_reviews WHERE username = ? AND source_type = 'note' AND source_id = ?", (username[:40], note_id[:40]))
    conn.commit(); conn.close()
    if not deleted:
        raise HTTPException(404, "笔记不存在或已删除")
    return {"status": "ok"}


@app.delete("/api/learning/plans/{username}/{session_id}")
async def delete_learning_plan(username: str, session_id: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    conn = sqlite3.connect(str(DB_PATH))
    deleted = conn.execute("DELETE FROM learning_session_plans WHERE username = ? AND session_id = ?", (username[:40], session_id[:80])).rowcount
    conn.execute("DELETE FROM learning_reviews WHERE username = ? AND source_type = 'plan' AND source_id LIKE ?", (username[:40], session_id[:80] + ":%"))
    conn.commit(); conn.close()
    if not deleted:
        raise HTTPException(404, "学习路线不存在或已删除")
    return {"status": "ok"}


@app.post("/api/learning/quiz")
async def create_quiz(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    session_id = data.get("session_id", "default")[:80]
    messages = data.get("messages", [])
    try:
        quiz = build_quiz_from_messages(messages)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"status": "ok", "quiz": quiz, "session_id": session_id, "source": "current_ai_answer", "tokens_used": 0}


@app.post("/api/learning/attempt")
async def save_practice_attempt(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    answer = data.get("answer", "").strip()
    if not answer:
        raise HTTPException(400, "请先写下你的答案")
    is_correct = len(answer) >= 18
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.execute("INSERT INTO practice_attempts (username, session_id, question, answer, expected_answer, is_correct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (username, data.get("session_id", "default")[:80], data.get("question", "")[:300], answer[:2000], "开放题", int(is_correct), datetime.now().isoformat()))
    attempt_id = cursor.lastrowid
    conn.commit(); conn.close()
    question = data.get("question", "").strip()[:120] or "本次练习"
    schedule_learning_review(username, question, "attempt" if is_correct else "mistake", str(attempt_id), stage=1 if is_correct else 0)
    if not is_correct:
        memory = get_learning_memory(username)
        weak_topic = question[:56]
        if weak_topic:
            memory["weak_points"] = [weak_topic] + [item for item in memory["weak_points"] if item != weak_topic]
            save_learning_memory(username, memory)
    return {"status": "ok", "is_correct": is_correct, "feedback": "回答已记录。现在回看导师解释，补充一个具体例子。" if is_correct else "先补充为什么、怎么做或一个具体例子，再试一次。"}


@app.get("/api/learning/mistakes/{username}/{session_id}")
async def get_learning_mistakes(username: str, session_id: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute("SELECT id, question, answer, created_at FROM practice_attempts WHERE username = ? AND session_id = ? AND is_correct = 0 AND COALESCE(mastered, 0) = 0 ORDER BY created_at DESC LIMIT 10", (username[:40], session_id[:80])).fetchall()
    conn.close()
    return {"mistakes": [dict(zip(("id", "question", "answer", "created_at"), row)) for row in rows]}


@app.post("/api/learning/attempts/{username}/{attempt_id}/mastered")
async def mark_attempt_mastered(username: str, attempt_id: int, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    conn = sqlite3.connect(str(DB_PATH))
    updated = conn.execute("UPDATE practice_attempts SET mastered = 1 WHERE id = ? AND username = ?", (attempt_id, username[:40])).rowcount
    row = conn.execute("SELECT question FROM practice_attempts WHERE id = ? AND username = ?", (attempt_id, username[:40])).fetchone()
    conn.execute("UPDATE learning_reviews SET completed = 1 WHERE username = ? AND source_type IN ('attempt', 'mistake') AND source_id = ?", (username[:40], str(attempt_id)))
    conn.commit(); conn.close()
    if not updated:
        raise HTTPException(404, "练习记录不存在")
    if row:
        memory = get_learning_memory(username)
        memory["mastery"][row[0][:56]] = True
        memory["weak_points"] = [item for item in memory["weak_points"] if item != row[0][:56]]
        save_learning_memory(username, memory)
    return {"status": "ok"}


@app.delete("/api/learning/attempts/{username}/{attempt_id}")
async def delete_practice_attempt(username: str, attempt_id: int, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    conn = sqlite3.connect(str(DB_PATH))
    deleted = conn.execute("DELETE FROM practice_attempts WHERE id = ? AND username = ?", (attempt_id, username[:40])).rowcount
    conn.execute("DELETE FROM learning_reviews WHERE username = ? AND source_type IN ('attempt', 'mistake') AND source_id = ?", (username[:40], str(attempt_id)))
    conn.commit(); conn.close()
    if not deleted:
        raise HTTPException(404, "练习记录不存在或已删除")
    return {"status": "ok"}


@app.get("/api/learning/overview/{username}")
async def get_learning_overview(username: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    username = username[:40]
    conn = sqlite3.connect(str(DB_PATH))
    plans = conn.execute("SELECT session_id, goal, plan_json, updated_at FROM learning_session_plans WHERE username = ? ORDER BY updated_at DESC", (username,)).fetchall()
    notes = conn.execute("SELECT id, session_id, title, content, created_at FROM learning_notes WHERE username = ? ORDER BY created_at DESC LIMIT 100", (username,)).fetchall()
    attempts = conn.execute("SELECT id, session_id, question, answer, is_correct, COALESCE(mastered, 0), created_at FROM practice_attempts WHERE username = ? ORDER BY created_at DESC LIMIT 200", (username,)).fetchall()
    conn.close()
    return {
        "plans": [dict(session_id=row[0], goal=row[1], plan=json.loads(row[2]), updated_at=row[3]) for row in plans],
        "notes": [dict(zip(("id", "session_id", "title", "content", "created_at"), row)) for row in notes],
        "attempts": [dict(zip(("id", "session_id", "question", "answer", "is_correct", "mastered", "created_at"), row)) for row in attempts],
    }


@app.get("/api/learning/reviews/{username}")
async def get_learning_reviews(username: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    ensure_learning_reviews(username)
    now = datetime.now().isoformat()
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute(
        "SELECT id, topic, source_type, stage, due_at, last_reviewed_at FROM learning_reviews "
        "WHERE username = ? AND completed = 0 ORDER BY due_at ASC LIMIT 50",
        (username[:40],),
    ).fetchall()
    conn.close()
    reviews = [dict(zip(("id", "topic", "source_type", "stage", "due_at", "last_reviewed_at"), row)) for row in rows]
    for item in reviews:
        item["is_due"] = item["due_at"] <= now
        item["round"] = item["stage"] + 1
    return {"due_count": sum(1 for item in reviews if item["is_due"]), "reviews": reviews}


@app.post("/api/learning/reviews/{username}/{review_id}/complete")
async def complete_learning_review(username: str, review_id: int, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    now = datetime.now()
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute(
        "SELECT stage FROM learning_reviews WHERE id = ? AND username = ? AND completed = 0",
        (review_id, username[:40]),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "复习任务不存在或已完成")
    next_stage = row[0] + 1
    due = next_review_at(next_stage, now)
    conn.execute(
        "UPDATE learning_reviews SET stage = ?, due_at = ?, last_reviewed_at = ?, completed = ? WHERE id = ? AND username = ?",
        (next_stage, (due or now).isoformat(), now.isoformat(), int(due is None), review_id, username[:40]),
    )
    conn.commit(); conn.close()
    return {
        "status": "ok",
        "completed": due is None,
        "next_due_at": due.isoformat() if due else None,
        "message": "本轮复习完成，已安排下一次复习" if due else "已完成全部复习轮次",
    }


@app.delete("/api/learning/reviews/{username}/{review_id}")
async def delete_learning_review(username: str, review_id: int, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    conn = sqlite3.connect(str(DB_PATH))
    deleted = conn.execute(
        "DELETE FROM learning_reviews WHERE id = ? AND username = ?",
        (review_id, username[:40]),
    ).rowcount
    conn.commit(); conn.close()
    if not deleted:
        raise HTTPException(404, "复习任务不存在或已删除")
    return {"status": "ok"}


@app.get("/api/learning/weekly/{username}")
async def get_weekly_learning_report(username: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    ensure_learning_reviews(username)
    today = date.today()
    start = today - timedelta(days=6)
    start_iso = datetime.combine(start, datetime.min.time()).isoformat()
    end_iso = datetime.combine(today + timedelta(days=1), datetime.min.time()).isoformat()
    conn = sqlite3.connect(str(DB_PATH))
    stats = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(query_count), 0), COALESCE(SUM(token_count), 0) FROM daily_stats WHERE username = ? AND date BETWEEN ? AND ? AND query_count > 0",
        (username, start.isoformat(), today.isoformat()),
    ).fetchone()
    practice = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(is_correct), 0) FROM practice_attempts WHERE username = ? AND created_at >= ? AND created_at < ?",
        (username, start_iso, end_iso),
    ).fetchone()
    note_count = conn.execute(
        "SELECT COUNT(*) FROM learning_notes WHERE username = ? AND created_at >= ? AND created_at < ?",
        (username, start_iso, end_iso),
    ).fetchone()[0]
    plans = conn.execute(
        "SELECT plan_json FROM learning_session_plans WHERE username = ?",
        (username,),
    ).fetchall()
    due_reviews = conn.execute(
        "SELECT COUNT(*) FROM learning_reviews WHERE username = ? AND completed = 0 AND due_at <= ?",
        (username, datetime.now().isoformat()),
    ).fetchone()[0]
    conn.close()
    plan_items = [item for row in plans for item in json.loads(row[0])]
    plan_total = len(plan_items)
    plan_completed = sum(1 for item in plan_items if item.get("done"))
    practice_total, practice_correct = practice
    accuracy = round(practice_correct * 100 / practice_total) if practice_total else 0
    memory = get_learning_memory(username)
    return {
        "period": {"start": start.isoformat(), "end": today.isoformat()},
        "study_days": stats[0],
        "queries": stats[1],
        "tokens": stats[2],
        "notes": note_count,
        "practice": {"total": practice_total, "correct": practice_correct, "accuracy": accuracy},
        "plan": {"completed": plan_completed, "total": plan_total},
        "topics": memory["active_topics"][:5],
        "weak_points": memory["weak_points"][:5],
        "due_reviews": due_reviews,
        "suggestions": weekly_suggestions(
            practice_total=practice_total,
            accuracy=accuracy,
            note_count=note_count,
            weak_points=memory["weak_points"],
            due_reviews=due_reviews,
        ),
    }


# ═══════════════════════════════════════════════════════════
# 上传补充知识库
# ═══════════════════════════════════════════════════════════

def selected_workspace_path(username: str) -> Path | None:
    # A selected local folder is stored server-side; the client never supplies a path.
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute("SELECT path FROM workspace_roots WHERE username = ?", (username[:40],)).fetchone()
    conn.close()
    if row:
        selected = Path(row[0])
        if selected.exists() and selected.is_dir():
            return selected
    return None


def workspace_path(username: str) -> Path:
    selected = selected_workspace_path(username)
    if selected:
        return selected
    key = hashlib.sha256(username.encode("utf-8")).hexdigest()[:16]
    path = WORKSPACE_DIR / key
    path.mkdir(exist_ok=True)
    return path


def safe_workspace_relative_path(name: str) -> Path:
    normalized = str(name or "").replace("\\", "/").strip("/ ")
    parts = [part.strip() for part in normalized.split("/") if part.strip()]
    if not parts or any(part in {".", ".."} for part in parts):
        raise HTTPException(400, "文件路径不合法")
    filename = parts[-1]
    if Path(filename).suffix.lower() not in {".md", ".txt"}:
        raise HTTPException(400, "仅支持 Markdown 或文本文件")
    return Path(*[part[:80] for part in parts])


def safe_workspace_folder(name: str) -> Path:
    normalized = str(name or "").replace("\\", "/").strip("/ ")
    if not normalized:
        return Path()
    parts = [part.strip() for part in normalized.split("/") if part.strip()]
    if not parts or any(part in {".", ".."} or any(char in part for char in '<>:"|?*') for part in parts):
        raise HTTPException(400, "文件夹名称不合法")
    return Path(*[part[:80] for part in parts])


def workspace_file_info(path: Path, root: Path | None = None) -> dict:
    relative = path.relative_to(root).as_posix() if root else path.name
    return {"name": path.name, "path": relative, "size": path.stat().st_size, "updated_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat()}


@app.get("/api/workspace/{username}")
async def list_workspace_files(username: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    selected_root = selected_workspace_path(username[:40])
    root = selected_root or workspace_path(username[:40])
    files = sorted((item for item in root.rglob("*") if item.is_file() and item.suffix.lower() in {".md", ".txt"}), key=lambda item: item.stat().st_mtime, reverse=True)
    folders = sorted(item.relative_to(root).as_posix() for item in root.rglob("*") if item.is_dir())
    return {"root_name": root.name, "selected": selected_root is not None, "folders": folders, "files": [workspace_file_info(item, root) for item in files]}


@app.post("/api/workspace/open-folder")
async def open_existing_workspace_folder(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    try:
        from tkinter import Tk, filedialog
        dialog = Tk()
        dialog.withdraw()
        dialog.attributes("-topmost", True)
        selected = filedialog.askdirectory(title="选择任务工作区文件夹", mustexist=True)
        dialog.destroy()
    except Exception:
        raise HTTPException(503, "无法打开本机文件夹选择窗口，请确认桌面环境可用。")
    if not selected:
        return {"status": "cancelled"}
    path = Path(selected)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("INSERT INTO workspace_roots (username, path, updated_at) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET path = excluded.path, updated_at = excluded.updated_at", (username, str(path), datetime.now().isoformat()))
    conn.commit(); conn.close()
    return {"status": "ok", "root_name": path.name}


@app.get("/api/workspace/{username}/{filename:path}")
async def read_workspace_file(username: str, filename: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    root = workspace_path(username[:40])
    path = root / safe_workspace_relative_path(filename)
    if not path.exists():
        raise HTTPException(404, "文件不存在")
    return {"name": path.name, "path": path.relative_to(root).as_posix(), "content": path.read_text(encoding="utf-8"), "updated_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat()}


@app.post("/api/workspace/folders")
async def create_workspace_folder(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    folder = safe_workspace_folder(data.get("folder", ""))
    if not folder.parts:
        raise HTTPException(400, "请输入文件夹名称")
    path = workspace_path(username) / folder
    path.mkdir(parents=True, exist_ok=True)
    return {"status": "ok", "folder": folder.as_posix()}


@app.post("/api/workspace/upload")
async def upload_workspace_file(username: str, folder: str = "", file: UploadFile = File(...), x_session_token: str = Header(default="")):
    username = require_learning_user({"username": username}, x_session_token)
    target_folder = safe_workspace_folder(folder)
    content = await file.read()
    if len(content) > 1_000_000:
        raise HTTPException(400, "文件不能超过 1 MB")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "请上传 UTF-8 编码的文本文件")
    path = workspace_path(username) / target_folder / safe_workspace_relative_path(file.filename or "")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return {"status": "ok", "file": workspace_file_info(path, workspace_path(username)), "content": text}


@app.post("/api/workspace/save")
async def save_workspace_file(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    filename = safe_workspace_relative_path(data.get("filename", ""))
    content = str(data.get("content", ""))
    if len(content.encode("utf-8")) > 1_000_000:
        raise HTTPException(400, "文件不能超过 1 MB")
    path = workspace_path(username) / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return {"status": "ok", "file": workspace_file_info(path, workspace_path(username))}


@app.post("/api/workspace/generate")
async def generate_workspace_markdown(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    filename = safe_workspace_relative_path(data.get("filename", ""))
    instruction = str(data.get("instruction", "")).strip()
    if len(instruction) < 2:
        raise HTTPException(400, "请说明要生成或修改什么文档")
    source_path = workspace_path(username) / filename
    if not source_path.exists():
        raise HTTPException(404, "请先选择一个工作区文件")
    source = source_path.read_text(encoding="utf-8")[:14000]
    prompt = f"""你是学习文档助手。请根据用户要求处理下面的资料，输出一份可直接保存的 Markdown 文档。

用户要求：{instruction[:500]}

规则：
- 只输出最终 Markdown，不要解释处理过程。
- 保留资料中可靠的事实；不确定的内容不要编造。
- 使用清晰的中文标题、列表和短段落，适合学习复习。

资料文件：{filename}
资料内容：
{source}"""
    try:
        client, model = get_llm(username=username)
        response = client.chat.completions.create(model=model, messages=[{"role": "user", "content": prompt}], **rag_engine.get_generation_options(username=username))
        result = str(response.choices[0].message.content or "").strip()
    except Exception:
        raise HTTPException(502, "AI 暂时无法生成文档，请稍后重试")
    if not result:
        raise HTTPException(502, "AI 没有返回文档内容")
    generated_name = f"AI_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{source_path.stem[:40]}.md"
    generated_path = source_path.parent / generated_name
    generated_path.write_text(result, encoding="utf-8")
    return {"status": "ok", "file": workspace_file_info(generated_path, workspace_path(username)), "content": result}


@app.post("/api/workspace/session-export")
async def export_session_to_workspace(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    messages = data.get("messages", [])
    if not isinstance(messages, list) or not messages:
        raise HTTPException(400, "当前会话还没有可以保存的内容")
    title = str(data.get("title", "学习对话")).strip()[:60] or "学习对话"
    safe_stem = "".join(ch for ch in title if ch not in '\\\\/:*?\"<>|').strip(" .") or "学习对话"
    filename = f"{safe_stem[:48]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    lines = [f"# {title}", "", f"> 导出时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}", ""]
    for item in messages[-100:]:
        if not isinstance(item, dict):
            continue
        role = "我" if item.get("role") == "user" else "AI 导师"
        content = str(item.get("content", "")).strip()
        if content:
            lines.extend([f"## {role}", "", content, ""])
    content = "\n".join(lines).strip() + "\n"
    folder = safe_workspace_folder(data.get("folder", ""))
    path = workspace_path(username) / folder / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return {"status": "ok", "file": workspace_file_info(path, workspace_path(username)), "content": content}


@app.post("/api/workspace/open-vscode")
async def open_workspace_in_vscode(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    code_command = shutil.which("code") or shutil.which("code.cmd")
    if not code_command:
        raise HTTPException(503, "未检测到 VS Code 命令。请在 VS Code 中安装 Shell Command 后重试。")
    try:
        subprocess.Popen([code_command, str(workspace_path(username))], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        raise HTTPException(503, "无法启动 VS Code，请确认已正确安装。")
    return {"status": "ok"}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), username: str = Form(default=""), class_id: str = Form(default=""), category: str = Form(default="material"), x_session_token: str = Header(default="")):
    owner = require_authenticated_user(username, x_session_token) if username else "legacy"
    if owner != "legacy" and session_user(x_session_token)["role"] != "teacher":
        raise HTTPException(403, "仅机构老师可以上传课件")
    if owner != "legacy" and not teacher_owns_class(owner, class_id):
        raise HTTPException(400, "请先选择自己创建的班级")
    original_name = Path(file.filename or "课件").name
    if Path(original_name).suffix.lower() not in COURSEWARE_SUFFIXES:
        raise HTTPException(400, "仅支持 Markdown、TXT、CSV、Word、PPTX、Excel XLSX 和 PDF 文件")
    raw = await file.read()
    try:
        content = extract_courseware_text(original_name, raw)
    except DocumentTextError as error:
        raise HTTPException(400, str(error)) from error
    file_id = str(uuid.uuid4())[:8]
    save_name = f"{file_id}_{original_name}"
    save_path = UPLOAD_DIR / save_name
    save_path.write_bytes(raw)
    safe_category = "courseware" if category == "courseware" else "material"

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        "INSERT OR REPLACE INTO knowledge_uploads (stored_name, original_name, username, chunks, created_at, class_id, category) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (save_name, original_name, owner, 0, datetime.now().isoformat(), class_id or None, safe_category),
    )
    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "file_id": file_id,
        "filename": save_name,
        "chunks": 0,
        "message": "班级资料已上传"
    }


def knowledge_file_info(path: Path, metadata: tuple | None = None) -> dict:
    stored_name = path.name
    fallback_name = stored_name.split("_", 1)[1] if "_" in stored_name else stored_name
    chunk_count = sum(1 for item in tutor.documents if item.get("source") == stored_name)
    return {
        "stored_name": stored_name,
        "name": metadata[0] if metadata else fallback_name,
        "owner": metadata[1] if metadata else "legacy",
        "chunks": metadata[2] if metadata else chunk_count,
        "class_id": metadata[3] if metadata and len(metadata) > 3 else None,
        "class_name": metadata[4] if metadata and len(metadata) > 4 else "未分班级",
        "category": metadata[5] if metadata and len(metadata) > 5 else "material",
        "size": path.stat().st_size,
        "updated_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
    }


@app.get("/api/knowledge/files/{username}")
async def list_knowledge_files(username: str, class_id: str = "", x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    user = session_user(x_session_token)
    if user["role"] == "teacher":
        if class_id and not teacher_owns_class(username, class_id):
            raise HTTPException(403, "只能查看自己创建班级的课件")
    else:
        if class_id and not student_in_class(username, class_id):
            raise HTTPException(403, "你不在这个班级中")
    conn = sqlite3.connect(str(DB_PATH))
    query = "SELECT k.stored_name, k.original_name, k.username, k.chunks, k.class_id, COALESCE(c.name, '未分班级'), COALESCE(k.category, 'material') FROM knowledge_uploads k LEFT JOIN teaching_classes c ON c.id = k.class_id WHERE "
    params = []
    if user["role"] == "teacher":
        query += "k.username = ?"
        params.append(username)
    else:
        query += "k.class_id IN (SELECT class_id FROM class_members WHERE username = ? AND role = 'student')"
        params.append(username)
    if class_id:
        query += " AND k.class_id = ?"
        params.append(class_id)
    rows = conn.execute(query + " ORDER BY k.created_at DESC", params).fetchall()
    conn.close()
    files = []
    for stored_name, original_name, owner, chunks, file_class_id, class_name, category in rows:
        path = UPLOAD_DIR / Path(stored_name).name
        if path.is_file():
            files.append(knowledge_file_info(path, (original_name, owner, chunks, file_class_id, class_name, category)))
    return {"files": files, "username": username}


@app.delete("/api/knowledge/files/{username}/{stored_name}")
async def delete_knowledge_file(username: str, stored_name: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    safe_name = Path(stored_name).name
    if safe_name != stored_name or Path(safe_name).suffix.lower() not in COURSEWARE_SUFFIXES:
        raise HTTPException(400, "知识文件名称不合法")
    conn = sqlite3.connect(str(DB_PATH))
    owned = conn.execute(
        "SELECT class_id FROM knowledge_uploads WHERE stored_name = ? AND username = ?",
        (safe_name, username),
    ).fetchone()
    if not owned:
        conn.close()
        raise HTTPException(404, "课件不存在或不属于当前教师")
    if not owned[0] or not teacher_owns_class(username, owned[0]):
        conn.close()
        raise HTTPException(403, "只能删除自己班级的课件")
    path = UPLOAD_DIR / safe_name
    if not path.exists() or not path.is_file():
        conn.close()
        raise HTTPException(404, "知识文件不存在或已删除")
    path.unlink()
    tutor.documents = [item for item in tutor.documents if item.get("source") != safe_name]
    tutor.indexed_files.discard(safe_name)
    tutor.retriever.add_documents(tutor.documents)
    conn.execute("DELETE FROM knowledge_uploads WHERE stored_name = ? AND username = ?", (safe_name, username))
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.get("/api/knowledge/files/{username}/{stored_name}/download")
async def download_knowledge_file(username: str, stored_name: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    user = session_user(x_session_token)
    safe_name = Path(stored_name).name
    if safe_name != stored_name:
        raise HTTPException(400, "课件名称不合法")
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute(
        "SELECT original_name, class_id FROM knowledge_uploads WHERE stored_name = ?" + (" AND username = ?" if user["role"] == "teacher" else ""),
        (safe_name, username) if user["role"] == "teacher" else (safe_name,),
    ).fetchone()
    conn.close()
    allowed = bool(row and row[1] and (teacher_owns_class(username, row[1]) if user["role"] == "teacher" else student_in_class(username, row[1])))
    if not allowed:
        raise HTTPException(404, "课件不存在或不属于当前教师班级")
    path = UPLOAD_DIR / safe_name
    if not path.is_file():
        raise HTTPException(404, "课件文件不存在")
    return FileResponse(path, filename=row[0])


@app.get("/api/knowledge/files/{username}/{stored_name}/preview")
async def preview_knowledge_file(username: str, stored_name: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    user = session_user(x_session_token)
    safe_name = Path(stored_name).name
    if safe_name != stored_name:
        raise HTTPException(400, "课件名称不合法")
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute(
        "SELECT original_name, class_id FROM knowledge_uploads WHERE stored_name = ?" + (" AND username = ?" if user["role"] == "teacher" else ""),
        (safe_name, username) if user["role"] == "teacher" else (safe_name,),
    ).fetchone()
    conn.close()
    allowed = bool(row and row[1] and (teacher_owns_class(username, row[1]) if user["role"] == "teacher" else student_in_class(username, row[1])))
    if not allowed:
        raise HTTPException(404, "课件不存在或不属于当前教师班级")
    path = UPLOAD_DIR / safe_name
    if not path.is_file():
        raise HTTPException(404, "课件文件不存在")
    suffix = Path(row[0]).suffix.lower()
    if suffix == ".pdf":
        return {"kind": "pdf", "name": row[0], "content": ""}
    try:
        content = extract_courseware_text(row[0], path.read_bytes())
    except DocumentTextError as error:
        raise HTTPException(400, str(error)) from error
    return {"kind": "markdown" if suffix == ".md" else "text", "name": row[0], "content": content}


@app.post("/api/session/attachment")
async def add_session_attachment(
    session_id: str = Form(...),
    course_id: str = Form("scratch"),
    username: str = Form(...),
    file: UploadFile = File(...),
    x_session_token: str = Header(default=""),
):
    username = require_authenticated_user(username, x_session_token)
    scoped_session_id = conversation_key(username, course_id, session_id)
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "文件内容为空")
    if len(raw) > 8_000_000:
        raise HTTPException(400, "单个附件不能超过 8 MB")
    filename = Path(file.filename or "附件").name
    text = extract_attachment_text(filename, raw).strip()
    if not text:
        raise HTTPException(400, "文件中没有可读取的文本")
    items = session_attachments.setdefault(scoped_session_id, [])
    if len(items) >= 5:
        raise HTTPException(400, "每个会话最多添加 5 个附件")
    attachment = {
        "id": uuid.uuid4().hex[:12],
        "name": filename[:120],
        "size": len(raw),
        "content": text[:60_000],
    }
    items.append(attachment)
    return {key: attachment[key] for key in ("id", "name", "size")}


@app.delete("/api/session/attachment/{course_id}/{session_id}/{attachment_id}")
async def remove_session_attachment(course_id: str, session_id: str, attachment_id: str, x_session_token: str = Header(default="")):
    username = session_user(x_session_token)["username"]
    scoped_session_id = conversation_key(username, course_id, session_id)
    items = session_attachments.get(scoped_session_id, [])
    session_attachments[scoped_session_id] = [item for item in items if item["id"] != attachment_id]
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════
# 模型切换
# ═══════════════════════════════════════════════════════════

@app.get("/api/models")
async def get_models():
    return {"models": list_models()}


@app.post("/api/models/switch")
async def switch_model_api(data: dict):
    model_id = data.get("model_id", "")
    if model_id not in {"flash", "pro"}:
        raise HTTPException(400, "未知模型")
    return {"status": "ok", "current": model_id}


# ═══════════════════════════════════════════════════════════
# 统计接口
# ═══════════════════════════════════════════════════════════

@app.get("/api/stats")
async def get_stats():
    return tutor.get_stats()


@app.post("/api/session/stats")
async def get_session_stats(data: dict, x_session_token: str = Header(default="")):
    session_id = data.get("session_id", "default")
    username = require_authenticated_user(data.get("username", "").strip(), x_session_token)
    scoped_session_id = conversation_key(username, data.get("course_id", "scratch"), session_id)
    s = session_stats.get(scoped_session_id, {"count": 0, "model": "", "tokens": 0})
    return s


@app.get("/api/global/stats")
async def get_global_stats():
    """获取全局统计：总提问数、Token 用量"""
    return get_token_stats()


@app.post("/api/user/stats")
async def get_user_stats(data: dict, x_session_token: str = Header(default="")):
    """获取用户统计：今日、总计、Token"""
    username = data.get("username", "anonymous")
    if username == "anonymous":
        return {"today_queries": 0, "total_queries": 0, "today_tokens": 0, "total_tokens": 0}
    username = require_authenticated_user(username, x_session_token)

    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    today = date.today().isoformat()

    # 今日统计
    c.execute("SELECT query_count, token_count FROM daily_stats WHERE username = ? AND date = ?", (username, today))
    row = c.fetchone()
    today_queries = row[0] if row else 0
    today_tokens = row[1] if row else 0

    # 总计
    c.execute("SELECT SUM(query_count), SUM(token_count) FROM daily_stats WHERE username = ?", (username,))
    row = c.fetchone()
    total_queries = row[0] if row and row[0] else 0
    total_tokens = row[1] if row and row[1] else 0

    conn.close()

    return {
        "today_queries": today_queries,
        "total_queries": total_queries,
        "today_tokens": today_tokens,
        "total_tokens": total_tokens
    }


@app.get("/api/stats/global")
async def get_global_stats():
    """全局统计"""
    global total_global_count
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM users")
    user_count = c.fetchone()[0]
    c.execute("SELECT SUM(query_count), SUM(token_count) FROM daily_stats")
    row = c.fetchone()
    conn.close()

    total_queries = row[0] if row and row[0] else 0
    total_tokens = row[1] if row and row[1] else 0

    return {
        "total_queries": total_queries + total_global_count,
        "total_tokens": total_tokens,
        "user_count": user_count,
        "active_sessions": len(sessions)
    }


# ═══════════════════════════════════════════════════════════
# 通用接口
# ═══════════════════════════════════════════════════════════

@app.post("/api/clear")
async def clear_session(data: dict, x_session_token: str = Header(default="")):
    session_id = data.get("session_id", "default")
    username = data.get("username", "anonymous")
    if username != "anonymous":
        username = require_authenticated_user(username, x_session_token)
    scoped_session_id = conversation_key(username, data.get("course_id", "scratch"), session_id)
    sessions.pop(scoped_session_id, None)
    session_stats.pop(scoped_session_id, None)
    session_attachments.pop(scoped_session_id, None)
    return {"status": "ok", "message": "历史已清除"}


@app.get("/api/learning/memory/{username}")
async def get_memory(username: str, x_session_token: str = Header(default="")):
    return get_learning_memory(require_path_user(username, x_session_token))


@app.post("/api/learning/memory")
async def update_memory(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    memory = get_learning_memory(username)
    for key in ("active_topics", "weak_points"):
        if key in data and isinstance(data[key], list):
            memory[key] = [str(item).strip()[:56] for item in data[key] if str(item).strip()][:10]
    save_learning_memory(username, memory)
    return {"status": "ok", **memory}


@app.get("/api/learning/daily/{username}")
async def get_daily_learning(username: str, x_session_token: str = Header(default="")):
    username = require_path_user(username, x_session_token)
    ensure_learning_reviews(username)
    today = date.today()
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute("SELECT query_count, token_count FROM daily_stats WHERE username = ? AND date = ?", (username, today.isoformat())).fetchone()
    goal_row = conn.execute("SELECT goal, completed FROM daily_learning_goals WHERE username = ? AND date = ?", (username, today.isoformat())).fetchone()
    review_rows = conn.execute("SELECT id, topic, source_type, stage, due_at FROM learning_reviews WHERE username = ? AND completed = 0 AND due_at <= ? ORDER BY due_at ASC LIMIT 5", (username, datetime.now().isoformat())).fetchall()
    conn.close()
    streak = 0
    cursor = today
    while True:
        conn = sqlite3.connect(str(DB_PATH))
        active = conn.execute("SELECT 1 FROM daily_stats WHERE username = ? AND date = ? AND query_count > 0", (username, cursor.isoformat())).fetchone()
        conn.close()
        if not active:
            break
        streak += 1
        from datetime import timedelta
        cursor -= timedelta(days=1)
    memory = get_learning_memory(username)
    return {
        "streak": streak,
        "today_queries": row[0] if row else 0,
        "today_tokens": row[1] if row else 0,
        "goal": goal_row[0] if goal_row else "今天完成一次专注学习",
        "goal_completed": bool(goal_row[1]) if goal_row else False,
        "topics": memory["active_topics"][:4],
        "review_count": len(review_rows),
        "reviews": [dict(zip(("id", "topic", "source_type", "stage", "due_at"), item)) for item in review_rows],
        "weak_points": memory["weak_points"][:4],
    }


@app.post("/api/learning/daily/goal")
async def save_daily_goal(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    goal = data.get("goal", "").strip()[:80] or "今天完成一次专注学习"
    completed = int(bool(data.get("completed", False)))
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("INSERT INTO daily_learning_goals (username, date, goal, completed) VALUES (?, ?, ?, ?) ON CONFLICT(username, date) DO UPDATE SET goal=excluded.goal, completed=excluded.completed", (username, date.today().isoformat(), goal, completed))
    conn.commit(); conn.close()
    return {"status": "ok", "goal": goal, "completed": bool(completed)}


@app.post("/api/learning/share")
async def create_learning_share(data: dict, x_session_token: str = Header(default="")):
    username = require_learning_user(data, x_session_token)
    kind = data.get("kind", "card")
    if kind not in {"card", "summary"}:
        raise HTTPException(400, "分享类型无效")
    title = data.get("title", "我的学习成果").strip()[:80] or "我的学习成果"
    content = data.get("content", {})
    if not isinstance(content, dict):
        raise HTTPException(400, "分享内容无效")
    share_id = uuid.uuid4().hex[:24]
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("INSERT INTO learning_shares (share_id, username, kind, title, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?)", (share_id, username, kind, title, json.dumps(content, ensure_ascii=False), datetime.now().isoformat()))
    conn.commit(); conn.close()
    return {"status": "ok", "share_path": f"/learning-share/{share_id}"}


@app.get("/learning-share/{share_id}", response_class=HTMLResponse)
async def view_learning_share(share_id: str):
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute("SELECT kind, title, content_json, created_at FROM learning_shares WHERE share_id = ?", (share_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "学习成果链接不存在")
    payload = json.dumps({"kind": row[0], "title": row[1], "content": json.loads(row[2]), "created_at": row[3]}, ensure_ascii=False).replace("</", "<\\/")
    return HTMLResponse(f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>学习成果</title><style>body{{margin:0;background:#f5f7fa;color:#18212c;font:15px/1.75 "Microsoft YaHei UI","Microsoft YaHei",sans-serif}}main{{max-width:720px;margin:0 auto;padding:52px 20px}}article{{background:#fff;border:1px solid #e4e8ee;border-radius:8px;padding:28px}}h1{{font-size:24px;margin:0 0 8px}}.meta{{color:#667085;font-size:13px;margin-bottom:24px}}.tag{{display:inline-block;color:#245bb5;background:#eaf1ff;border-radius:4px;padding:2px 8px;font-size:12px}}h2{{font-size:15px;margin:22px 0 8px}}p{{white-space:pre-wrap;margin:0}}li{{margin:6px 0}}</style></head><body><main><article><span class="tag" id="kind"></span><h1 id="title"></h1><div class="meta" id="meta"></div><section id="content"></section></article></main><script>const data={payload};document.title=data.title;document.getElementById('title').textContent=data.title;document.getElementById('kind').textContent=data.kind==='card'?'学习卡片':'知识总结';document.getElementById('meta').textContent='由 AI 学习导师生成';const root=document.getElementById('content');Object.entries(data.content).forEach(([key,value])=>{{if(value==null||value==='')return;const h=document.createElement('h2');h.textContent=key;root.appendChild(h);if(Array.isArray(value)){{const ul=document.createElement('ul');value.forEach(v=>{{const li=document.createElement('li');li.textContent=v;ul.appendChild(li)}});root.appendChild(ul)}}else{{const p=document.createElement('p');p.textContent=value;root.appendChild(p)}}}});</script></body></html>''')


@app.post("/api/feedback")
async def submit_feedback(data: dict):
    content = data.get("content", "").strip()
    session_id = data.get("session_id", "default")
    if not content:
        raise HTTPException(400, "反馈内容不能为空")

    feedback_path = FEEDBACK_DIR / f"feedback_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{session_id[:8]}.txt"
    feedback_path.write_text(f"时间：{datetime.now().isoformat()}\n会话：{session_id}\n内容：{content}", encoding="utf-8")
    return {"status": "ok", "message": "感谢反馈！"}


@app.post("/api/feedback/upload")
async def submit_feedback_upload(
    content: str = Form(...),
    session_id: str = Form(default="default"),
    files: list[UploadFile] = File(default=[]),
):
    content = content.strip()
    if not content:
        raise HTTPException(400, "反馈内容不能为空")
    if len(files) > 5:
        raise HTTPException(400, "最多上传 5 个附件")

    feedback_id = f"feedback_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    feedback_folder = FEEDBACK_DIR / feedback_id
    feedback_folder.mkdir(parents=True, exist_ok=False)
    saved_names = []
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"}
    for upload in files:
        if upload.content_type not in allowed_types:
            raise HTTPException(400, f"不支持的附件类型：{upload.filename or '未知文件'}")
        data = await upload.read(20 * 1024 * 1024 + 1)
        if len(data) > 20 * 1024 * 1024:
            raise HTTPException(400, f"附件不能超过 20MB：{upload.filename or '未知文件'}")
        suffix = Path(upload.filename or "attachment").suffix.lower()
        stored_name = f"{uuid.uuid4().hex[:10]}{suffix}"
        (feedback_folder / stored_name).write_bytes(data)
        saved_names.append(f"{upload.filename or stored_name} -> {stored_name}")

    (feedback_folder / "feedback.txt").write_text(
        f"时间：{datetime.now().isoformat()}\n会话：{session_id[:120]}\n附件：{', '.join(saved_names) or '无'}\n内容：{content}",
        encoding="utf-8",
    )
    return {"status": "ok", "message": "感谢反馈！", "attachments": len(saved_names)}


@app.post("/api/share")
async def create_share(data: dict):
    messages = data.get("messages", [])
    title = data.get("title", "Shared chat").strip()[:80] or "Shared chat"
    if not isinstance(messages, list) or not messages:
        raise HTTPException(400, "No conversation to share")

    clean_messages = []
    for message in messages[-50:]:
        if not isinstance(message, dict) or message.get("role") not in ("user", "assistant"):
            continue
        content = str(message.get("content", "")).strip()
        if content:
            clean_messages.append({"role": message["role"], "content": content[:10000]})
    if not clean_messages:
        raise HTTPException(400, "No conversation to share")

    share_id = uuid.uuid4().hex[:24]
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        "INSERT INTO shared_chats (share_id, title, messages_json, created_at) VALUES (?, ?, ?, ?)",
        (share_id, title, json.dumps(clean_messages, ensure_ascii=False), datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "share_path": f"/share/{share_id}"}


@app.get("/share/{share_id}", response_class=HTMLResponse)
async def view_share(share_id: str):
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute(
        "SELECT title, messages_json FROM shared_chats WHERE share_id = ?", (share_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Share link not found")

    payload = json.dumps({"title": row[0], "messages": json.loads(row[1])}, ensure_ascii=False).replace("</", "<\\/")
    return HTMLResponse(f'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Shared chat</title><style>
*{{box-sizing:border-box}} body{{margin:0;background:#f0f2f5;color:#1a1a2e;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif}} main{{max-width:820px;margin:0 auto;padding:32px 20px}} header{{margin-bottom:24px}} h1{{font-size:22px;margin:0 0 8px}} p{{color:#667085;margin:0}} .message{{display:flex;margin:16px 0}} .message.user{{justify-content:flex-end}} .bubble{{max-width:82%;padding:12px 16px;border-radius:12px;background:#fff;white-space:pre-wrap;line-height:1.7;box-shadow:0 1px 3px #00000010}} .user .bubble{{background:#667eea;color:#fff}} footer{{margin-top:30px;text-align:center;color:#98a2b3;font-size:12px}}
</style></head><body><main><header><h1 id="title"></h1><p>只读分享对话</p></header><section id="messages"></section><footer>AI 学习导师</footer></main><script>
const chat = {payload}; document.title = chat.title; document.getElementById('title').textContent = chat.title;
const container = document.getElementById('messages'); chat.messages.forEach(message => {{ const item = document.createElement('div'); item.className = 'message ' + message.role; const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = message.content; item.appendChild(bubble); container.appendChild(item); }});
</script></body></html>''')


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": "5.0.0",
        "indexed_files": len(tutor.indexed_files),
        "active_sessions": len(sessions)
    }


# ── 启动 ─────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    import sys
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding='utf-8')
    port = int(os.getenv("PORT", 8899))
    print("启码 AI 学伴启动成功")
    print(f"打开浏览器访问: http://localhost:{port}")
    print("统计功能：今日提问、总提问、Token 用量")
    uvicorn.run(app, host="0.0.0.0", port=port)
