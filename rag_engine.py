"""
md-rag-tutor / rag_engine.py
RAG 核心引擎 - 文档切分 + Embedding + FAISS 向量检索 + LLM 生成
"""
import os
import re
import hashlib
from pathlib import Path
from typing import List, Dict, Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env.local", override=True)

# 默认沿用本地离线模式；容器首次部署可设置 HF_OFFLINE=0 下载模型。
if os.getenv("HF_OFFLINE", "1") == "1":
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"
os.environ.setdefault("HF_ENDPOINT", "https://huggingface.co")

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from openai import OpenAI

# ── 全局统计 ──────────────────────────────────────────────
total_tokens = {"prompt": 0, "completion": 0, "total": 0}
total_questions = 0


def add_usage(usage=None, query="", answer=""):
    """累加 token 用量（支持 API 返回的 usage 和本地估算）"""
    global total_questions
    total_questions += 1
    if usage is not None and usage.total_tokens and usage.total_tokens > 0:
        total_tokens["prompt"] += usage.prompt_tokens or 0
        total_tokens["completion"] += usage.completion_tokens or 0
        total_tokens["total"] += usage.total_tokens or 0
    else:
        # Ollama 本地模型不返回 usage，按字数估算
        prompt_tokens = max(1, len(query) * 2)
        completion_tokens = max(1, len(answer) * 2)
        total_tokens["prompt"] += prompt_tokens
        total_tokens["completion"] += completion_tokens
        total_tokens["total"] += prompt_tokens + completion_tokens


def get_token_stats():
    """获取全局 token 统计"""
    global total_questions
    return {
        "total_questions": total_questions,
        "prompt_tokens": total_tokens["prompt"],
        "completion_tokens": total_tokens["completion"],
        "total_tokens": total_tokens["total"]
    }


# ── 模型配置 ──────────────────────────────────────────────
MODEL_CONFIG = {
    "free": {
        "name": "Free",
        "label": "Free",
        "model": "qwen2.5:1.5b",
        "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        "api_key": "ollama"
    },
    "flash": {
        "name": "Flash",
        "label": "Flash",
        "model": "glm-5.2-free",
        "base_url": os.getenv("CLOUD_BASE_URL", "https://api.ccode.vip/v1"),
        "api_key": ""
    },
    "pro": {
        "name": "Pro",
        "label": "Pro",
        "model": "deepseek-v4-flash-free",
        "base_url": os.getenv("CLOUD_BASE_URL", "https://api.ccode.vip/v1"),
        "api_key": ""
    }
}

current_model_id = "free"
_llm_clients = {}


def get_llm(model_id: str | None = None, username: str | None = None):
    """获取指定模型的 OpenAI 客户端 + model_name
    复用客户端：避免每次创建新 httpx 连接导致 502
    """
    selected_model_id = model_id if model_id in MODEL_CONFIG else current_model_id
    cfg = MODEL_CONFIG[selected_model_id]
    resolved = None
    from backend.services.ai_settings import has_ai_settings, resolve_ai_settings
    use_persisted = selected_model_id in ("flash", "pro") or (model_id is None and has_ai_settings("__default__"))
    if use_persisted:
        resolved = resolve_ai_settings(username or "", selected_model_id)
        from backend.services.user_ai_keys import get_user_ai_key
        resolved["api_key"] = get_user_ai_key(username or "") or resolved.get("api_key") or os.getenv("CCODE_API_KEY", "") or os.getenv("PRO_API_KEY", "")
    if resolved:
        base_url = resolved["api_url"]
        api_key = resolved["api_key"]
        model_name = resolved["model"]
    else:
        base_url = cfg["base_url"]
        api_key = cfg["api_key"]
        model_name = cfg["model"]

    config_key = (api_key, base_url)
    client = _llm_clients.get(config_key)
    if client is None:
        client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=600.0,
            max_retries=0  # 我们自己控制重试
        )
        _llm_clients[config_key] = client
    return client, model_name


