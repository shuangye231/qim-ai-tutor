import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Code2,
  LockKeyhole,
  Medal,
  Play,
  Sparkles,
  Trophy,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import type { OjProblem } from "../data/ojProblems";
import type { Quota } from "../types";
import { apiFetch } from "../api/client";
import {
  ContestCreator,
  type TeacherContestRecord,
} from "../components/ContestCreator";
import { ContestExam } from "../components/ContestExam";

type ContestStatus = "报名中" | "即将开始" | "已结束";

type Contest = {
  id: string;
  title: string;
  language: string;
  level: string;
  status: ContestStatus;
  date: string;
  deadline: string;
  duration: string;
  participants: number;
  description: string;
  problemIds: string[];
  problems?: OjProblem[];
  teacher?: string;
};
type ContestLeaderboardEntry = { rank: number; username: string; solved_count: number; auto_score: number; final_score: number | null };

const registeredKey = (username: string) =>
  `ai-tutor-contests:${username || "guest"}`;
const solvedKey = (username: string) =>
  `ai-tutor-oj-solved:${username || "guest"}`;
const activeExamKey = (username: string) =>
  `ai-tutor-active-exam:${username || "guest"}`;
const readList = (key: string) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? (value as string[]) : [];
  } catch {
    return [];
  }
};

interface ContestViewProps {
  username: string;
  role: string;
  modelId: string;
  onProblem: (problemId: string, contestId?: string) => void;
  onQuota?: (quota: Quota) => void;
  onAnalytics?: (contestId: string) => void;
}

const formatContestTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const contestStatus = (contest: TeacherContestRecord): ContestStatus => {
  const now = Date.now();
  if (contest.end_at && new Date(contest.end_at).getTime() < now)
    return "已结束";
  if (contest.start_at && new Date(contest.start_at).getTime() > now)
    return "即将开始";
  return "报名中";
};
const aiPolicyName = {
  disabled: "比赛期间禁用 AI",
  hints: "AI 只提供提示",
  normal: "允许正常使用 AI",
};

const mapTeacherContest = (contest: TeacherContestRecord): Contest => ({
  id: contest.id,
  title: contest.title,
  language:
    contest.language === "cpp"
      ? "C++"
      : contest.language === "python"
        ? "Python"
        : "Scratch",
  level: "教师自定义",
  status: contestStatus(contest),
  date: contest.start_at
    ? formatContestTime(contest.start_at)
    : "老师发布 · 随时开始",
  deadline: contest.end_at
    ? `${formatContestTime(contest.end_at)} 截止`
    : "由任课老师安排截止时间",
  duration: `${contest.duration} 分钟`,
  participants: 0,
  description: `由 ${contest.teacher} 老师上传 ${contest.source_name} 生成，共 ${contest.problem_count} 道题；${aiPolicyName[contest.ai_policy || "hints"]}。`,
  problemIds: contest.problems.map((problem) => problem.id),
  problems: contest.problems,
  teacher: contest.teacher,
});

