import Editor from "@monaco-editor/react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleHelp,
  Code2,
  ExternalLink,
  Filter,
  ListChecks,
  Maximize2,
  Play,
  RotateCcw,
  Search,
  Send,
  TerminalSquare,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, jsonBody } from "../api/client";
import { Scratch3Workspace } from "../components/Scratch3Workspace";
import {
  ojCategories,
  ojProblems,
  type OjDifficulty,
  type OjLanguage,
  type OjProblem,
} from "../data/ojProblems";

type JudgeState = "idle" | "running" | "accepted" | "wrong" | "error";
type OjLeaderboardEntry = { rank: number; username: string; solved_count: number; points: number };

const languageName: Record<OjLanguage, string> = {
  python: "Python",
  cpp: "C++",
  scratch: "Scratch",
};
const difficultyOrder: OjDifficulty[] = ["入门", "基础", "进阶", "挑战"];
const solvedKey = (username: string) =>
  `ai-tutor-oj-solved:${username || "guest"}`;
const sourceKey = (username: string, problemId: string) =>
  `ai-tutor-oj-source:${username || "guest"}:${problemId}`;
const normalizeOutput = (value: string) =>
  value.replace(/\r\n/g, "\n").trimEnd();
const initialSource = (problem: OjProblem) => {
  if (problem.language === "python")
    return `# ${problem.title}\n# 从标准输入读取数据，将答案输出到标准输出。\n\ndef solve():\n    pass\n\nif __name__ == '__main__':\n    solve()\n`;
  if (problem.language === "cpp")
    return `#include <iostream>\nusing namespace std;\n\nint main() {\n    // ${problem.title}\n    return 0;\n}\n`;
  return "";
};

interface OjViewProps {
  username: string;
  theme: "light" | "dark";
  resetToken?: number;
  contestPreview?: boolean;
  onProblemOpen?: (problemId: string) => void;
  onAskTeacher?: (message: string) => void;
  onContestReturn?: () => void;
}