def get_generation_options(model_id: str | None = None, username: str | None = None) -> dict:
    """Return configurable completion parameters without exposing storage details."""
    selected_model_id = model_id if model_id in MODEL_CONFIG else current_model_id
    from backend.services.ai_settings import has_ai_settings, resolve_ai_settings
    if selected_model_id in ("flash", "pro") or (model_id is None and has_ai_settings("__default__")):
        settings = resolve_ai_settings(username or "", selected_model_id)
        options = {
            "temperature": settings["temperature"],
            "top_p": settings["top_p"],
        }
        if settings.get("max_tokens", 0) > 0:
            options["max_tokens"] = settings["max_tokens"]
        for key, value in settings.get("extra", {}).items():
            if key not in {"model", "messages", "stream"}:
                options[key] = value
        return options
    return {"temperature": 0.7}


def reset_llm_client():
    """切换模型时重置客户端"""
    _llm_clients.clear()


def switch_model(model_id: str, pro_api_key: str = "") -> dict:
    """切换模型"""
    global current_model_id
    if model_id not in MODEL_CONFIG:
        return {"status": "error", "message": f"未知模型: {model_id}"}
    current_model_id = model_id
    if model_id in ("flash", "pro") and pro_api_key:
        os.environ["CCODE_API_KEY"] = pro_api_key
    reset_llm_client()  # 切换模型时重置客户端
    return {"status": "ok", "current": model_id}


def list_models() -> list:
    """返回可选模型列表"""
    result = []
    for mid in ("flash", "pro"):
        cfg = MODEL_CONFIG[mid]
        item = {"id": mid, "label": cfg.get("label", cfg["name"])}
        result.append(item)
    return result

# ── AI 学习导师 系统提示词 ──────────────────────────────
SYSTEM_PROMPT = """你是“启码 AI 学伴”，由产品团队开发和维护，专门帮助少年儿童学习编程。你的使命是用安全、耐心、循序渐进的方式辅导 Scratch、Python 和 C++，帮助学生理解概念、阅读代码、定位错误并形成自己的解题思路。

## 产品身份与保密
- 对外身份始终是“启码 AI 学伴”，不要自称任何底层模型或模型厂商。
- 用户询问模型、厂商、API、训练方或供应商时，不得提及任何具体底层模型、公司或接口名称。
- 统一说明：我是启码 AI 学伴，由产品团队开发和维护，专门帮助孩子学习少儿编程。底层技术与供应链属于内部实现，不对外披露，不影响你的使用。
- 不要声称底层大模型完全由产品团队从零训练。

## 核心原则
1. 通俗易懂 — 用生活化的比喻解释复杂概念，避免术语轰炸。遇到变量、循环、函数、数组、递归等编程名词时必须主动解释。
2. 耐心细致 — 不预设对方有前置知识，每次回答都要考虑"这是个新手，我这样说他能听懂吗？"
3. 结构化输出 — 用清晰的层级、表格、路线图来呈现信息，避免大段文字堆砌。
   - Markdown 表格必须包含表头、分隔行，并且每一行单独换行。
   - 禁止用连续的 `||` 在同一行模拟表格；无法保证表格格式正确时，改用项目符号列表。
4. 鼓励引导 — 多鼓励，不打击学习热情。遇到不懂的问题是正常的，关键在于知道怎么学。

## 交互风格
- 用表情符号增加亲和力（🎯📚💡🚀🔥👍✅❌）
- 重要内容用 **加粗** 强调
- 代码用 `代码块` 展示
- 路线图用列表或表格清晰呈现
- 回答完知识点后，可以追问"这部分清楚了吗？要不要继续深入？"

## 你精通的知识领域
1. Scratch：积木、事件、循环、变量、条件和小游戏项目。
2. Python：基础语法、数据结构、函数、调试和入门算法。
3. C++：语法基础、流程控制、数组、函数、面向对象和竞赛入门。
4. 编程思维：分解问题、找规律、设计算法、测试与复盘。
5. 学习方法：根据学生当前程度给出小步练习，不一次灌输过多内容。

## 少儿辅导边界
- 优先给提示、例子和检查步骤；对作业与竞赛题不要直接代做完整答案。
- 不收集学生真实姓名、学校、住址、联系方式等个人信息。
- 遇到不适合未成年人的内容时停止展开，并引导学生向老师或家长求助。

## 术语解释风格
遇到专业术语时，必须用这样的格式解释：
> **术语** 🤔
> 👉 大白话：用生活比喻一句话解释
> 👉 专业角度：技术定义
> 👉 学这个需要：前置知识和学习路径"""


