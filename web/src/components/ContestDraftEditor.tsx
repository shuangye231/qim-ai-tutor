import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Plus,
  Save,
  Send,
  Trash2,
  X,
  Sparkles,
  ListChecks,
} from "lucide-react";
import { useState } from "react";
import { apiFetch, jsonBody } from "../api/client";
import type {
  ContestProblemType,
  OjProblem,
  OjTestCase,
} from "../data/ojProblems";
import type { TeacherContestRecord } from "./ContestCreator";
import type { TeachingClass } from "./ClassPanel";

interface ContestDraftEditorProps {
  username: string;
  contest: TeacherContestRecord;
  onCancel: () => void;
  onChanged: (contest: TeacherContestRecord) => void;
  onPublished: (contest: TeacherContestRecord) => void;
  classes: TeachingClass[];
}

export function ContestDraftEditor({
  username,
  contest,
  classes,
  onCancel,
  onChanged,
  onPublished,
}: ContestDraftEditorProps) {
  const [draft, setDraft] = useState<TeacherContestRecord>(() =>
    structuredClone(contest),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const patchProblem = (index: number, value: Partial<OjProblem>) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      problems: current.problems.map((problem, problemIndex) =>
        problemIndex === index ? { ...problem, ...value } : problem,
      ),
    }));
  };

  const patchTestCases = (
    problemIndex: number,
    updater: (tests: OjTestCase[]) => OjTestCase[],
  ) => {
    const problem = draft.problems[problemIndex];
    const tests = problem.test_cases?.length
      ? problem.test_cases
      : problem.examples;
    patchProblem(problemIndex, {
      test_cases: updater(tests.map((test) => ({ ...test }))),
    });
  };

  const patchOptions = (
    problemIndex: number,
    updater: (
      options: { key: string; text: string }[],
    ) => { key: string; text: string }[],
  ) => {
    const problem = draft.problems[problemIndex];
    patchProblem(problemIndex, {
      options: updater(
        (problem.options || []).map((option) => ({ ...option })),
      ),
    });
  };

  const addProblem = () => {
    const index = draft.problems.length + 1;
    setSaved(false);
    setDraft((current) => ({
      ...current,
      problems: [
        ...current.problems,
        {
          id: crypto.randomUUID().slice(0, 12),
          code: `T${String(index).padStart(4, "0")}`,
          title: `第 ${index} 题`,
          type: "single_choice",
          language: current.language,
          difficulty: "基础",
          category: "教师自定义",
          tags: ["教师出题"],
          acceptance: 0,
          solved: 0,
          points: 20,
          description: "",
          input: "",
          output: "",
          examples: [{ input: "", output: "" }],
          options: [
            { key: "A", text: "" },
            { key: "B", text: "" },
          ],
          correct_answer: "A",
          starterCode: "",
        },
      ],
    }));
  };

  const moveProblem = (index: number, offset: number) => {
    setSaved(false);
    setDraft((current) => {
      const problems = [...current.problems];
      const target = index + offset;
      if (target < 0 || target >= problems.length) return current;
      [problems[index], problems[target]] = [problems[target], problems[index]];
      return { ...current, problems };
    });
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await apiFetch<{ contest: TeacherContestRecord }>(
        `/api/teacher/contests/${draft.id}`,
        {
          ...jsonBody({
            username,
            title: draft.title,
            duration: draft.duration,
            start_at: draft.start_at,
            end_at: draft.end_at,
            ai_policy: draft.ai_policy,
            ranking_visible: draft.ranking_visible,
            class_scope: draft.class_scope,
            problems: draft.problems,
          }),
          method: "PUT",
        },
      );
      setDraft(result.contest);
      setSaved(true);
      onChanged(result.contest);
      return result.contest;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "保存草稿失败",
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    const updated = await save();
    if (!updated) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ contest: TeacherContestRecord }>(
        `/api/teacher/contests/${updated.id}/publish`,
        jsonBody({ username }),
      );
      onPublished(result.contest);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "发布周赛失败",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="contest-draft-editor">
      <header>
        <div>
          <strong>
            <Sparkles size={15} /> 像素试卷工坊
          </strong>
          <span>
            {draft.source_name} · 共 {draft.problems.length} 道题 ·
            可逐题校正识别结果
          </span>
        </div>
        <button type="button" onClick={onCancel} aria-label="关闭编辑器">
          <X size={17} />
        </button>
      </header>
      <div className="contest-draft-settings">
        <label className="is-wide">
          <span>周赛名称</span>
          <input
            value={draft.title}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({
                ...current,
                title: event.target.value,
              }));
            }}
          />
        </label>
        <label>
          <span>答题时长</span>
          <input
            type="number"
            min={15}
            max={300}
            value={draft.duration}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({
                ...current,
                duration: Number(event.target.value) || 60,
              }));
            }}
          />
        </label>
        <label>
          <span>开始时间</span>
          <input
            type="datetime-local"
            value={draft.start_at || ""}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({
                ...current,
                start_at: event.target.value,
              }));
            }}
          />
        </label>
        <label>
          <span>截止时间</span>
          <input
            type="datetime-local"
            value={draft.end_at || ""}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({
                ...current,
                end_at: event.target.value,
              }));
            }}
          />
        </label>
        <label>
          <span>比赛期间 AI</span>
          <select
            value={draft.ai_policy || "hints"}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({
                ...current,
                ai_policy: event.target
                  .value as TeacherContestRecord["ai_policy"],
              }));
            }}
          >
            <option value="disabled">禁止使用</option>
            <option value="hints">只给提示</option>
            <option value="normal">正常使用</option>
          </select>
        </label>
        <label>
          <span>参赛范围</span>
          <select
            value={draft.class_scope || "all"}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({
                ...current,
                class_scope: event.target.value,
              }));
            }}
          >
            <option value="all">所有已登录学生</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="contest-ranking-toggle">
          <input
            type="checkbox"
            checked={draft.ranking_visible}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({
                ...current,
                ranking_visible: event.target.checked,
              }));
            }}
          />
          <span>学生可查看排行榜</span>
        </label>
      </div>
      <div className="contest-edit-problems">
        <div className="contest-problems-heading">
          <h3>
            <ListChecks size={15} /> 试卷题目 · 选择题 / 判断题 / 填空题 / 编程题
          </h3>
          <button type="button" onClick={addProblem}>
            <Plus size={14} />
            新增题目
          </button>
        </div>
        {draft.problems.map((problem, index) => (
          <details key={problem.id} open={index === 0}>
            <summary>
              <span>{index + 1}</span>
              <strong>{problem.title || `第 ${index + 1} 题`}</strong>
              <small>
                <b
                  className={`contest-type-badge is-${problem.type || "programming"}`}
                >
                  {problem.type === "single_choice"
                    ? "选择"
                    : problem.type === "true_false"
                      ? "判断"
                      : problem.type === "fill_blank"
                        ? "填空"
                        : problem.type === "short_answer"
                          ? "简答"
                          : "编程"}
                </b>
                {problem.difficulty} · {problem.points} 分
              </small>
              <ChevronDown size={15} />
            </summary>
            <div className="contest-problem-fields">
              <div className="contest-problem-tools">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveProblem(index, -1)}
                >
                  <ArrowUp size={13} />
                  上移
                </button>
                <button
                  type="button"
                  disabled={index === draft.problems.length - 1}
                  onClick={() => moveProblem(index, 1)}
                >
                  <ArrowDown size={13} />
                  下移
                </button>
                <button
                  type="button"
                  className="is-danger"
                  disabled={draft.problems.length <= 1}
                  onClick={() => {
                    setSaved(false);
                    setDraft((current) => ({
                      ...current,
                      problems: current.problems.filter(
                        (_, problemIndex) => problemIndex !== index,
                      ),
                    }));
                  }}
                >
                  <Trash2 size={13} />
                  删除本题
                </button>
              </div>
              <label className="is-wide">
                <span>题目名称</span>
                <input
                  value={problem.title}
                  onChange={(event) =>
                    patchProblem(index, { title: event.target.value })
                  }
                />
              </label>
              <label>
                <span>题型</span>
                <select
                  value={problem.type || "programming"}
                  onChange={(event) =>
                    patchProblem(index, {
                      type: event.target.value as ContestProblemType,
                    })
                  }
                >
                  <option value="single_choice">选择题</option>
                  <option value="true_false">判断题</option>
                  <option value="fill_blank">填空题</option>
                  <option value="short_answer">简答题</option>
                  <option value="programming">编程题</option>
                </select>
              </label>
              <label>
                <span>难度</span>
                <select
                  value={problem.difficulty}
                  onChange={(event) =>
                    patchProblem(index, {
                      difficulty: event.target.value as OjProblem["difficulty"],
                    })
                  }
                >
                  <option>入门</option>
                  <option>基础</option>
                  <option>进阶</option>
                  <option>挑战</option>
                </select>
              </label>
              <label>
                <span>分值</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={problem.points}
                  onChange={(event) =>
                    patchProblem(index, {
                      points: Number(event.target.value) || 20,
                    })
                  }
                />
              </label>
              <label className="is-full">
                <span>题目描述</span>
                <textarea
                  value={problem.description}
                  onChange={(event) =>
                    patchProblem(index, { description: event.target.value })
                  }
                />
              </label>
              {problem.type === "single_choice" && (
                <section className="contest-choice-editor">
                  <header>
                    <div>
                      <strong>选择题选项</strong>
                      <span>学生端将以单选按钮作答</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        patchOptions(index, (options) => [
                          ...options,
                          {
                            key: String.fromCharCode(65 + options.length),
                            text: "",
                          },
                        ])
                      }
                    >
                      <Plus size={14} />
                      添加选项
                    </button>
                  </header>
                  <div>
                    {(problem.options || []).map((option, optionIndex) => (
                      <article key={`${option.key}-${optionIndex}`}>
                        <b>{option.key}</b>
                        <input
                          value={option.text}
                          onChange={(event) =>
                            patchOptions(index, (options) =>
                              options.map((item, itemIndex) =>
                                itemIndex === optionIndex
                                  ? { ...item, text: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="填写选项内容"
                        />
                        <button
                          type="button"
                          aria-label={`删除选项 ${option.key}`}
                          onClick={() =>
                            patchOptions(index, (options) =>
                              options.filter(
                                (_, itemIndex) => itemIndex !== optionIndex,
                              ),
                            )
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </article>
                    ))}
                  </div>
                  <label>
                    <span>正确答案</span>
                    <select
                      value={String(problem.correct_answer || "")}
                      onChange={(event) =>
                        patchProblem(index, {
                          correct_answer: event.target.value,
                        })
                      }
                    >
                      <option value="">请选择</option>
                      {(problem.options || []).map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.key} · {option.text || "未填写"}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              )}
              {problem.type === "true_false" && (
                <section className="contest-boolean-editor">
                  <span>标准答案</span>
                  <div>
                    <button
                      type="button"
                      className={
                        problem.correct_answer === true ||
                        problem.correct_answer === "true"
                          ? "is-selected"
                          : ""
                      }
                      onClick={() =>
                        patchProblem(index, { correct_answer: true })
                      }
                    >
                      ✓ 正确
                    </button>
                    <button
                      type="button"
                      className={
                        problem.correct_answer === false ||
                        problem.correct_answer === "false"
                          ? "is-selected"
                          : ""
                      }
                      onClick={() =>
                        patchProblem(index, { correct_answer: false })
                      }
                    >
                      ✕ 错误
                    </button>
                  </div>
                </section>
              )}
              {(problem.type === "fill_blank" || problem.type === "short_answer") && (
                <label className="is-wide"><span>参考答案</span><input value={String(problem.correct_answer || "")} onChange={(event) => patchProblem(index, { correct_answer: event.target.value })} placeholder="填写学生答案的判定标准" /></label>
              )}
              {problem.type !== "single_choice" &&
                problem.type !== "true_false" && problem.type !== "short_answer" && problem.type !== "fill_blank" && (
                  <>
                    <label className="is-full">
                      <span>输入格式</span>
                      <textarea
                        value={problem.input}
                        onChange={(event) =>
                          patchProblem(index, { input: event.target.value })
                        }
                      />
                    </label>
                    <label className="is-full">
                      <span>输出格式</span>
                      <textarea
                        value={problem.output}
                        onChange={(event) =>
                          patchProblem(index, { output: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>样例输入</span>
                      <textarea
                        value={problem.examples[0]?.input || ""}
                        onChange={(event) =>
                          patchProblem(index, {
                            examples: [
                              {
                                input: event.target.value,
                                output: problem.examples[0]?.output || "",
                              },
                            ],
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>样例输出</span>
                      <textarea
                        value={problem.examples[0]?.output || ""}
                        onChange={(event) =>
                          patchProblem(index, {
                            examples: [
                              {
                                input: problem.examples[0]?.input || "",
                                output: event.target.value,
                              },
                            ],
                          })
                        }
                      />
                    </label>
                  </>
                )}
              {problem.type !== "single_choice" &&
                problem.type !== "true_false" && problem.type !== "short_answer" && problem.type !== "fill_blank" && (
                  <section className="contest-hidden-tests">
                    <header>
                      <div>
                        <strong>隐藏判题测试点</strong>
                        <span>学生端不会显示，提交时由后端逐个检查</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          patchTestCases(index, (tests) => [
                            ...tests,
                            { input: "", output: "" },
                          ])
                        }
                      >
                        <Plus size={14} />
                        添加测试点
                      </button>
                    </header>
                    <div>
                      {(problem.test_cases?.length
                        ? problem.test_cases
                        : problem.examples
                      ).map((test, testIndex) => (
                        <article key={testIndex}>
                          <span>{testIndex + 1}</span>
                          <label>
                            <small>输入</small>
                            <textarea
                              value={test.input}
                              onChange={(event) =>
                                patchTestCases(index, (tests) =>
                                  tests.map((item, itemIndex) =>
                                    itemIndex === testIndex
                                      ? { ...item, input: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            <small>正确输出</small>
                            <textarea
                              value={test.output}
                              onChange={(event) =>
                                patchTestCases(index, (tests) =>
                                  tests.map((item, itemIndex) =>
                                    itemIndex === testIndex
                                      ? { ...item, output: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <button
                            type="button"
                            aria-label={`删除第 ${testIndex + 1} 个测试点`}
                            disabled={
                              (problem.test_cases?.length ||
                                problem.examples.length) <= 1
                            }
                            onClick={() =>
                              patchTestCases(index, (tests) =>
                                tests.filter(
                                  (_, itemIndex) => itemIndex !== testIndex,
                                ),
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
            </div>
          </details>
        ))}
      </div>
      {error && <p className="contest-create-error">{error}</p>}
      <footer>
        <span>
          {saved && (
            <>
              <Check size={14} />
              草稿已保存
            </>
          )}
        </span>
        <button type="button" onClick={() => void save()} disabled={busy}>
          <Save size={15} />
          保存草稿
        </button>
        <button
          type="button"
          className="is-primary"
          onClick={() => void publish()}
          disabled={busy || !draft.problems.length}
        >
          <Send size={15} />
          {busy ? "正在保存并发布…" : "确认并发布"}
        </button>
      </footer>
    </section>
  );
}
