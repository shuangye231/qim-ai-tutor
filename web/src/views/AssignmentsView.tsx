import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Code2,
  FileUp,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, jsonBody } from "../api/client";
import type { TeachingClass } from "../components/ClassPanel";
import { Dialog } from "../components/Dialog";

type QuestionType = "choice" | "judgment" | "text" | "code";
type Course = "python" | "cpp" | "scratch";
type Question = {
  id: string;
  type: QuestionType;
  title: string;
  prompt: string;
  options: string[];
  answer?: string;
  starter_code?: string;
};
type Submission = {
  username?: string;
  answers: Record<string, string>;
  score: number | null;
  total: number;
  status: string;
  feedback?: string;
  submitted_at?: string | null;
};
type Assignment = {
  id: string;
  class_id: string;
  class_name: string;
  teacher: string;
  title: string;
  instructions: string;
  course_id: Course;
  due_at?: string | null;
  questions: Question[];
  question_count: number;
  submission?: Submission;
};

const courseLabels: Record<Course, string> = {
  python: "Python",
  cpp: "C++",
  scratch: "Scratch",
};
const newQuestion = (): Question => ({
  id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  type: "choice",
  title: "",
  prompt: "",
  options: ["选项 A", "选项 B"],
  answer: "0",
});

function PixelSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div
      className={`pixel-select ${className} ${ariaLabel.includes("题型") ? "assignment-type-select" : ""}`.trim()}
      ref={rootRef}
    >
      <button
        type="button"
        className="pixel-select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        <span>{current?.label || "请选择"}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="pixel-select-menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const pad = (value: number) => String(value).padStart(2, "0");