# ═══════════════════════════════════════════════════════════
# 第一部分：文档切分（Markdown Chunking）
# ═══════════════════════════════════════════════════════════

class DocumentChunker:
    """
    文档切分器：把 Markdown 按标题切成语义块
    为什么要切分？
    - 整篇文章太长，AI 上下文窗口有限
    - 按标题切分后，可以只找跟问题最相关的那段
    """

    @staticmethod
    def chunk_markdown(text: str, filename: str = "unknown.md") -> List[Dict]:
        """
        把 Markdown 文本切成语义块：
        - 按 ## / ### 标题切分
        - 段落太长则按空行再切
        """
        chunks = []
        lines = text.split("\n")

        current_header = ""
        current_section = []

        for line in lines:
            header_match = re.match(r"^(#{1,4})\s+(.+)$", line)
            if header_match:
                if current_section:
                    chunk_text = current_header + "\n" + "\n".join(current_section)
                    chunk_text = chunk_text.strip()
                    if len(chunk_text) > 10:
                        chunks.append(chunk_text)
                    current_section = []

                level = len(header_match.group(1))
                if level <= 3:
                    current_header = line
                else:
                    current_section.append(line)
            else:
                current_section.append(line)

        if current_section:
            chunk_text = current_header + "\n" + "\n".join(current_section)
            chunk_text = chunk_text.strip()
            if len(chunk_text) > 10:
                chunks.append(chunk_text)

        if not chunks and text.strip():
            chunks = [text.strip()]

        # 太长的段落继续切
        final_chunks = []
        for chunk in chunks:
            if len(chunk) > 1000:
                sub_parts = chunk.split("\n\n")
                for sp in sub_parts:
                    sp = sp.strip()
                    if sp and len(sp) > 10:
                        final_chunks.append(sp)
            else:
                final_chunks.append(chunk)

        # 生成 id
        result = []
        for i, chunk in enumerate(final_chunks):
            doc_id = hashlib.md5(f"{filename}:{i}:{chunk[:50]}".encode()).hexdigest()[:12]
            result.append({
                "id": doc_id,
                "text": chunk,
                "source": filename
            })

        return result


# ═══════════════════════════════════════════════════════════
# 第二部分：语义检索器（Embedding + FAISS 向量检索）
# ═══════════════════════════════════════════════════════════