export function OjView({
  username,
  theme,
  resetToken = 0,
  contestPreview = false,
  onProblemOpen,
  onAskTeacher,
  onContestReturn,
}: OjViewProps) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"all" | OjLanguage>("all");
  const [difficulty, setDifficulty] = useState<"all" | OjDifficulty>("all");
  const [category, setCategory] = useState("全部分类");
  const [selected, setSelected] = useState<OjProblem | null>(null);
  const [source, setSource] = useState("");
  const [stdin, setStdin] = useState("");
  const [stdout, setStdout] = useState("");
  const [judgeState, setJudgeState] = useState<JudgeState>("idle");
  const [judgeMessage, setJudgeMessage] = useState("");
  const [contestId, setContestId] = useState("");
  const [scratchLabOpen, setScratchLabOpen] = useState(false);
  const [ojLeaderboard, setOjLeaderboard] = useState<OjLeaderboardEntry[]>([]);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [solved, setSolved] = useState<string[]>(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem(solvedKey(username)) || "[]",
      );
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  });

  const filteredProblems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return ojProblems.filter((problem) => {
      const matchesQuery =
        !keyword ||
        `${problem.code} ${problem.title} ${problem.category} ${problem.tags.join(" ")}`
          .toLowerCase()
          .includes(keyword);
      return (
        matchesQuery &&
        (language === "all" || problem.language === language) &&
        (difficulty === "all" || problem.difficulty === difficulty) &&
        (category === "全部分类" || problem.category === category)
      );
    });
  }, [category, difficulty, language, query]);

  const openProblem = (problem: OjProblem, activeContestId = "") => {
    setSelected(problem);
    setContestId(activeContestId);
    setScratchLabOpen(false);
    setSource(
      localStorage.getItem(sourceKey(username, problem.id)) ||
        initialSource(problem),
    );
    setStdin(problem.examples[0]?.input || "");
    setStdout("");
    setJudgeState("idle");
    setJudgeMessage("");
  };

  const closeProblem = () => {
    if (contestId && onContestReturn) {
      onContestReturn();
      return;
    }
    setSelected(null);
    setContestId("");
    setJudgeState("idle");
  };

  useEffect(() => {
    if (resetToken > 0) closeProblem();
  }, [resetToken]);

  useEffect(() => {
    if (!scratchLabOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setScratchLabOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [scratchLabOpen]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const problemId = params.get("problem");
    const routeContestId = params.get("contest");
    if (!problemId) return;
    if (routeContestId) {
      apiFetch<{ problem: OjProblem }>(
        `/api/contests/${encodeURIComponent(routeContestId)}/problems/${encodeURIComponent(problemId)}`,
      )
        .then((result) =>
          openProblem(
            {
              ...result.problem,
              acceptance: result.problem.acceptance || 0,
              solved: result.problem.solved || 0,
            },
            routeContestId,
          ),
        )
        .catch(() => undefined);
      return;
    }
    const problem = ojProblems.find((item) => item.id === problemId);
    if (problem) openProblem(problem);
  }, []);

  useEffect(() => {
    if (!contestId) return;
    apiFetch<{ solved_problem_ids: string[] }>(
      `/api/oj/progress?username=${encodeURIComponent(username)}&contest_id=${encodeURIComponent(contestId)}`,
    )
      .then((result) => {
        setSolved((current) =>
          Array.from(new Set([...current, ...result.solved_problem_ids])),
        );
      })
      .catch(() => undefined);
  }, [contestId, username]);

  useEffect(() => {
    apiFetch<{ students: OjLeaderboardEntry[] }>("/api/oj/leaderboard")
      .then((result) => setOjLeaderboard(result.students))
      .catch(() => setOjLeaderboard([]));
  }, [username]);

  useEffect(() => {
    if (selected && selected.language !== "scratch")
      localStorage.setItem(sourceKey(username, selected.id), source);
  }, [selected, source, username]);

  const runCode = async (submit: boolean) => {
    if (
      !selected ||
      selected.language === "scratch" ||
      judgeState === "running"
    )
      return;
    const testCases = submit
      ? selected.examples
      : [{ input: stdin, output: selected.examples[0]?.output || "" }];
    setJudgeState("running");
    setJudgeMessage(submit ? "正在运行样例并判题…" : "正在运行代码…");
    setStdout("");
    try {
      if (submit && contestId) {
        if (contestPreview) {
          setStdout("预览模式不会提交作品。");
          setJudgeState("accepted");
          setJudgeMessage("已返回试卷预览。");
          onContestReturn?.();
          return;
        }
        const result = await apiFetch<{
          submission: {
            status: string;
            score: number;
            passed_tests: number;
            total_tests: number;
            error_message: string;
            duration_ms: number;
          };
        }>(
          "/api/oj/submit",
          jsonBody({
            username,
            contest_id: contestId,
            problem_id: selected.id,
            source,
          }),
        );
        const submission = result.submission;
        if (submission.status === "submitted") {
          setStdout("作品已提交，等待老师评分。代码和提交记录已保存。");
          setJudgeState("accepted");
          setJudgeMessage("提交成功，正确性和得分由老师人工评定。");
          onContestReturn?.();
          return;
        }
        setStdout(
          submission.error_message ||
            `通过 ${submission.passed_tests}/${submission.total_tests} 个测试点，得分 ${submission.score}，耗时 ${submission.duration_ms}ms。`,
        );
        if (submission.status === "accepted") acceptProblem(selected.id, false);
        else if (submission.status === "wrong_answer") {
          setJudgeState("wrong");
          setJudgeMessage(
            `答案未通过全部测试点，当前通过 ${submission.passed_tests}/${submission.total_tests}。`,
          );
        } else {
          setJudgeState("error");
          setJudgeMessage(
            submission.status === "time_limit"
              ? "程序运行超时，请检查算法效率。"
              : "编译或运行出错，请根据下方信息修改代码。",
          );
        }
        return;
      }
      for (let index = 0; index < testCases.length; index += 1) {
        const testCase = testCases[index];
        const result =
          await apiFetch<{
                stdout: string;
                stderr: string;
                exit_code: number;
                timed_out?: boolean;
              }>(
                "/api/compiler/run",
                jsonBody({
                  username,
                  course_id: selected.language,
                  source,
                  stdin: testCase.input,
                }),
              );
        const error = result.stderr || "";
        const output = result.stdout || "";
        setStdout(error || output || "程序没有输出。");
        if (error) {
          setJudgeState("error");
          setJudgeMessage(
            `第 ${index + 1} 个测试点运行出错，请根据下方信息修改代码。`,
          );
          return;
        }
        if (
          submit &&
          normalizeOutput(output) !== normalizeOutput(testCase.output)
        ) {
          setJudgeState("wrong");
          setJudgeMessage(`未通过第 ${index + 1} 个测试点，请检查边界情况。`);
          return;
        }
      }
      if (submit) acceptProblem(selected.id);
      else {
        setJudgeState("idle");
        setJudgeMessage("运行完成。提交后系统会检查全部公开测试点。");
      }
    } catch (error) {
      setJudgeState("error");
      setStdout(error instanceof Error ? error.message : "运行失败");
      setJudgeMessage("运行环境暂时不可用，请稍后重试。");
    }
  };

  const acceptProblem = (problemId: string, recordOj = !contestId) => {
    const next = solved.includes(problemId) ? solved : [...solved, problemId];
    setSolved(next);
    localStorage.setItem(solvedKey(username), JSON.stringify(next));
    if (recordOj) {
      const problem = ojProblems.find((item) => item.id === problemId);
      if (problem) {
        void apiFetch("/api/oj/complete", jsonBody({ username, problem_id: problemId, points: problem.points })).catch(() => undefined);
      }
    }
    setJudgeState("accepted");
    setJudgeMessage("答案正确，已计入完成进度。");
  };

  const submitScratch = async (project?: ArrayBuffer) => {
    if (!selected) return;
    if (contestId) {
      if (contestPreview) {
        setScratchLabOpen(false);
        onContestReturn?.();
        return;
      }
      try {
        const bytes = new Uint8Array(project || new ArrayBuffer(0));
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000)
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        await apiFetch("/api/oj/submit", jsonBody({
          username,
          contest_id: contestId,
          problem_id: selected.id,
          source: btoa(binary),
        }));
        setScratchLabOpen(false);
        onContestReturn?.();
      } catch (error) {
        setJudgeState("error");
        setJudgeMessage(error instanceof Error ? error.message : "作品提交失败，请重试。");
      }
      return;
    }
    acceptProblem(selected.id, !contestId);
    setJudgeMessage("作品已提交，老师会在学习记录中进行人工评价。");
    setScratchLabOpen(false);
  };

  const solvedPoints = ojProblems
    .filter((problem) => solved.includes(problem.id))
    .reduce((total, problem) => total + problem.points, 0);

  return (
    <main className="oj-view" id="main-content">
      {!selected ? (
        <>
          <section className="oj-topbar">
            <div>
              <span className="oj-mark">
                <Code2 size={22} />
              </span>
              <div>
                <h1>OJ 编程题库</h1>
                <p>从基础语法到算法进阶，按自己的节奏持续练习</p>
              </div>
            </div>
            <div className="oj-progress">
              <button type="button" className="oj-leaderboard-trigger" onClick={() => setLeaderboardOpen(true)} aria-haspopup="dialog" aria-expanded={leaderboardOpen}>
                <Trophy size={19} />
                <span><strong>OJ 积分榜</strong><small>{ojLeaderboard.length} 位学生</small></span>
                <ChevronRight size={16} />
              </button>
              <span>
                <CheckCircle2 size={17} />
                <b>{solved.length}</b> 已完成
              </span>
              <span>
                <Trophy size={17} />
                <b>{solvedPoints}</b> 积分
              </span>
            </div>
          </section>

          <section className="oj-library">
            <aside className="oj-filter-panel">
              <div className="oj-filter-title">
                <Filter size={16} />
                <strong>题目分类</strong>
              </div>
              <div className="oj-language-filter">
                <span>编程语言</span>
                {[
                  ["all", "全部题目"],
                  ["python", "Python"],
                  ["cpp", "C++"],
                  ["scratch", "Scratch 思维"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={language === value ? "is-active" : ""}
                    onClick={() => setLanguage(value as "all" | OjLanguage)}
                  >
                    <span>{label}</span>
                    <b>
                      {value === "all"
                        ? ojProblems.length
                        : ojProblems.filter(
                            (problem) => problem.language === value,
                          ).length}
                    </b>
                  </button>
                ))}
              </div>
              <div className="oj-category-filter">
                <span>知识分类</span>
                {ojCategories.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={category === value ? "is-active" : ""}
                    onClick={() => setCategory(value)}
                  >
                    <ChevronRight size={13} />
                    {value}
                  </button>
                ))}
              </div>
            </aside>

            <div className="oj-problem-panel">
              <div className="oj-toolbar">
                <label className="oj-search">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索题号、题目或知识点"
                  />
                </label>
                <div className="oj-difficulty-filter">
                  {(["all", ...difficultyOrder] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={difficulty === value ? "is-active" : ""}
                      onClick={() => setDifficulty(value)}
                    >
                      {value === "all" ? "全部难度" : value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="oj-list-head">
                <span>状态</span>
                <span>题目</span>
                <span>难度</span>
                <span>通过率</span>
                <span>积分</span>
              </div>
              <div className="oj-problem-list">
                {filteredProblems.map((problem) => (
                  <button
                    type="button"
                    className="oj-problem-row"
                    key={problem.id}
                    onClick={() => {
                      onProblemOpen?.(problem.id);
                      openProblem(problem);
                    }}
                  >
                    <span
                      className={
                        solved.includes(problem.id)
                          ? "oj-solved"
                          : "oj-unsolved"
                      }
                    >
                      {solved.includes(problem.id) ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        <Circle size={17} />
                      )}
                    </span>
                    <span className="oj-problem-name">
                      <b>
                        {problem.code} · {problem.title}
                      </b>
                      <small>
                        <em>{languageName[problem.language]}</em>
                        {problem.tags.map((tag) => (
                          <i key={tag}>{tag}</i>
                        ))}
                      </small>
                    </span>
                    <span
                      className={`oj-difficulty is-${difficultyOrder.indexOf(problem.difficulty)}`}
                    >
                      {problem.difficulty}
                    </span>
                    <span className="oj-acceptance">
                      {problem.acceptance}%
                      <small>{problem.solved} 人通过</small>
                    </span>
                    <span className="oj-points">{problem.points}</span>
                    <ChevronRight className="oj-row-arrow" size={16} />
                  </button>
                ))}
                {!filteredProblems.length && (
                  <div className="oj-empty">
                    <Search size={24} />
                    <strong>没有找到匹配的题目</strong>
                    <span>换一个关键词或清除部分筛选条件。</span>
                  </div>
                )}
              </div>
            </div>
          </section>
          {leaderboardOpen && <div className="oj-leaderboard-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLeaderboardOpen(false); }}>
          <section className="oj-leaderboard" aria-labelledby="oj-leaderboard-title" role="dialog" aria-modal="true">
            <div className="oj-leaderboard-head">
              <div>
                <Trophy size={20} />
                <span>
                  <h2 id="oj-leaderboard-title">OJ 积分榜</h2>
                  <p>所有注册学生共享榜单，按累计通过题目积分排序</p>
                </span>
              </div>
              <button type="button" className="oj-leaderboard-close" onClick={() => setLeaderboardOpen(false)} aria-label="关闭积分榜"><X size={17} /></button>
            </div>
            <ol>
              {ojLeaderboard.map((student) => (
                <li key={student.username} className={student.username === username ? "is-current" : ""}>
                  <b>{student.rank}</b>
                  <span>{student.username}{student.username === username ? "（我）" : ""}</span>
                  <small>{student.solved_count} 题通过</small>
                  <strong>{student.points} 分</strong>
                </li>
              ))}
              {!ojLeaderboard.length && <li className="is-empty">完成一道 OJ 题后，你会出现在这里。</li>}
            </ol>
          </section>
          </div>}
        </>
      ) : (
        <section className="oj-solve-view">
          <header className="oj-solve-head">
            <button type="button" onClick={closeProblem}>
              <ListChecks size={16} />
              {contestId ? "返回试卷" : "返回题库"}
            </button>
            <div>
              <span>{selected.code}</span>
              <strong>{selected.title}</strong>
              <i
                className={`oj-difficulty is-${difficultyOrder.indexOf(selected.difficulty)}`}
              >
                {selected.difficulty}
              </i>
            </div>
            <div className="oj-solve-head-actions">
              {selected.language === "scratch" && (
                <button
                  type="button"
                  className="oj-scratch-head-button"
                  onClick={() => setScratchLabOpen((open) => !open)}
                  aria-label={scratchLabOpen ? "查看题目" : "打开 Scratch 实验室"}
                >
                  {scratchLabOpen ? <X size={15} /> : <Maximize2 size={15} />}
                  {scratchLabOpen ? "查看题目" : "打开实验室"}
                </button>
              )}
              {onAskTeacher && (
                <button
                  type="button"
                  className="oj-ask-teacher"
                  onClick={() =>
                    onAskTeacher(
                      `老师好，我在题库“${selected.code} · ${selected.title}”遇到困难：\n${selected.description}`,
                    )
                  }
                >
                  <CircleHelp size={15} />
                  问老师
                </button>
              )}
              <span className="oj-save-state">
                <Check size={14} />
                自动保存
              </span>
            </div>
          </header>
          <div
            className={`oj-solve-layout ${selected.language === "scratch" ? "is-scratch" : ""}`}
          >
            <article className="oj-statement">
              <div className="oj-statement-title">
                <BookOpen size={18} />
                <strong>题目描述</strong>
                <span>
                  {languageName[selected.language]} · {selected.category}
                </span>
              </div>
              {selected.source &&
                (selected.source.url ? (
                  <a
                    className="oj-source-link"
                    href={selected.source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} />
                    <span>来源：{selected.source.name}</span>
                    <b>{selected.source.license} 许可</b>
                  </a>
                ) : (
                  <div className="oj-source-link">
                    <BookOpen size={14} />
                    <span>来源：{selected.source.name}</span>
                    <b>{selected.source.license}</b>
                  </div>
                ))}
              <section>
                <h2>{selected.title}</h2>
                <p>{selected.description}</p>
              </section>
              <section>
                <h3>输入格式</h3>
                <p>{selected.input}</p>
              </section>
              <section>
                <h3>输出格式</h3>
                <p>{selected.output}</p>
              </section>
              <section>
                <h3>样例</h3>
                {selected.examples.map((example, index) => (
                  <div className="oj-example" key={index}>
                    <label>
                      输入<pre>{example.input || "无"}</pre>
                    </label>
                    <label>
                      输出<pre>{example.output}</pre>
                    </label>
                  </div>
                ))}
              </section>
              <div className="oj-statement-tags">
                {selected.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
            {selected.language === "scratch" ? (
              <div className="oj-scratch-answer">
                <div className="oj-code-head">
                  <span>
                    <Code2 size={16} />
                    Scratch 3 在线实验室
                  </span>
                  <b>{scratchLabOpen ? "实验室已打开" : "独立保存每道题的作品"}</b>
                </div>
                <div className="oj-scratch-status">
                  <Code2 size={30} />
                  <strong>{scratchLabOpen ? "实验室已打开" : "使用右上角按钮打开 Scratch 实验室"}</strong>
                  <small>作品按题目独立保存，关闭浮窗后仍可继续编辑。</small>
                </div>
                <div className={`oj-judge-message is-${judgeState}`}>
                  {judgeMessage || "完成 Scratch 作品后点击上方“提交作品”。"}
                </div>
              </div>
            ) : (
              <div className="oj-code-area">
                <div className="oj-code-head">
                  <span>
                    <Code2 size={16} />
                    {selected.language === "python" ? "main.py" : "main.cpp"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSource(initialSource(selected))}
                    title="恢复初始代码"
                  >
                    <RotateCcw size={15} />
                    重置
                  </button>
                </div>
                <div className="oj-editor">
                  <Editor
                    language={selected.language === "cpp" ? "cpp" : "python"}
                    value={source}
                    onChange={(value) => {
                      setSource(value || "");
                      setJudgeState("idle");
                      setJudgeMessage("");
                    }}
                    theme={theme === "dark" ? "vs-dark" : "light"}
                    options={{
                      automaticLayout: true,
                      fontSize: 14,
                      lineHeight: 23,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      padding: { top: 14 },
                      tabSize: 4,
                    }}
                  />
                </div>
                <div className="oj-console">
                  <label>
                    <span>程序输入</span>
                    <textarea
                      value={stdin}
                      onChange={(event) => setStdin(event.target.value)}
                    />
                  </label>
                  <section>
                    <div>
                      <TerminalSquare size={15} />
                      <strong>运行结果</strong>
                    </div>
                    <pre>{stdout || "运行代码后，这里会显示输出或报错。"}</pre>
                  </section>
                </div>
                <div className="oj-code-actions">
                  <span className={`oj-judge-message is-${judgeState}`}>
                    {judgeMessage ||
                      (contestId
                        ? "代码完成后直接提交作品，由老师人工评分。"
                        : "先运行检查，再提交判题。")}
                  </span>
                  <button
                    type="button"
                    disabled={judgeState === "running"}
                    onClick={() => void runCode(false)}
                  >
                    <Play size={16} />
                    运行代码
                  </button>
                  <button
                    type="button"
                    className="oj-submit-button"
                    disabled={judgeState === "running"}
                    onClick={() => void runCode(true)}
                  >
                    <Send size={16} />
                    {contestId ? "提交作品" : "提交判题"}
                  </button>
                </div>
              </div>
            )}
          </div>
          {selected.language === "scratch" && scratchLabOpen && (
            <div
              className="oj-scratch-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={`${selected.code} Scratch 在线实验室`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setScratchLabOpen(false);
              }}
            >
              <div className="oj-scratch-modal">
                <header className="oj-scratch-modal-head">
                  <div>
                    <Code2 size={18} />
                    <strong>{selected.code} · Scratch 在线实验室</strong>
                    <span>作品自动保存</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScratchLabOpen(false)}
                    aria-label="查看题目"
                  >
                    <X size={18} />
                    查看题目
                  </button>
                </header>
                <div className="oj-scratch-modal-body">
                  <Scratch3Workspace
                    storageKey={`oj:${username}:${selected.id}`}
                    onChange={(patch) => {
                      if (patch.source) setSource(patch.source);
                    }}
                    onAskAi={
                      contestId
                        ? undefined
                        : () =>
                            onAskTeacher?.(
                              `老师好，我在 Scratch 题目“${selected.title}”中需要帮助：\n${selected.description}`,
                            )
                    }
                    onSubmitProject={(project) => void submitScratch(project)}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
