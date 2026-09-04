import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Edit3,
  FileSearch,
  FileText,
  Info,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { apiFetch } from "../api/client";
import type { OjProblem } from "../data/ojProblems";
import type { Quota } from "../types";
import { ContestDraftEditor } from "./ContestDraftEditor";
import type { TeachingClass } from "./ClassPanel";

export interface TeacherContestRecord {
  id: string;
  teacher: string;
  title: string;
  language: "python" | "cpp" | "scratch";
  duration: number;
  status: "draft" | "published";
  source_name: string;
  problems: OjProblem[];
  problem_count: number;
  points: number;
  created_at: string;
  start_at?: string | null;
  end_at?: string | null;
  ai_policy?: "disabled" | "hints" | "normal";
  ranking_visible: boolean;
  class_scope?: string;
}

interface ContestCreatorProps {
  username: string;
  modelId: string;
  onPublished: (contest: TeacherContestRecord) => void;
  onQuota?: (quota: Quota) => void;
}

export function ContestCreator({
  username,
  modelId,
  onPublished,
  onQuota,
}: ContestCreatorProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"python" | "cpp" | "scratch">(
    "python",
  );
  const [duration, setDuration] = useState(90);
  const [drafts, setDrafts] = useState<TeacherContestRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<TeacherContestRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherContestRecord | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [classes, setClasses] = useState<TeachingClass[]>([]);
  const [classScope, setClassScope] = useState("all");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [knowledgePoints, setKnowledgePoints] = useState("");
  const [problemCount, setProblemCount] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);

  const loadDrafts = async () => {
    try {
      const result = await apiFetch<{ contests: TeacherContestRecord[] }>(
        `/api/teacher/contests?username=${encodeURIComponent(username)}`,
      );
      setDrafts(
        result.contests.filter((contest) => contest.status === "draft"),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "无法读取周赛草稿",
      );
    }
  };

  useEffect(() => {
    if (open) void loadDrafts();
  }, [open, username]);
  useEffect(() => {
    if (open)
      apiFetch<{ classes: TeachingClass[] }>(
        `/api/teacher/classes/options?username=${encodeURIComponent(username)}`,
      )
        .then((result) => setClasses(result.classes))
        .catch(() => undefined);
  }, [open, username]);

  const upload = async (
    event: ChangeEvent<HTMLInputElement>,
    mode: "rules" | "ai",
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!title.trim()) {
      setError("请先填写周赛名称");
      return;
    }
    const suffix = file.name.toLowerCase();
    if (
      ![".docx", ".pdf", ".md", ".markdown", ".txt"].some((extension) =>
        suffix.endsWith(extension),
      )
    ) {
      setError("仅支持 .md、.txt、.docx 和 .pdf 文件");
      return;
    }
    const form = new FormData();
    form.append("username", username);
    form.append("title", title.trim());
    form.append("language", language);
    form.append("duration", String(duration));
    form.append("class_scope", classScope);
    form.append("model_id", modelId);
    form.append("file", file);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{
        contest: TeacherContestRecord;
        quota?: Quota;
        charged?: number;
      }>(
        mode === "ai"
          ? "/api/teacher/contests/ai-import"
          : "/api/teacher/contests/import",
        { method: "POST", body: form },
      );
      setDrafts((current) => [result.contest, ...current]);
      setEditing(result.contest);
      if (result.quota) onQuota?.(result.quota);
      setNotice(
        `${mode === "ai" ? "AI 已识别" : "规则已识别"} ${result.contest.problem_count} 道题${result.charged ? `，已扣除 ${result.charged} 次提问资格` : ""}，请检查后发布。`,
      );
      setTitle("");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "文档处理失败",
      );
    } finally {
      setBusy(false);
    }
  };

  const generateWithAi = async () => {
    if (!title.trim()) {
      setError("请先填写周赛名称");
      return;
    }
    if (knowledgePoints.trim().length < 2) {
      setError("请填写考试范围或知识点");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{
        contest: TeacherContestRecord;
        quota: Quota;
        charged: number;
      }>("/api/teacher/contests/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          username,
          title: title.trim(),
          language,
          duration,
          class_scope: classScope,
          model_id: modelId,
          knowledge_points: knowledgePoints.trim(),
          problem_count: problemCount,
        }),
      });
      setDrafts((current) => [result.contest, ...current]);
      setEditing(result.contest);
      onQuota?.(result.quota);
      setNotice(
        `AI 已生成 ${result.contest.problem_count} 道题，已扣除 ${result.charged} 次提问资格，请检查后发布。`,
      );
      setTitle("");
      setKnowledgePoints("");
      setGenerateOpen(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "AI 生成失败",
      );
    } finally {
      setBusy(false);
    }
  };

  const createManual = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ contest: TeacherContestRecord }>("/api/teacher/contests/manual", {
        method: "POST",
        body: JSON.stringify({ username, title: title.trim() || "未命名周赛", language, duration, class_scope: classScope }),
      });
      setDrafts((current) => [result.contest, ...current]);
      setEditing(result.contest);
      setTitle("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "手动创建失败");
    } finally {
      setBusy(false);
    }
  };

  const removeDraft = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await apiFetch(
        `/api/teacher/contests/${deleteTarget.id}?username=${encodeURIComponent(username)}`,
        { method: "DELETE" },
      );
      setDrafts((current) =>
        current.filter((contest) => contest.id !== deleteTarget.id),
      );
      if (editing?.id === deleteTarget.id) setEditing(null);
      setNotice(`草稿“${deleteTarget.title}”已删除。`);
      setDeleteTarget(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "草稿删除失败",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className={`contest-creator ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="contest-create-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Plus size={20} strokeWidth={2.5} />
        老师创建周赛
      </button>
      {open && (
        <div className="contest-create-panel">
          <header>
            <div>
              <strong>创建周赛草稿</strong>
              <span>可用规则或 AI 识别文档，也可根据知识点直接生成试卷</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭创建面板"
            >
              <X size={17} />
            </button>
          </header>
          <div className="contest-create-form">
            <label>
              <span>周赛名称</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：Python 第三周基础赛"
                maxLength={120}
              />
            </label>
            <label>
              <span>课程</span>
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as typeof language)
                }
              >
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="scratch">Scratch</option>
              </select>
            </label>
            <label>
              <span>答题时长</span>
              <input
                type="number"
                min={15}
                max={300}
                value={duration}
                onChange={(event) =>
                  setDuration(Number(event.target.value) || 60)
                }
              />
              <i>分钟</i>
            </label>
            <label>
              <span>参赛范围</span>
              <select
                value={classScope}
                onChange={(event) => setClassScope(event.target.value)}
              >
                <option value="all">所有已登录学生</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="contest-create-actions">
            <button type="button" className="contest-manual-create" onClick={() => void createManual()} disabled={busy}>
              <Plus size={16} /> 手动创建
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !title.trim()}
            >
              <Upload size={16} />
              规则识别 <small>不扣次数</small>
            </button>
            <button
              type="button"
              className="is-ai"
              onClick={() => aiFileRef.current?.click()}
              disabled={busy || !title.trim()}
            >
              <FileSearch size={16} />
              AI 识别 <small>扣 1 次</small>
            </button>
            <button
              type="button"
              className="is-ai"
              onClick={() => setGenerateOpen(true)}
              disabled={busy || !title.trim()}
            >
              <Sparkles size={16} />
              AI 生成并识别 <small>扣 2 次</small>
            </button>
            <button type="button" onClick={() => setRulesOpen(true)}>
              <Info size={16} />
              查看识别规则
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,application/pdf"
              hidden
              onChange={(event) => void upload(event, "rules")}
            />
            <input
              ref={aiFileRef}
              type="file"
              accept=".md,.markdown,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,application/pdf"
              hidden
              onChange={(event) => void upload(event, "ai")}
            />
          </div>
          <p className="contest-template-hint">
            <FileText size={15} />
            所有方式只生成草稿，不会自动发布；请老师检查题目、答案和编程测试点。
          </p>
          {busy && (
            <p className="contest-ai-progress">正在整理试卷，请不要关闭页面…</p>
          )}
          {error && <p className="contest-create-error">{error}</p>}
          {notice && (
            <p className="contest-create-notice">
              <CheckCircle2 size={15} />
              {notice}
            </p>
          )}
          {editing ? (
            <ContestDraftEditor
              username={username}
              contest={editing}
              classes={classes}
              onCancel={() => setEditing(null)}
              onChanged={(contest) => {
                setEditing(contest);
                setDrafts((current) =>
                  current.map((item) =>
                    item.id === contest.id ? contest : item,
                  ),
                );
              }}
              onPublished={(contest) => {
                setEditing(null);
                setDrafts((current) =>
                  current.filter((item) => item.id !== contest.id),
                );
                setNotice(`${contest.title} 已发布，学生现在可以报名和答题。`);
                onPublished(contest);
              }}
            />
          ) : (
            !!drafts.length && (
              <div className="contest-drafts">
                <h3>待发布草稿</h3>
                {drafts.map((contest) => (
                  <article key={contest.id}>
                    <span className="contest-draft-file">
                      <FileText size={18} />
                    </span>
                    <div>
                      <strong>{contest.title}</strong>
                      <small>
                        {contest.source_name} · {contest.problem_count} 题 ·{" "}
                        {contest.points} 分 · {contest.duration} 分钟
                      </small>
                      <p>
                        {contest.problems
                          .slice(0, 4)
                          .map((problem) => problem.title)
                          .join("、")}
                        {contest.problem_count > 4 ? "…" : ""}
                      </p>
                    </div>
                    <div className="contest-draft-actions">
                      <button type="button" onClick={() => setEditing(contest)}>
                        <Edit3 size={15} />
                        编辑
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => setDeleteTarget(contest)}
                      >
                        <Trash2 size={15} />
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          )}
        </div>
      )}
      {deleteTarget && (
        <div
          className="exam-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting)
              setDeleteTarget(null);
          }}
        >
          <section
            className="exam-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-draft-title"
          >
            <span>
              <AlertTriangle size={24} />
            </span>
            <h2 id="delete-draft-title">删除这份草稿？</h2>
            <p>“{deleteTarget.title}”尚未发布，删除后无法恢复。</p>
            <div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                保留草稿
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={removeDraft}
                disabled={deleting}
              >
                {deleting ? "正在删除…" : "确认删除"}
              </button>
            </div>
          </section>
        </div>
      )}
      {rulesOpen && (
        <div className="exam-confirm-backdrop" role="presentation">
          <section
            className="exam-confirm contest-rules-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contest-rules-title"
          >
            <span>
              <BookOpen size={24} />
            </span>
            <h2 id="contest-rules-title">文档识别规则</h2>
            <div className="contest-rules-content">
              <p>
                <b>支持文件</b>：Markdown、TXT、DOCX、可提取文字的
                PDF，单个文件不超过 10 MB。
              </p>
              <p>
                <b>题目分隔</b>：使用“第1题”“题目1”“1.”“Question 1”等标题；GESP
                试卷可用“一、选择题”等大题标题。
              </p>
              <p>
                <b>字段名称</b>
                ：题型、题目描述、选项、答案、分值、难度、知识点、输入、输出、样例输入、样例输出。
              </p>
              <p>
                <b>选择题</b>：选项写成“A. 内容”“B.
                内容”，并填写“答案：A”。判断题答案支持“正确/错误、对/错、true/false”。
              </p>
              <p>
                <b>编程题</b>
                ：应提供输入格式、输出格式、样例输入和样例输出；规则识别会把样例作为初始测试点。
              </p>
              <p>
                <b>当前限制</b>：扫描版 PDF、图片题目、复杂 Word
                表格不能稳定识别；格式不规范时会默认按编程题处理。
              </p>
            </div>
            <div>
              <button
                type="button"
                className="is-primary"
                onClick={() => setRulesOpen(false)}
              >
                知道了
              </button>
            </div>
          </section>
        </div>
      )}
      {generateOpen && (
        <div className="exam-confirm-backdrop" role="presentation">
          <section
            className="exam-confirm contest-ai-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contest-ai-title"
          >
            <span>
              <Sparkles size={24} />
            </span>
            <h2 id="contest-ai-title">AI 生成试卷草稿</h2>
            <p>
              当前试卷：{title || "未填写名称"} ·{" "}
              {language === "cpp"
                ? "C++"
                : language === "python"
                  ? "Python"
                  : "Scratch"}
            </p>
            <div className="contest-ai-fields">
              <label>
                <span>考试范围 / 知识点</span>
                <textarea
                  value={knowledgePoints}
                  onChange={(event) => setKnowledgePoints(event.target.value)}
                  maxLength={1000}
                  placeholder="例如：变量、循环、列表基础；不包含函数和递归"
                />
                <small>{knowledgePoints.length}/1000</small>
              </label>
              <label>
                <span>题目数量</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={problemCount}
                  onChange={(event) =>
                    setProblemCount(
                      Math.min(
                        30,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    )
                  }
                />
              </label>
            </div>
            <p className="contest-ai-cost">
              成功生成后扣除 2 次提问资格；生成失败会自动返还。
            </p>
            <div>
              <button
                type="button"
                onClick={() => setGenerateOpen(false)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => void generateWithAi()}
                disabled={busy || knowledgePoints.trim().length < 2}
              >
                {busy ? "正在生成…" : "生成草稿"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