class SemanticRetriever:
    """
    语义检索器，基于 Embedding + FAISS 向量检索

    原理：
    1. 把文档片段转成"语义向量"（一串数字，代表这段文本的含义）
    2. 把向量存入 FAISS 索引（高效的相似度搜索引擎）
    3. 用户提问时，把问题也转成向量
    4. 在 FAISS 里找跟问题向量最接近的文档向量

    为什么比关键词搜索强？
    - "苹果手机怎么样" 和 "iPhone 评测" → 语义接近，能匹配上
    - 关键词搜索做不到，因为它只看有没有共同的字
    """

    def __init__(self, model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"):
        self.documents: List[Dict] = []
        self.index = None          # FAISS 向量索引
        self.embedder = None       # SentenceTransformer 模型
        self.model_name = model_name
        self._ready = False

    def load_model(self):
        """加载 Embedding 模型（启动时调用，只需加载一次）"""
        if self.embedder is not None:
            return

        # 离线模式：模型已下载到缓存，不让它联网检查缺了啥文件
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        os.environ["HF_HUB_OFFLINE"] = "1"

        self.embedder = SentenceTransformer(self.model_name)
        dim = self.embedder.get_embedding_dimension()
        print(f"Embedding 模型加载完成。模型: {self.model_name}，向量维度: {dim}")

    def add_documents(self, documents: List[Dict]):
        """添加文档并重建 FAISS 索引"""
        self.documents = documents
        if not documents:
            self._ready = False
            return

        self.load_model()

        # 把所有文档转成向量
        texts = [doc["text"] for doc in documents]
        embeddings = self.embedder.encode(texts, show_progress_bar=True)

        # 构建 FAISS 索引（IndexFlatIP = 内积索引，归一化后就是余弦相似度）
        dim = embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dim)
        faiss.normalize_L2(embeddings)  # 归一化 → 内积 = 余弦相似度
        self.index.add(embeddings)

        self._ready = True
        print(f"FAISS 索引构建完成，共 {self.index.ntotal} 个向量")

    def query(self, query_text: str, top_k: int = 5) -> List[Dict]:
        """检索最相关的文档片段"""
        if not self._ready or self.index is None:
            return []

        # 把问题转成向量
        query_vec = self.embedder.encode([query_text])
        faiss.normalize_L2(query_vec)

        # 在 FAISS 里找最像的 top_k 个
        scores, indices = self.index.search(query_vec, top_k)

        results = []
        for i, idx in enumerate(indices[0]):
            if idx < 0 or idx >= len(self.documents):
                continue
            score = float(scores[0][i])
            if score > 0:
                results.append({"score": round(score, 4), **self.documents[idx]})

        return results

    def get_stats(self):
        """获取状态信息"""
        return {
            "model": self.model_name,
            "ready": self._ready,
            "vector_count": self.index.ntotal if self.index is not None else 0,
            "dimension": self.embedder.get_embedding_dimension() if self.embedder else 0
        }


# ═══════════════════════════════════════════════════════════
# 第三部分：RAG 引擎（整合所有组件）
# ═══════════════════════════════════════════════════════════

class RagEngine:
    """
    RAG 引擎：文档切分 → 向量检索(Embedding+FAISS) → LLM 生成

    完整流程：
    ① 用户上传 .md 笔记
    ② 按标题切分成小段（chunk）
    ③ 每段转成向量，存入 FAISS
    ④ 用户提问
    ⑤ 问题也转成向量 → FAISS 找最相关的段落
    ⑥ 相关段落 + 问题 + 导师人设 → 发给 DeepSeek
    ⑦ AI 结合笔记内容回答
    """

    def __init__(self):
        pass

    def ask(self, query: str, history: list = None, model_id: str | None = None, username: str | None = None) -> str:
        """检索 + 生成"""
        # 1. 检索相关文档
        context_docs = self.retrieve(query)

        # 2. 构造上下文
        context = ""
        if context_docs:
            context = "以下是用户学习笔记中的相关内容，请参考这些内容回答问题：\n\n"
            for i, doc in enumerate(context_docs, 1):
                context += f"--- 参考资料 {i} ---\n{doc}\n\n"
        else:
            context = "（知识库中没有找到相关的内容，请用你自己的知识回答）\n\n"

        # 3. 构造 messages
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        if history:
            for h in history[-6:]:
                messages.append(h)

        user_content = f"{context}\n---\n用户问题：{query}"
        messages.append({"role": "user", "content": user_content})

        # 4. 调用大模型（用当前选中的模型，加重试，Ollama 偶尔 502）
        llm, model_name = get_llm(model_id, username)
        generation_options = get_generation_options(model_id, username)
        import time
        last_err = None
        for retry in range(3):
            try:
                response = llm.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    **generation_options
                )
                answer_text = response.choices[0].message.content
                add_usage(response.usage, query, answer_text)
                return answer_text
            except Exception as e:
                last_err = e
                print(f"回答模型调用失败({retry+1}/3): {e}")
                if retry < 2:
                    time.sleep(3)
        raise Exception(f"模型调用失败 3 次：{last_err}")

    # ── 获取状态 ─────────────────────────────────────────
    def get_stats(self):
        stats = {
            "total_docs": len(self.documents),
            "indexed_files": list(self.indexed_files),
            "retriever_ready": self.retriever._ready
        }

        if self.retriever._ready:
            stats["retriever"] = self.retriever.get_stats()

        return stats


# ═══════════════════════════════════════════════════════════
# 第四部分：AI 学习导师 Agent（独立服务）
# ═══════════════════════════════════════════════════════════