const localDateTime = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
function PixelDateTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = value ? new Date(value) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(valid || new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = Array.from(
    { length: 42 },
    (_, index) => new Date(year, month, index - first + 1),
  );
  const chooseDay = (day: Date) => {
    const next = new Date(day);
    next.setHours(valid?.getHours() ?? 18, valid?.getMinutes() ?? 0, 0, 0);
    onChange(localDateTime(next));
    setCursor(next);
  };
  return (
    <div className="pixel-datetime" ref={rootRef}>
      <button
        type="button"
        className="pixel-datetime-trigger"
        aria-label="选择截止时间"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        <span>
          {valid
            ? valid.toLocaleString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            : "选择日期和时间"}
        </span>
        <CalendarDays size={17} />
      </button>
      {open && (
        <div
          className="pixel-datetime-popover"
          role="dialog"
          aria-label="选择截止时间"
        >
          <header>
            <button
              type="button"
              aria-label="上一个月"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
            >
              <ChevronLeft size={17} />
            </button>
            <strong>
              {year}年 {month + 1}月
            </strong>
            <button
              type="button"
              aria-label="下一个月"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
            >
              <ChevronRight size={17} />
            </button>
          </header>
          <div className="pixel-datetime-week">
            <span>一</span>
            <span>二</span>
            <span>三</span>
            <span>四</span>
            <span>五</span>
            <span>六</span>
            <span>日</span>
          </div>
          <div className="pixel-datetime-days">
            {days.map((day) => (
              <button
                type="button"
                key={day.toISOString()}
                className={`${day.getMonth() === month ? "" : "is-muted"} ${valid && day.toDateString() === valid.toDateString() ? "is-selected" : ""}`}
                onClick={() => chooseDay(day)}
              >
                {day.getDate()}
              </button>
            ))}
          </div>
          <div className="pixel-datetime-time">
            <span>时间</span>
            <PixelSelect
              ariaLabel="小时"
              value={pad(valid?.getHours() ?? 18)}
              onChange={(hour) => {
                const next = valid ? new Date(valid) : new Date(cursor);
                next.setHours(Number(hour), valid?.getMinutes() ?? 0, 0, 0);
                onChange(localDateTime(next));
              }}
              options={Array.from({ length: 24 }, (_, hour) => ({
                value: pad(hour),
                label: `${pad(hour)} 时`,
              }))}
            />
            <b>:</b>
            <PixelSelect
              ariaLabel="分钟"
              value={pad(valid?.getMinutes() ?? 0)}
              onChange={(minute) => {
                const next = valid ? new Date(valid) : new Date(cursor);
                next.setHours(valid?.getHours() ?? 18, Number(minute), 0, 0);
                onChange(localDateTime(next));
              }}
              options={Array.from({ length: 60 }, (_, minute) => ({
                value: pad(minute),
                label: `${pad(minute)} 分`,
              }))}
            />
          </div>
          <footer>
            <button type="button" onClick={() => onChange("")}>
              清除
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              完成
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

export function AssignmentsView({
  username,
  role,
  onAskTeacher,
  onNotice,
}: {
  username: string;
  role: string;
  onAskTeacher: (message: string, classId: string) => void;
  onNotice: (message: string) => void;
}) {
  const isTeacher = role === "teacher";
  const [classes, setClasses] = useState<TeachingClass[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Question[]>([newQuestion()]);
  const [classId, setClassId] = useState("");
  const [courseId, setCourseId] = useState<Course>("python");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [submissions, setSubmissions] = useState<
    (Submission & { username: string })[]
  >([]);
  const [gradeDrafts, setGradeDrafts] = useState<
    Record<string, { score: string; total: string; feedback: string }>
  >({});
  const scratchFileRef = useRef<HTMLInputElement>(null);
  const scratchQuestionRef = useRef("");
  const selectedClass = useMemo(
    () => classes.find((item) => item.id === classId),
    [classes, classId],
  );

  const load = async () => {
    try {
      const [classData, assignmentData] = await Promise.all([
        apiFetch<{ classes: TeachingClass[] }>(
          `/api/classes?username=${encodeURIComponent(username)}`,
        ),
        apiFetch<{ assignments: Assignment[] }>(
          `/api/assignments?username=${encodeURIComponent(username)}`,
        ),
      ]);
      setClasses(classData.classes);
      setAssignments(assignmentData.assignments);
      setClassId((current) => current || classData.classes[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "作业读取失败");
    }
  };
  useEffect(() => {
    void load();
  }, [username]);

  const openAssignment = async (item: Assignment) => {
    try {
      const result = await apiFetch<{ assignment: Assignment }>(
        `/api/assignments/${encodeURIComponent(item.id)}?username=${encodeURIComponent(username)}`,
      );
      setSelected(result.assignment);
      setAnswers(result.assignment.submission?.answers || {});
      if (isTeacher) {
        const data = await apiFetch<{
          submissions: (Submission & { username: string })[];
        }>(
          `/api/assignments/${encodeURIComponent(item.id)}/submissions?username=${encodeURIComponent(username)}`,
        );
        setSubmissions(data.submissions);
        setGradeDrafts(
          Object.fromEntries(
            data.submissions.map((item) => [
              item.username,
              {
                score: item.score == null ? "" : String(item.score),
                total: item.total ? String(item.total) : "100",
                feedback: item.feedback || "",
              },
            ]),
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "作业打开失败");
    }
  };
  const updateQuestion = (id: string, patch: Partial<Question>) =>
    setQuestions((all) =>
      all.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const create = async () => {
    if (!classId || !title.trim()) return setError("请选择班级并填写作业标题");
    setBusy(true);
    try {
      const result = await apiFetch<{ assignment: Assignment }>(
        "/api/assignments",
        jsonBody({
          username,
          class_id: classId,
          course_id: courseId,
          title,
          instructions,
          due_at: dueAt || null,
          questions: questions.map((item) =>
            item.type === "code" ? { ...item, language: courseId } : item,
          ),
        }),
      );
      setAssignments((all) => [result.assignment, ...all]);
      setSelected(result.assignment);
      setQuestions([newQuestion()]);
      setTitle("");
      setInstructions("");
      setDueAt("");
      setCourseId("python");
      setShowComposer(false);
      onNotice("作业已发布，班级通知也已发送");
    } catch (e) {
      setError(e instanceof Error ? e.message : "作业发布失败");
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(
        `/api/assignments/${encodeURIComponent(selected.id)}/submit`,
        jsonBody({ username, answers }),
      );
      const next = {
        ...selected,
        submission: {
          ...selected.submission,
          answers,
          score: null,
          total: 0,
          status: "submitted",
        },
      };
      setSelected(next);
      setAssignments((all) =>
        all.map((item) => (item.id === next.id ? next : item)),
      );
      onNotice("作业已提交，等待老师批改");
    } catch (e) {
      setError(e instanceof Error ? e.message : "作业提交失败");
    } finally {
      setBusy(false);
    }
  };
  const uploadScratch = async (file: File) => {
    if (!selected || !scratchQuestionRef.current) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("username", username);
      form.append("question_id", scratchQuestionRef.current);
      form.append("file", file);
      const result = await apiFetch<{ url: string; name: string }>(
        `/api/assignments/${encodeURIComponent(selected.id)}/scratch-project`,
        { method: "POST", body: form },
      );
      setAnswers((all) => ({
        ...all,
        [scratchQuestionRef.current]: JSON.stringify(result),
      }));
      onNotice("Scratch 项目已暂存，提交作业后发送给老师");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scratch 项目上传失败");
    } finally {
      setBusy(false);
      if (scratchFileRef.current) scratchFileRef.current.value = "";
    }
  };
  const grade = async (student: string) => {
    if (!selected) return;
    const draft = gradeDrafts[student];
    if (!draft?.score || !draft.total) return setError("请填写得分和满分");
    setBusy(true);
    try {
      const result = await apiFetch<{
        submission: Submission & { username: string };
      }>(
        `/api/assignments/${encodeURIComponent(selected.id)}/submissions/${encodeURIComponent(student)}/grade`,
        {
          ...jsonBody({
            username,
            score: draft.score,
            total: draft.total,
            feedback: draft.feedback,
          }),
          method: "PUT",
        },
      );
      setSubmissions((all) =>
        all.map((item) =>
          item.username === student ? { ...item, ...result.submission } : item,
        ),
      );
      onNotice(`已完成 ${student} 的作业批改`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "批改保存失败");
    } finally {
      setBusy(false);
    }
  };

  const composer = (
    <div className="assignment-composer">
      <header>
        <div>
          <strong>布置新作业</strong>
          <small>学生提交后由老师查看、评分和评语</small>
        </div>
        <button
          type="button"
          className="assignment-composer-close"
          onClick={() => setShowComposer(false)}
          aria-label="关闭布置新作业"
        >
          <span>×</span>
        </button>
      </header>
      <div className="assignment-form-grid">
        <label>
          所属班级
          <PixelSelect
            ariaLabel="所属班级"
            value={classId}
            onChange={setClassId}
            options={classes.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </label>
        <label>
          作业类型
          <PixelSelect
            ariaLabel="作业类型"
            value={courseId}
            onChange={(value) => setCourseId(value as Course)}
            options={[
              { value: "python", label: "Python 作业" },
              { value: "cpp", label: "C++ 作业" },
              { value: "scratch", label: "Scratch 项目作业" },
            ]}
          />
        </label>
        <label>
          截止时间
          <PixelDateTimePicker value={dueAt} onChange={setDueAt} />
        </label>
        <label className="assignment-field-wide">
          作业标题
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：变量与循环基础练习"
          />
        </label>
        <label className="assignment-field-wide">
          作业说明
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="告诉学生这次任务要练习什么。"
          />
        </label>
      </div>
      <div className="assignment-course-note">
        {courseId === "scratch" ? (
          <>
            <Sparkles size={15} /> Scratch 作业要求学生上传 `.sb3` 项目文件。
          </>
        ) : (
          <>
            <Code2 size={15} /> {courseLabels[courseId]}{" "}
            作业提交源代码，评分由老师完成。
          </>
        )}
      </div>
      <div className="assignment-question-editor">
        {questions.map((question, index) => (
          <article key={question.id}>
            <header>
              <strong>第 {index + 1} 题</strong>
              <PixelSelect
                ariaLabel={`第 ${index + 1} 题题型`}
                value={question.type}
                onChange={(value) =>
                  updateQuestion(question.id, { type: value as QuestionType })
                }
                options={[
                  { value: "choice", label: "选择题" },
                  { value: "judgment", label: "判断题" },
                  { value: "text", label: "简答题" },
                  { value: "code", label: "编程题" },
                ]}
              />
              <button
                type="button"
                onClick={() =>
                  setQuestions((all) =>
                    all.length > 1
                      ? all.filter((item) => item.id !== question.id)
                      : all,
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </header>
            <input
              value={question.title}
              onChange={(e) =>
                updateQuestion(question.id, { title: e.target.value })
              }
              placeholder="题目标题"
            />
            <textarea
              value={question.prompt}
              onChange={(e) =>
                updateQuestion(question.id, { prompt: e.target.value })
              }
              placeholder="写下题目内容"
            />
            {question.type === "choice" && (
              <div className="assignment-options">
                {question.options.map((option, optionIndex) => (
                  <label key={`${question.id}-${optionIndex}`}>
                    <input
                      type="radio"
                      name={`answer-${question.id}`}
                      checked={question.answer === String(optionIndex)}
                      onChange={() =>
                        updateQuestion(question.id, {
                          answer: String(optionIndex),
                        })
                      }
                    />
                    <input
                      value={option}
                      onChange={(e) =>
                        updateQuestion(question.id, {
                          options: question.options.map((value, i) =>
                            i === optionIndex ? e.target.value : value,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateQuestion(question.id, {
                      options: [
                        ...question.options,
                        `选项 ${String.fromCharCode(65 + question.options.length)}`,
                      ].slice(0, 6),
                    })
                  }
                >
                  + 添加选项
                </button>
              </div>
            )}
            {question.type === "judgment" && (
              <label className="assignment-answer-select">
                标准答案
                <PixelSelect
                  ariaLabel="标准答案"
                  value={question.answer || "true"}
                  onChange={(value) =>
                    updateQuestion(question.id, { answer: value })
                  }
                  options={[
                    { value: "true", label: "正确" },
                    { value: "false", label: "错误" },
                  ]}
                />
              </label>
            )}
            {question.type === "code" && (
              <div className="assignment-code-editor">
                <strong>编程语言：{courseLabels[courseId]}</strong>
                <textarea
                  value={question.starter_code || ""}
                  onChange={(e) =>
                    updateQuestion(question.id, {
                      starter_code: e.target.value,
                    })
                  }
                  placeholder="可选：给学生的代码模板"
                />
                <small>学生提交后不自动评分，由老师查看和批改。</small>
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="assignment-form-actions">
        <button
          type="button"
          onClick={() => setQuestions((all) => [...all, newQuestion()])}
        >
          <Plus size={15} />
          添加题目
        </button>
        <button
          type="button"
          className="assignment-publish-button"
          disabled={busy || !title.trim() || !classId}
          onClick={() => void create()}
        >
          <Send size={15} />
          {busy ? "发布中…" : "发布作业"}
        </button>
      </div>
    </div>
  );

  return (
    <main className="assignments-view" id="main-content">
      <header className="assignments-head">
        <div>
          <p className="assignments-kicker">
            <ClipboardCheck size={15} /> LEARNING QUEST
          </p>
          <h1>作业中心</h1>
          <span>
            {isTeacher
              ? "老师布置任务，学生在线提交，评分权交给老师。"
              : "查看班级任务，完成今天的学习挑战。"}
          </span>
        </div>
        <button
          type="button"
          className="assignments-refresh"
          onClick={() => void load()}
        >
          <Clock3 size={15} />
          刷新作业
        </button>
      </header>
      <section className="assignments-shell">
        <aside className="assignment-list-panel">
          <div className="assignment-list-title">
            <strong>我的作业</strong>
            <span>{assignments.length} 项</span>
          </div>
          {isTeacher && (
            <button
              type="button"
              className="assignment-create-button"
              onClick={() => setShowComposer(true)}
            >
              <Plus size={16} />
              布置新作业
            </button>
          )}
          {assignments.length ? (
            <div className="assignment-list">
              {assignments.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selected?.id === item.id ? "is-active" : ""}
                  onClick={() => void openAssignment(item)}
                >
                  <span className="assignment-list-icon">
                    <ClipboardCheck size={17} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {courseLabels[item.course_id || "python"]} ·{" "}
                      {item.class_name} · {item.question_count} 题
                    </small>
                  </span>
                  <ChevronDown size={14} />
                </button>
              ))}
            </div>
          ) : (
            <div className="assignment-empty">
              <ClipboardCheck size={25} />
              <strong>{isTeacher ? "还没有布置作业" : "暂时没有新作业"}</strong>
              <span>
                {isTeacher
                  ? "点击上方按钮创建第一份班级任务。"
                  : "老师发布后会同步显示在这里。"}
              </span>
            </div>
          )}
        </aside>
        <section className="assignment-main">
          {selected ? (
            <article className="assignment-detail">
              <header>
                <div>
                  <p>
                    {courseLabels[selected.course_id || "python"]} 作业 ·{" "}
                    {selected.class_name} · 布置人 {selected.teacher}
                  </p>
                  <h2>{selected.title}</h2>
                  <span>
                    {selected.due_at
                      ? `截止 ${new Date(selected.due_at).toLocaleString("zh-CN")}`
                      : "未设置截止时间"}{" "}
                    · 共 {selected.question_count} 题
                  </span>
                </div>
                {isTeacher ? (
                  <button
                    type="button"
                    onClick={() => void openAssignment(selected)}
                  >
                    <Bell size={15} />
                    刷新提交
                  </button>
                ) : (
                  <span
                    className={`assignment-status ${selected.submission?.status === "submitted" ? "is-done" : ""}`}
                  >
                    {selected.submission?.status === "submitted"
                      ? "已提交"
                      : "待完成"}
                  </span>
                )}
              </header>
              {selected.instructions && (
                <p className="assignment-instructions">
                  {selected.instructions}
                </p>
              )}
              <div className="assignment-questions">
                {selected.questions.map((question, index) => (
                  <section key={question.id}>
                    <div className="assignment-question-title">
                      <span>{index + 1}</span>
                      <div>
                        <strong>{question.title}</strong>
                        <p>{question.prompt}</p>
                        {question.type === "code" && (
                          <small className="assignment-code-badge">
                            {selected.course_id === "scratch"
                              ? "Scratch .sb3"
                              : courseLabels[selected.course_id || "python"]}
                          </small>
                        )}
                      </div>
                    </div>
                    {!isTeacher && question.type === "choice" && (
                      <div className="assignment-answer-list">
                        {question.options.map((option, optionIndex) => (
                          <label key={`${question.id}-${optionIndex}`}>
                            <input
                              type="radio"
                              name={`student-${question.id}`}
                              checked={
                                answers[question.id] === String(optionIndex)
                              }
                              onChange={() =>
                                setAnswers((all) => ({
                                  ...all,
                                  [question.id]: String(optionIndex),
                                }))
                              }
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {!isTeacher && question.type === "judgment" && (
                      <div className="assignment-answer-list">
                        <label>
                          <input
                            type="radio"
                            name={`student-${question.id}`}
                            checked={answers[question.id] === "true"}
                            onChange={() =>
                              setAnswers((all) => ({
                                ...all,
                                [question.id]: "true",
                              }))
                            }
                          />
                          <span>正确</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`student-${question.id}`}
                            checked={answers[question.id] === "false"}
                            onChange={() =>
                              setAnswers((all) => ({
                                ...all,
                                [question.id]: "false",
                              }))
                            }
                          />
                          <span>错误</span>
                        </label>
                      </div>
                    )}
                    {!isTeacher && question.type === "text" && (
                      <textarea
                        value={answers[question.id] || ""}
                        onChange={(e) =>
                          setAnswers((all) => ({
                            ...all,
                            [question.id]: e.target.value,
                          }))
                        }
                        placeholder="写下你的答案，老师会在班级里看到。"
                      />
                    )}
                    {!isTeacher &&
                      question.type === "code" &&
                      selected.course_id === "scratch" && (
                        <div className="assignment-scratch-upload">
                          <input
                            ref={scratchFileRef}
                            hidden
                            type="file"
                            accept=".sb3,application/zip"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadScratch(file);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              scratchQuestionRef.current = question.id;
                              scratchFileRef.current?.click();
                            }}
                          >
                            <FileUp size={15} />
                            上传 Scratch 项目（.sb3）
                          </button>
                          <small>
                            {answers[question.id]
                              ? "项目已选择，提交作业后发送给老师"
                              : "支持最大 20MB"}
                          </small>
                        </div>
                      )}
                    {!isTeacher &&
                      question.type === "code" &&
                      selected.course_id !== "scratch" && (
                        <textarea
                          className="assignment-code-answer"
                          value={answers[question.id] || ""}
                          onChange={(e) =>
                            setAnswers((all) => ({
                              ...all,
                              [question.id]: e.target.value,
                            }))
                          }
                          placeholder={`输入你的 ${courseLabels[selected.course_id || "python"]} 代码，提交后交给老师。`}
                        />
                      )}
                    {!isTeacher && (
                      <button
                        type="button"
                        className="ask-teacher-button"
                        onClick={() =>
                          onAskTeacher(
                            `老师好，我在作业“${selected.title}”的第 ${index + 1} 题遇到困难：\n${question.prompt}`,
                            selected.class_id,
                          )
                        }
                      >
                        不会这题，问老师
                      </button>
                    )}
                  </section>
                ))}
              </div>
              {isTeacher ? (
                <section className="assignment-submissions">
                  <header>
                    <strong>学生提交</strong>
                    <span>{submissions.length} 人</span>
                  </header>
                  {submissions.length ? (
                    submissions.map((submission) => (
                      <article key={submission.username}>
                        <div>
                          <strong>{submission.username}</strong>
                          <small>
                            {submission.status === "graded"
                              ? "已批改"
                              : "待批改"}{" "}
                            ·{" "}
                            {submission.submitted_at
                              ? new Date(
                                  submission.submitted_at,
                                ).toLocaleString("zh-CN")
                              : ""}
                          </small>
                          <pre>
                            {Object.entries(submission.answers || {})
                              .map(([key, value]) => {
                                const questionIndex = selected.questions.findIndex((question) => question.id === key)
                                return `第 ${questionIndex >= 0 ? questionIndex + 1 : ''} 题：${value}`
                              })
                              .join("\n")}
                          </pre>
                        </div>
                        <div className="assignment-grade-form">
                          <label>
                            得分
                            <input
                              type="number"
                              min="0"
                              value={
                                gradeDrafts[submission.username]?.score || ""
                              }
                              onChange={(e) =>
                                setGradeDrafts((all) => ({
                                  ...all,
                                  [submission.username]: {
                                    ...(all[submission.username] || {
                                      total: "100",
                                      feedback: "",
                                    }),
                                    score: e.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            满分
                            <input
                              type="number"
                              min="1"
                              value={
                                gradeDrafts[submission.username]?.total || "100"
                              }
                              onChange={(e) =>
                                setGradeDrafts((all) => ({
                                  ...all,
                                  [submission.username]: {
                                    ...(all[submission.username] || {
                                      score: "",
                                      feedback: "",
                                    }),
                                    total: e.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            老师评语
                            <textarea
                              value={
                                gradeDrafts[submission.username]?.feedback || ""
                              }
                              onChange={(e) =>
                                setGradeDrafts((all) => ({
                                  ...all,
                                  [submission.username]: {
                                    ...(all[submission.username] || {
                                      score: "",
                                      total: "100",
                                    }),
                                    feedback: e.target.value,
                                  },
                                }))
                              }
                              placeholder="写给学生的建议"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void grade(submission.username)}
                            disabled={busy}
                          >
                            <Check size={15} />
                            保存批改
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="assignment-empty">还没有学生提交。</p>
                  )}
                </section>
              ) : (
                <footer className="assignment-submit-bar">
                  <span>
                    {selected.submission?.status === "submitted"
                      ? "已提交，等待老师批改"
                      : "完成后提交，答案会同步给老师"}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    <Check size={16} />
                    {busy ? "提交中…" : "提交作业"}
                  </button>
                </footer>
              )}
            </article>
          ) : (
            <div className="assignment-welcome">
              <div className="assignment-welcome-mark">
                <ClipboardCheck size={34} />
              </div>
              <h2>
                {isTeacher ? "把学习任务交给班级" : "选择一份作业开始冒险"}
              </h2>
              <p>
                {isTeacher
                  ? "作业发布后会自动出现在班级通知和学生的作业中心。"
                  : "左侧会列出老师通过班级发布的全部作业。"}
              </p>
              {selectedClass && (
                <small>
                  <UsersRound size={14} /> 当前班级：{selectedClass.name}
                </small>
              )}
            </div>
          )}
        </section>
      </section>
      {error && (
        <p className="assignments-error" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={showComposer && isTeacher}
        title="布置新作业"
        width="large"
        panelClassName="assignment-create-dialog"
        onClose={() => setShowComposer(false)}
      >
        {composer}
      </Dialog>
    </main>
  );
}