export function ContestView({
  username,
  role,
  modelId,
  onProblem,
  onQuota,
  onAnalytics,
}: ContestViewProps) {
  const [registered, setRegistered] = useState<string[]>(() =>
    readList(registeredKey(username)),
  );
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem(activeExamKey(username)) || "",
  );
  const [activeContest, setActiveContest] = useState<string | null>(() =>
    localStorage.getItem(activeExamKey(username)),
  );
  const [publishedContests, setPublishedContests] = useState<Contest[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Contest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [leaderboard, setLeaderboard] = useState<ContestLeaderboardEntry[]>([]);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const solved = readList(solvedKey(username));
  const allContests = publishedContests;
  const selected = useMemo(
    () =>
      allContests.find((contest) => contest.id === selectedId) ||
      allContests[0],
    [allContests, selectedId],
  );
  const selectedProblems = useMemo(() => selected?.problems || [], [selected]);
  const isRegistered = selected ? registered.includes(selected.id) : false;
  const completed = selectedProblems.filter((problem) =>
    solved.includes(problem.id),
  );
  const totalPoints = selectedProblems.reduce(
    (sum, problem) => sum + problem.points,
    0,
  );
  const earnedPoints = completed.reduce(
    (sum, problem) => sum + problem.points,
    0,
  );
  const currentGrade = leaderboard.find((student) => student.username === username)?.final_score ?? null;

  useEffect(() => {
    apiFetch<{ contests: TeacherContestRecord[] }>("/api/contests")
      .then((result) =>
        setPublishedContests(result.contests.map(mapTeacherContest)),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // 首次加载期间列表暂时为空，不能清掉正在进行的试卷状态。
    if (!allContests.length) return;
    if (!allContests.some((contest) => contest.id === selectedId))
      setSelectedId(allContests[0].id);
  }, [allContests, selectedId]);

  useEffect(() => {
    if (!selected?.id) {
      setLeaderboard([]);
      return;
    }
    apiFetch<{ students: ContestLeaderboardEntry[] }>(
      `/api/oj/contests/${encodeURIComponent(selected.id)}/leaderboard?username=${encodeURIComponent(username)}`,
    )
      .then((result) => setLeaderboard(result.students))
      .catch(() => setLeaderboard([]));
  }, [selected?.id, username, role]);

  const toggleRegistration = () => {
    if (!selected || selected.status === "已结束") return;
    const next = isRegistered
      ? registered.filter((id) => id !== selected.id)
      : [...registered, selected.id];
    setRegistered(next);
    localStorage.setItem(registeredKey(username), JSON.stringify(next));
    if (isRegistered) setActiveContest(null);
  };

  const startContest = () => {
    if (
      !selected ||
      (role === "user" && (!isRegistered || selected.status === "已结束"))
    )
      return;
    setActiveContest((current) =>
      role !== "user" && current === selected.id ? null : selected.id,
    );
    if (selected.teacher)
      localStorage.setItem(activeExamKey(username), selected.id);
  };

  const removeContest = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(
        `/api/teacher/contests/${deleteTarget.id}?username=${encodeURIComponent(username)}`,
        { method: "DELETE" },
      );
      setPublishedContests((current) =>
        current.filter((contest) => contest.id !== deleteTarget.id),
      );
      setRegistered((current) => {
        const next = current.filter((id) => id !== deleteTarget.id);
        localStorage.setItem(registeredKey(username), JSON.stringify(next));
        return next;
      });
      if (activeContest === deleteTarget.id) {
        localStorage.removeItem(activeExamKey(username));
        setActiveContest(null);
      }
      setSelectedId("");
      setDeleteTarget(null);
    } catch (requestError) {
      setDeleteError(
        requestError instanceof Error ? requestError.message : "比赛删除失败",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (selected && activeContest === selected.id && selected.teacher)
    return (
      <main className="contest-view is-exam" id="main-content">
        <ContestExam
          contestId={selected.id}
          title={selected.title}
          duration={selected.duration}
          username={username}
          problems={selectedProblems}
          preview={role !== "user"}
          onProgramming={onProblem}
          onExit={() => {
            localStorage.removeItem(activeExamKey(username));
            setActiveContest(null);
          }}
        />
      </main>
    );

  return (
    <main className="contest-view" id="main-content">
      <section className="contest-hero">
        <div className="contest-grid-lines" aria-hidden="true" />
        <div className="contest-hero-copy">
          <p className="contest-kicker">
            <Sparkles size={15} /> CODE FOREST · WEEKLY ARENA
          </p>
          <h1>
            每周一次，
            <br />
            <em>把练习变成成长记录。</em>
          </h1>
          <p>
            周赛由老师上传试卷或手工组卷并发布，学生的报名、答题、判题和完成进度统一记录在平台内。
          </p>
        </div>
        <div className="contest-hero-board" aria-label="本周赛事状态">
          <div className="contest-board-top">
            <span>WEEKLY SERIES</span>
            <span className="contest-live-dot">
              <i /> OPEN
            </span>
          </div>
          <div className="contest-board-medal">
            <Trophy size={45} strokeWidth={1.5} />
          </div>
          <strong>教师自建成长周赛</strong>
          <small>完成题目，积分会自动计入当前赛事</small>
          <div className="contest-board-stats">
            <span>
              <b>{publishedContests.length}</b>
              <small>场教师赛事</small>
            </span>
            <span>
              <b>
                {publishedContests.reduce(
                  (sum, contest) => sum + contest.problemIds.length,
                  0,
                )}
              </b>
              <small>道赛题</small>
            </span>
            <span>
              <b>{solved.length}</b>
              <small>已通过</small>
            </span>
          </div>
        </div>
      </section>

      <section className="contest-content">
        <div className="contest-management-tools">
          {role !== "user" && (
            <ContestCreator
              username={username}
              modelId={modelId}
              onQuota={onQuota}
              onPublished={(contest) => {
                const mapped = mapTeacherContest(contest);
                setPublishedContests((current) => [
                  mapped,
                  ...current.filter((item) => item.id !== mapped.id),
                ]);
                setSelectedId(mapped.id);
              }}
            />
          )}
        </div>
        <div className="contest-section-head">
          <div>
            <p>TEACHER CONTESTS</p>
            <h2>选择老师发布的挑战</h2>
          </div>
          <span>这里只显示老师自建并发布的周赛</span>
        </div>
        {selected ? (
          <div className="contest-layout">
            <div className="contest-list" aria-label="赛事列表">
              {allContests.map((contest) => (
                <button
                  key={contest.id}
                  type="button"
                  className={`contest-card ${contest.id === selected.id ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelectedId(contest.id);
                    setActiveContest(null);
                    setLeaderboardOpen(false);
                  }}
                >
                  <span className="contest-card-icon">
                    <Code2 size={21} />
                  </span>
                  <span className="contest-card-copy">
                    <b>{contest.title}</b>
                    <small>
                      {contest.language} · {contest.level} · {contest.date}
                    </small>
                  </span>
                  <span
                    className={`contest-status is-${contest.status === "报名中" ? "open" : contest.status === "即将开始" ? "soon" : "closed"}`}
                  >
                    {contest.status}
                  </span>
                  <ArrowRight className="contest-card-arrow" size={17} />
                </button>
              ))}
            </div>

            <article className="contest-detail">
              <div className="contest-detail-head">
                <div>
                  <span
                    className={`contest-status is-${selected.status === "报名中" ? "open" : selected.status === "即将开始" ? "soon" : "closed"}`}
                  >
                    {selected.status}
                  </span>
                  <h3>{selected.title}</h3>
                </div>
                <Medal size={30} />
              </div>
              <p className="contest-detail-description">
                {selected.description}
              </p>
              <div className="contest-meta-grid">
                <span>
                  <CalendarDays size={16} />
                  <b>{selected.date}</b>
                  <small>开赛时间</small>
                </span>
                <span>
                  <Clock3 size={16} />
                  <b>{selected.duration}</b>
                  <small>答题时长</small>
                </span>
                <span>
                  <UsersRound size={16} />
                  <b>{selected.participants}</b>
                  <small>已报名</small>
                </span>
                <span>
                  <CheckCircle2 size={16} />
                  <b>{selectedProblems.length} 题</b>
                  <small>满分 {totalPoints}</small>
                </span>
              </div>
              <div className="contest-detail-note">
                <LockKeyhole size={16} />
                <span>
                  {selected.deadline}。进入题目后由 OJ
                  系统运行和判题，完成记录会同步回本场周赛。
                </span>
              </div>
              <div className="contest-score-strip">
                <span>
                  <b>
                    {completed.length}/{selectedProblems.length}
                  </b>
                  <small>已完成题目</small>
                </span>
                <span>
                  <b>
                    {currentGrade === null ? `${earnedPoints}/${totalPoints}` : `${currentGrade}/100`}
                  </b>
                  <small>{currentGrade === null ? "自动完成积分" : "老师最终评分"}</small>
                </span>
                <span>
                  <b>
                    {selectedProblems.length
                      ? Math.round(
                          (completed.length / selectedProblems.length) * 100,
                        )
                      : 0}
                    %
                  </b>
                  <small>完成进度</small>
                </span>
              </div>
              <div className="contest-detail-actions">
                <button
                  type="button"
                  className="contest-secondary"
                  onClick={() => setLeaderboardOpen(true)}
                >
                  <Trophy size={16} />
                  查看本场积分榜
                </button>
                {role !== "user" && selected.teacher === username && (
                  <button
                    type="button"
                    className="contest-danger"
                    onClick={() => {
                      setDeleteError("");
                      setDeleteTarget(selected);
                    }}
                  >
                    <Trash2 size={16} />
                    删除比赛
                  </button>
                )}
                {role !== "user" && selected.teacher && (
                  <button
                    type="button"
                    className="contest-secondary"
                    onClick={() => onAnalytics?.(selected.id)}
                  >
                    <BarChart3 size={16} />
                    查看成绩
                  </button>
                )}
                {role === "user" && (
                  <button
                    type="button"
                    className="contest-secondary"
                    onClick={toggleRegistration}
                    disabled={selected.status === "已结束"}
                  >
                    {isRegistered ? "取消报名" : "报名参赛"}
                  </button>
                )}
                <button
                  type="button"
                  className="contest-primary"
                  onClick={startContest}
                  disabled={
                    role === "user" &&
                    (!isRegistered || selected.status === "已结束")
                  }
                >
                  <Play size={16} />
                  {activeContest === selected.id
                    ? "收起赛题"
                    : role === "user"
                      ? "进入比赛"
                      : "预览赛题"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </article>
          </div>
        ) : (
          <section className="contest-empty-state">
            <span>✦</span>
            <h3>还没有老师发布周赛</h3>
            <p>
              {role === "user"
                ? "老师发布新的周赛后，这里会出现你的学习挑战。"
                : "上传试卷或手工组卷，发布后学生就能在这里参加。"}
            </p>
          </section>
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
              aria-labelledby="delete-contest-title"
            >
              <span>
                <AlertTriangle size={24} />
              </span>
              <h2 id="delete-contest-title">确认删除比赛？</h2>
              <p>
                删除“{deleteTarget.title}
                ”后，比赛、学生答题记录和提交结果都会被永久移除，此操作无法撤销。
              </p>
              {deleteError && (
                <p className="exam-confirm-error">{deleteError}</p>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={removeContest}
                  disabled={deleting}
                >
                  {deleting ? "正在删除…" : "确认删除"}
                </button>
              </div>
            </section>
          </div>
        )}

        {selected && leaderboardOpen && (
          <div className="contest-ranking-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLeaderboardOpen(false) }}>
            <section className="contest-ranking" aria-labelledby="contest-ranking-title" role="dialog" aria-modal="true">
              <div>
                <Trophy size={23} />
                <span>
                  <h2 id="contest-ranking-title">本场周赛积分榜</h2>
                  <p>仅显示本场比赛所属班级，按老师最终评分排序（满分 100）</p>
                </span>
                <button type="button" className="contest-ranking-close" aria-label="关闭积分榜" onClick={() => setLeaderboardOpen(false)}><X size={17} /></button>
              </div>
              <ol>
                {leaderboard.map((student) => (
                  <li key={student.username} className={student.username === username ? "is-current" : ""}>
                    <b>{student.rank}</b>
                    <span>{student.username}{student.username === username ? "（我）" : ""}</span>
                    <strong>{student.final_score === null ? "待评分" : `${student.final_score} / 100 分`}</strong>
                  </li>
                ))}
                {!leaderboard.length && <li className="is-empty">本场还没有可展示的参赛学生。</li>}
              </ol>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