class AgentEngine:
    """
    AI 学习导师 Agent 引擎

    与 RagEngine 的区别：
    - RagEngine：先检索知识库，再让AI结合笔记回答
    - AgentEngine：直接用 AI 自己的知识回答（就像网飞上的AI老师）

    为什么需要分开？
    - Agent 是"纯 AI"回答，不需要上传任何笔记
    - 可以给不愿意上传资料的用户使用
    - 未来可以给 Agent 加工具（搜索、计算等）
    """

    def __init__(self):
        # 大模型客户端（用当前选中的模型）
        pass

    def ask(self, query: str, history: list = None, model_id: str | None = None, username: str | None = None) -> str:
        """
        Agent 回答：直接用 AI 知识回答，不检索知识库
        """
        # 1. 组装 messages（System Prompt + 历史 + 当前问题）
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        if history:
            # 保留最近6轮对话
            for h in history[-6:]:
                messages.append(h)

        # 用户问题（不加"知识库相关内容"前缀）
        messages.append({"role": "user", "content": query})

        # 2. 调用大模型（用当前选中的模型）
        llm, model_name = get_llm(model_id, username)
        generation_options = get_generation_options(model_id, username)
        response = llm.chat.completions.create(
            model=model_name,
            messages=messages,
            **generation_options
        )

        return response.choices[0].message.content


# ═══════════════════════════════════════════════════════════
# 第五部分：全能 AI 导师（UnifiedRagAgent）
# ═══════════════════════════════════════════════════════════

class UnifiedRagAgent:
    """
    全能 AI 导师 —— 合并 RAG + Agent 的统一引擎

    与 RagEngine / AgentEngine 的区别：
    - RagEngine：强制检索知识库再回答（不管需不需要）
    - AgentEngine：完全不检索，直接用 AI 知识回答
    - UnifiedRagAgent：AI 自己决定要不要检索知识库

    工作原理：
    ① 用户提问
    ② AI 判断：这个问题需不需要查知识库？
        ├─ 需要 → 去 FAISS 检索 → 结合检索内容回答
        └─ 不需要 → 直接用 AI 知识回答
    ③ 返回答案
    """

    def __init__(self):
        self.chunker = DocumentChunker()
        self.retriever = SemanticRetriever()
        self.documents = []
        self.indexed_files = set()

    def load_model(self):
        """加载 Embedding 模型"""
        self.retriever.load_model()

    def load_builtin_knowledge(self):
        """加载内置知识库（启动时自动调用）"""
        knowledge_dir = Path(__file__).parent / "builtin_knowledge"
        if not knowledge_dir.exists():
            print("内置知识库目录不存在，跳过")
            return {"status": "empty", "total_chunks": 0}

        total = 0
        for f in sorted(knowledge_dir.glob("*.md")):
            text = f.read_text(encoding="utf-8")
            result = self.index_document(text, filename=f.name)
            total += result["chunks"]
            print(f"  {f.name}: {result['chunks']} 个片段")

        print(f"内置知识库加载完成，共 {total} 个知识片段")
        return {"status": "ok", "total_chunks": total}

    def index_document(self, text: str, filename: str = "unknown.md"):
        """切分文档 → 向量化 → 加入 FAISS 索引"""
        chunks = self.chunker.chunk_markdown(text, filename)
        if not chunks:
            return {"status": "empty", "chunks": 0}

        if filename in self.indexed_files:
            self.documents = [d for d in self.documents if d.get("source") != filename]

        self.documents.extend(chunks)
        self.indexed_files.add(filename)
        self.retriever.add_documents(self.documents)

        return {"status": "ok", "chunks": len(chunks)}

    def retrieve(self, query: str, top_k: int = 5) -> List[str]:
        """向量检索"""
        results = self.retriever.query(query, top_k=top_k)
        return [r["text"] for r in results]

    def ask(self, query: str, history: list = None, learning_context: str = "", tutor_mode: str = "explain", model_id: str | None = None, username: str | None = None) -> str:
        """
        统一问答入口：AI 自己决定是否检索知识库
        """
        # 1. 先让 AI 判断是否需要检索（加重试，Ollama 首次加载可能 502）
        import time
        llm_judge, judge_model = get_llm(model_id, username)
        judge_options = get_generation_options(model_id, username)
        judge_prompt = f"""你是一个AI知识库管理员。你的任务就是判断"是否需要查资料"来回答用户的问题。

规则：
- 如果问题涉及 **Scratch、Python、C++、算法、代码调试或机构课程中的具体知识点**，回答 "need_search"
- 如果问题是闲聊、创作或与少儿编程无关的开放性问题，回答 "no_search"
- 只回答 "need_search" 或 "no_search"，不要输出其他内容

用户问题：{query}"""

        decision = "need_search"  # 默认检索
        for retry in range(3):
            try:
                judge_response = llm_judge.chat.completions.create(
                    model=judge_model,
                    messages=[{"role": "user", "content": judge_prompt}],
                    **{**judge_options, "temperature": 0.1}
                )
                decision = judge_response.choices[0].message.content.strip().lower()
                break
            except Exception as e:
                print(f"判断模型调用失败({retry+1}/3): {e}")
                time.sleep(2)

        # 2. 根据判断执行
        context = ""
        need_search = "need" in decision

        if need_search:
            context_docs = self.retrieve(query)
            if context_docs:
                context = "以下是AI学习知识库中的相关内容，请参考这些内容回答问题：\n\n"
                for i, doc in enumerate(context_docs, 1):
                    context += f"--- 参考资料 {i} ---\n{doc}\n\n"

        # 3. 组装 messages
        tutor_mode_prompts = {
            "explain": "用通俗、循序渐进的语言讲解：先给结论，再给例子和可执行的下一步。",
            "socratic": "采用苏格拉底式引导：优先提出一个关键问题，让学习者自己推理；必要时再给提示和简短纠正。",
            "interview": "作为面试官：围绕当前主题逐步追问，给出简洁、具体的反馈，并指出下一轮该补什么。",
            "review": "作为代码审查导师：先指出问题，再解释影响，最后给出可以直接执行的修改建议；没有代码时请说明需要什么上下文。",
            "quiz": "作为出题老师：一次只出一道有针对性的题目，等待用户作答后再点评；不要提前给出答案。",
        }
        guidance = tutor_mode_prompts.get(tutor_mode, tutor_mode_prompts["explain"])
        system_content = SYSTEM_PROMPT + "\n\n当前导师方式：" + guidance
        if learning_context:
            system_content += "\n\n学习记忆（仅作连续教学参考，不要逐字复述给用户）：\n" + learning_context
        messages = [{"role": "system", "content": system_content}]

        if history:
            for h in history[-6:]:
                messages.append(h)

        user_content = f"{context}\n---\n用户问题：{query}" if context else query
        messages.append({"role": "user", "content": user_content})

        # 4. 调用大模型（用当前选中的模型，加重试，Ollama 偶尔 502）
        llm, model_name = get_llm(model_id, username)
        generation_options = get_generation_options(model_id, username)
        import time
        last_err = None
        for retry in range(3):
            try:
                response = llm.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    **generation_options
                )
                answer_text = response.choices[0].message.content
                add_usage(response.usage, query, answer_text)
                return answer_text
            except Exception as e:
                last_err = e
                print(f"回答模型调用失败({retry+1}/3): {e}")
                if retry < 2:
                    time.sleep(3)
        raise Exception(f"模型调用失败 3 次：{last_err}")

    def get_stats(self):
        """获取状态信息"""
        stats = {
            "total_docs": len(self.documents),
            "indexed_files": list(self.indexed_files),
            "retriever_ready": self.retriever._ready
        }
        if self.retriever._ready:
            stats["retriever"] = self.retriever.get_stats()
        return stats
# Load machine-local secrets without adding another dependency. Existing process
# variables still win, which keeps Docker and deployment environments unchanged.
for local_env_path in (Path(__file__).with_name(".env.local"), Path(__file__).with_name(".env")):
    if not local_env_path.exists():
        continue
    for raw_line in local_env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
