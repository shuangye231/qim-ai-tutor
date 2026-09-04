import { useEffect, useMemo, useRef, useState } from "react";
import { ContactRound, ImageUp, Upload } from "lucide-react";
import { ApiError, apiFetch, jsonBody } from "./api/client";
import { AuthPage } from "./components/AuthPage";
import { BillingDialog } from "./components/BillingDialog";
import { ChatPanel } from "./components/ChatPanel";
import { Dialog } from "./components/Dialog";
import { Header } from "./components/Header";
import { LearningSidebar } from "./components/LearningSidebar";
import { Sidebar } from "./components/Sidebar";
import {
  UserCenterDialog,
  type UserCenterTab,
} from "./components/UserCenterDialog";
import { courseById, isCourseId } from "./courses";
import { defaultSessions } from "./data";
import { useAuth, type LoginPortal } from "./hooks/useAuth";
import type {
  CourseId,
  Message,
  ModelOption,
  Quota,
  Session,
  SessionAttachment,
} from "./types";
import { AdminView } from "./views/AdminView";
import { ContestView } from "./views/ContestView";
import { ContestAnalyticsView } from "./views/ContestAnalyticsView";
import { ClassroomView } from "./views/ClassroomView";
import { HomeView } from "./views/HomeView";
import { LearningView } from "./views/LearningView";
import { KnowledgeView } from "./views/KnowledgeView";
import { StudentKnowledgeView } from "./views/StudentKnowledgeView";
import { OjView } from "./views/OjView";
import { AssignmentsView } from "./views/AssignmentsView";
import { DeveloperView } from "./views/DeveloperView";
import { readCodeContext } from "./code/workspace";
import { AvatarContent } from "./components/AvatarContent";
import { FloatingGuideBall } from "./components/FloatingGuideBall";

import { CodeWorkspace } from "./components/CodeWorkspace";

const MODEL_KEY = "ai-tutor-web-model";
const appPath = () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = location.pathname.startsWith(base)
    ? location.pathname.slice(base.length)
    : location.pathname;
  return path || "/";
};
const appLocation = () => `${appPath()}${location.search}`;
const USER_AVATARS = ["👤", "🙂", "😎", "🧑‍💻", "🧑‍🎓", "🌟", "🚀", "💡"];
const AI_AVATARS = ["🤖", "🧠", "🧑‍🏫", "✨", "🔮", "🛰️", "📚", "🎓"];
const userAvatarKey = (user: string) =>
  `ai-tutor-user-avatar:${user || "guest"}`;
const aiAvatarKey = (user: string) => `ai-tutor-ai-avatar:${user || "guest"}`;
const readUserAvatar = (user: string) =>
  localStorage.getItem(userAvatarKey(user)) ||
  localStorage.getItem("userAvatar") ||
  "👤";
const readAiAvatar = (user: string) =>
  localStorage.getItem(aiAvatarKey(user)) ||
  localStorage.getItem("aiAvatar") ||
  "🤖";
const fallbackModels: ModelOption[] = [
  { id: "flash", label: "Flash", current: true },
  { id: "pro", label: "Pro" },
];
const sessionKey = (user: string) =>
  `ai-tutor-web-sessions-v4:${user || "guest"}`;
const legacySessionKey = (user: string) =>
  `ai-tutor-web-sessions-v3:${user || "guest"}`;
const courseKey = (user: string) => `ai-tutor-web-course:${user || "guest"}`;
const inferCourse = (session: Partial<Session>): CourseId => {
  if (isCourseId(session.courseId)) return session.courseId;
  const value = `${session.id || ""} ${session.title || ""}`.toLowerCase();
  if (value.includes("python")) return "python";
  if (value.includes("c++") || value.includes("cpp")) return "cpp";
  return "scratch";
};
const readSessions = (user: string): Session[] => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(sessionKey(user)) ||
        localStorage.getItem(legacySessionKey(user)) ||
        "null",
    );
    return Array.isArray(parsed) && parsed.length
      ? parsed.map((session) => ({
          ...session,
          courseId: inferCourse(session),
        }))
      : defaultSessions;
  } catch {
    return defaultSessions;
  }
};
const readCourse = (user: string): CourseId => {
  const saved = localStorage.getItem(courseKey(user));
  return isCourseId(saved)
    ? saved
    : readSessions(user)[0]?.courseId || "scratch";
};
const makeSession = (courseId: CourseId): Session => ({
  id: `${courseId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  courseId,
  title: "新对话",
  messages: [],
  updatedAt: Date.now(),
});
const makeMessage = (role: Message["role"], content: string): Message => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  role,
  content,
  createdAt: Date.now(),
});
const cleanMessages = (messages: Message[]) =>
  messages.map(({ role, content }) => ({ role, content }));
type ConfirmState = {
  title: string;
  message: string;
  action: () => Promise<void> | void;
  label?: string;
} | null;

export default function App() {
  const auth = useAuth();
  const [route, setRoute] = useState(appPath);
  const [sessions, setSessions] = useState<Session[]>(() =>
    readSessions(auth.currentUser),
  );
  const [sessionOwner, setSessionOwner] = useState(auth.currentUser);
  const [activeCourse, setActiveCourse] = useState<CourseId>(() =>
    readCourse(auth.currentUser),
  );
  const [activeId, setActiveId] = useState(() => {
    const courseId = readCourse(auth.currentUser);
    return (
      readSessions(auth.currentUser).find(
        (session) => session.courseId === courseId,
      )?.id || ""
    );
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attachmentsBySession, setAttachmentsBySession] = useState<
    Record<string, SessionAttachment[]>
  >({});
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [models, setModels] = useState<ModelOption[]>(fallbackModels);
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(MODEL_KEY) || "flash",
  );
  const [quota, setQuota] = useState<Quota | null>(null);
  const [billingOpen, setBillingOpen] = useState(false);
  const [tutorMode, setTutorMode] = useState(
    () => localStorage.getItem("tutorMode") || "explain",
  );
  const [userAvatar, setUserAvatar] = useState(() =>
    readUserAvatar(auth.currentUser),
  );
  const [aiAvatar, setAiAvatar] = useState(() =>
    readAiAvatar(auth.currentUser),
  );
  const [avatarOpen, setAvatarOpen] = useState<"user" | "ai" | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ old: "", next: "" });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackFiles, setFeedbackFiles] = useState<File[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [userCenterOpen, setUserCenterOpen] = useState(false);
  const [userCenterTab, setUserCenterTab] = useState<UserCenterTab>("account");
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const theme = "dark" as const;
  const [studyMode, setStudyMode] = useState<"chat" | "code">("chat");
  const [ojResetToken, setOjResetToken] = useState(0);
  const askControllerRef = useRef<AbortController | null>(null);
  const askRequestRef = useRef(0);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const routeStackRef = useRef<string[]>([appLocation()]);
  const feedbackFileRef = useRef<HTMLInputElement>(null);

  const courseSessions = useMemo(
    () => sessions.filter((session) => session.courseId === activeCourse),
    [activeCourse, sessions],
  );
  const activeSession = useMemo(
    () =>
      sessions.find(
        (session) =>
          session.id === activeId && session.courseId === activeCourse,
      ) || courseSessions[0],
    [activeCourse, activeId, courseSessions, sessions],
  );
  const activeAttachments = attachmentsBySession[activeSession?.id] || [];
  const cancelAsk = (notify = false) => {
    if (!askControllerRef.current) return;
    askRequestRef.current += 1;
    askControllerRef.current.abort();
    askControllerRef.current = null;
    setLoading(false);
    setError("");
    if (notify) setNotice("已停止生成");
  };
  const navigate = (path: string) => {
    cancelAsk();
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    history.pushState({}, "", `${base}${path}`);
    routeStackRef.current = [...routeStackRef.current, path];
    setRoute(appPath());
  };

  useEffect(() => {
    const onPop = () => {
      cancelAsk();
      const next = appLocation();
      const stack = routeStackRef.current;
      if (stack.length > 1 && stack[stack.length - 2] === next) stack.pop();
      else if (stack[stack.length - 1] !== next) stack.push(next);
      setRoute(appPath());
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  useEffect(
    () => () => {
      askRequestRef.current += 1;
      askControllerRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (sessionOwner && sessionOwner !== auth.currentUser) return;
    localStorage.setItem(sessionKey(sessionOwner), JSON.stringify(sessions));
  }, [auth.currentUser, sessions, sessionOwner]);
  useEffect(() => {
    if (sessionOwner && sessionOwner !== auth.currentUser) return;
    localStorage.setItem(courseKey(sessionOwner), activeCourse);
  }, [activeCourse, auth.currentUser, sessionOwner]);
  useEffect(() => {
    cancelAsk();
    const next = readSessions(auth.currentUser);
    const nextCourse = readCourse(auth.currentUser);
    setSessionOwner(auth.currentUser);
    setSessions(next);
    setActiveCourse(nextCourse);
    setActiveId(
      next.find((session) => session.courseId === nextCourse)?.id ||
        next[0]?.id ||
        "",
    );
    setUserAvatar(readUserAvatar(auth.currentUser));
    setAiAvatar(readAiAvatar(auth.currentUser));
    if (auth.currentUser) {
      apiFetch<{ avatar_url: string; ai_avatar_url: string }>(
        `/api/profile?username=${encodeURIComponent(auth.currentUser)}`,
      )
        .then((profile) => {
          if (profile.avatar_url) {
            setUserAvatar(profile.avatar_url);
            localStorage.setItem(
              userAvatarKey(auth.currentUser),
              profile.avatar_url,
            );
          }
          if (profile.ai_avatar_url) {
            setAiAvatar(profile.ai_avatar_url);
            localStorage.setItem(
              aiAvatarKey(auth.currentUser),
              profile.ai_avatar_url,
            );
          }
        })
        .catch(() => undefined);
    }
  }, [auth.currentUser]);
  useEffect(() => {
    if (!auth.currentUser) {
      setQuota(null);
      return;
    }
    apiFetch<Quota>("/api/billing/quota")
      .then(setQuota)
      .catch((requestError) => {
        if (requestError instanceof ApiError && requestError.status === 401)
          auth.logout();
      });
  }, [auth.currentUser]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2800);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    apiFetch<{ models: ModelOption[] }>("/api/models")
      .then((data) => {
        const normalized = data.models.map((item) => ({
          ...item,
          label:
            item.label ||
            item.name ||
            ({ flash: "Flash", pro: "Pro" } as Record<string, string>)[
              item.id
            ] ||
            item.id,
        }));
        setModels(normalized);
        const current = normalized.find((item) => item.current);
        if (current) setSelectedModel(current.id);
      })
      .catch(() => undefined);
  }, []);

  const updateMessages = (
    sessionId: string,
    updater: (messages: Message[]) => Message[],
  ) =>
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: updater(session.messages),
              updatedAt: Date.now(),
            }
          : session,
      ),
    );
  const createSession = () => {
    cancelAsk();
    const session = makeSession(activeCourse);
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
    setInput("");
    setError("");
    if (route !== "/study") navigate("/study");
  };
  const selectCourse = (courseId: CourseId) => {
    if (courseId === activeCourse) return;
    cancelAsk();
    const existing = sessions.find((session) => session.courseId === courseId);
    if (existing) setActiveId(existing.id);
    else {
      const session = makeSession(courseId);
      setSessions((current) => [session, ...current]);
      setActiveId(session.id);
    }
    setActiveCourse(courseId);
    setInput("");
    setError("");
    setNotice(`已切换到 ${courseById(courseId).name}`);
  };

  const sendMessage = async () => {
    const query = input.trim();
    if (!query || loading || !activeSession) return;
    const sessionId = activeSession.id;
    updateMessages(sessionId, (current) => [
      ...current,
      makeMessage("user", query),
    ]);
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId && session.title === "新对话"
          ? {
              ...session,
              title: query.length > 18 ? `${query.slice(0, 18)}…` : query,
            }
          : session,
      ),
    );
    setInput("");
    setError("");
    setLoading(true);
    const controller = new AbortController();
    const requestId = askRequestRef.current + 1;
    askRequestRef.current = requestId;
    askControllerRef.current = controller;
    try {
      const codeContext = readCodeContext(
        auth.currentUser,
        activeCourse,
        sessionId,
      );
      const data = await apiFetch<any>("/api/ask", {
        ...jsonBody({
          query,
          session_id: sessionId,
          course_id: activeCourse,
          username: auth.currentUser,
          tutor_mode: tutorMode,
          model_id: selectedModel,
          code_context: codeContext,
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted || askRequestRef.current !== requestId)
        return;
      if (data.error) throw new Error(data.message || "模型暂时不可用");
      updateMessages(sessionId, (current) => [
        ...current,
        makeMessage("assistant", data.answer || "暂时没有可显示的回答。"),
      ]);
      if (data.quota) setQuota(data.quota);
    } catch (requestError) {
      if (
        controller.signal.aborted ||
        askRequestRef.current !== requestId ||
        (requestError instanceof DOMException &&
          requestError.name === "AbortError")
      )
        return;
      if (requestError instanceof ApiError && requestError.status === 402) {
        setBillingOpen(true);
        setError("今日免费次数已用完，请联系机构老师充值学习次数。");
      } else
        setError(
          requestError instanceof Error
            ? requestError.message
            : "连接失败，请检查服务后重试。",
        );
    } finally {
      if (askRequestRef.current === requestId) {
        askControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  const attachFile = async (file: File) => {
    if (!activeSession || attachmentBusy) return;
    const sessionId = activeSession.id;
    const form = new FormData();
    form.append("session_id", sessionId);
    form.append("course_id", activeCourse);
    form.append("username", auth.currentUser);
    form.append("file", file);
    setAttachmentBusy(true);
    try {
      const attachment = await apiFetch<SessionAttachment>(
        "/api/session/attachment",
        { method: "POST", body: form },
      );
      setAttachmentsBySession((current) => ({
        ...current,
        [sessionId]: [...(current[sessionId] || []), attachment],
      }));
      setNotice(`${attachment.name} 已加入当前会话`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "附件读取失败");
    } finally {
      setAttachmentBusy(false);
    }
  };
  const removeAttachment = async (attachmentId: string) => {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    setAttachmentsBySession((current) => ({
      ...current,
      [sessionId]: (current[sessionId] || []).filter(
        (item) => item.id !== attachmentId,
      ),
    }));
    try {
      await apiFetch(
        `/api/session/attachment/${activeCourse}/${encodeURIComponent(sessionId)}/${encodeURIComponent(attachmentId)}`,
        { method: "DELETE" },
      );
    } catch {
      setNotice("附件移除失败，请重试");
    }
  };
  const changeModel = async (id: string) => {
    setSelectedModel(id);
    localStorage.setItem(MODEL_KEY, id);
    setNotice(`已切换到 ${models.find((item) => item.id === id)?.label || id}`);
  };

  const logout = () => {
    auth.logout();
    setNotice("已退出登录");
    if (route !== "/") navigate("/");
  };
  const showLogin = () => auth.logout();

  const renameSession = (id: string) => {
    const session = sessions.find((item) => item.id === id);
    if (!session) return;
    setRenameId(id);
    setRenameValue(session.title);
  };
  const saveRename = () => {
    if (renameValue.trim())
      setSessions((current) =>
        current.map((item) =>
          item.id === renameId ? { ...item, title: renameValue.trim() } : item,
        ),
      );
    setRenameId("");
  };
  const deleteSession = (id: string) =>
    setConfirmState({
      title: "删除会话",
      message: "该会话及其本地消息将被永久删除。",
      action: () => {
        const next = sessions.filter((item) => item.id !== id);
        const remainingCourseSessions = next.filter(
          (item) => item.courseId === activeCourse,
        );
        if (!remainingCourseSessions.length) {
          const replacement = makeSession(activeCourse);
          setSessions([replacement, ...next]);
          setActiveId(replacement.id);
        } else {
          setSessions(next);
          if (id === activeId) setActiveId(remainingCourseSessions[0].id);
        }
      },
    });
  const clearSession = () =>
    activeSession &&
    setConfirmState({
      title: "清空当前对话",
      message: "会话标题会保留，但全部消息和附件将被移除。",
      label: "确认清空",
      action: async () => {
        await apiFetch(
          "/api/clear",
          jsonBody({
            session_id: activeSession.id,
            course_id: activeCourse,
            username: auth.currentUser || "anonymous",
          }),
        );
        updateMessages(activeSession.id, () => []);
        setAttachmentsBySession((current) => ({
          ...current,
          [activeSession.id]: [],
        }));
        setNotice("当前对话已清空");
      },
    });

  const exportMarkdown = () => {
    if (!activeSession?.messages.length) {
      setNotice("当前会话没有可导出的内容");
      return;
    }
    const markdown = `# ${activeSession.title}\n\n${activeSession.messages.map((item) => `${item.role === "user" ? "## 我" : "## 启码 AI 学伴"}\n\n${item.content}`).join("\n\n")}`;
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeSession.title}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Markdown 已导出");
  };
  const exportPdf = () => {
    if (!activeSession?.messages.length) {
      setNotice("当前会话没有可导出的内容");
      return;
    }
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice("浏览器拦截了打印窗口");
      return;
    }
    const escape = (value: string) =>
      value
        .replace(
          /[&<>]/g,
          (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] || char,
        )
        .replace(/\n/g, "<br>");
    popup.document.write(
      `<title>${escape(activeSession.title)}</title><style>body{font:14px/1.8 "Microsoft YaHei",sans-serif;max-width:780px;margin:40px auto;color:#18212c}section{margin:20px 0;padding:16px;border:1px solid #e4e8ee;border-radius:8px}h3{color:#2563eb}</style><h1>${escape(activeSession.title)}</h1>${activeSession.messages.map((item) => `<section><h3>${item.role === "user" ? "我" : "启码 AI 学伴"}</h3><p>${escape(item.content)}</p></section>`).join("")}`,
    );
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
  };
  const share = async () => {
    if (!activeSession?.messages.length) {
      setNotice("当前会话还没有可分享的内容");
      return;
    }
    try {
      const data = await apiFetch<any>(
        "/api/share",
        jsonBody({
          title: activeSession.title,
          messages: cleanMessages(activeSession.messages),
        }),
      );
      const url = location.origin + data.share_path;
      await navigator.clipboard?.writeText(url);
      setNotice(navigator.clipboard ? "分享链接已复制" : url);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "分享失败");
    }
  };
  const loadStats = async () => {
    try {
      const [session, global, user] = await Promise.all([
        apiFetch<any>(
          "/api/session/stats",
          jsonBody({
            session_id: activeSession?.id,
            course_id: activeCourse,
            username: auth.currentUser,
          }),
        ),
        apiFetch<any>("/api/stats/global"),
        auth.currentUser
          ? apiFetch<any>(
              "/api/user/stats",
              jsonBody({ username: auth.currentUser }),
            )
          : Promise.resolve(null),
      ]);
      setStats({ session, global, user });
    } catch (e) {
      setStats({ error: e instanceof Error ? e.message : "统计读取失败" });
    }
  };
  const startVoice = (setText: (value: string) => void) => {
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setNotice("当前浏览器不支持语音输入");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.onresult = (event: any) =>
      setText(event.results[0][0].transcript);
    recognition.onerror = () => setNotice("语音识别未完成，请重试");
    recognition.start();
    setNotice("正在聆听，请开始说话");
  };
  const openUserCenter = (tab: UserCenterTab) => {
    setUserCenterTab(tab);
    setUserCenterOpen(true);
    if (tab === "usage") void loadStats();
  };
  const changeUserCenterTab = (tab: UserCenterTab) => {
    setUserCenterTab(tab);
    if (tab === "usage") void loadStats();
  };
  const applyAvatarProfile = (profile: {
    avatar_url: string;
    ai_avatar_url: string;
  }) => {
    if (profile.avatar_url) {
      setUserAvatar(profile.avatar_url);
      localStorage.setItem(userAvatarKey(auth.currentUser), profile.avatar_url);
    }
    if (profile.ai_avatar_url) {
      setAiAvatar(profile.ai_avatar_url);
      localStorage.setItem(
        aiAvatarKey(auth.currentUser),
        profile.ai_avatar_url,
      );
    }
  };
  const chooseAvatar = async (avatar: string) => {
    if (!avatarOpen) return;
    setAvatarBusy(true);
    try {
      const profile = await apiFetch<{
        avatar_url: string;
        ai_avatar_url: string;
      }>("/api/profile/avatar", {
        ...jsonBody({
          username: auth.currentUser,
          kind: avatarOpen,
          value: avatar,
        }),
        method: "PUT",
      });
      applyAvatarProfile(profile);
      setAvatarOpen(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "头像设置失败");
    } finally {
      setAvatarBusy(false);
    }
  };
  const uploadAvatar = async (file: File) => {
    if (!avatarOpen) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      )
    )
      return setNotice("头像仅支持 JPG、PNG、WebP 和 GIF");
    if (file.size > 5 * 1024 * 1024) return setNotice("头像不能超过 5MB");
    const form = new FormData();
    form.append("username", auth.currentUser);
    form.append("kind", avatarOpen);
    form.append("file", file);
    setAvatarBusy(true);
    try {
      const profile = await apiFetch<{
        avatar_url: string;
        ai_avatar_url: string;
      }>("/api/profile/avatar", { method: "POST", body: form });
      applyAvatarProfile(profile);
      setAvatarOpen(null);
      setNotice(avatarOpen === "user" ? "用户头像已更新" : "AI 学伴头像已更新");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "头像上传失败");
    } finally {
      setAvatarBusy(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };
  const loginToHome = async (
    username: string,
    password: string,
    portal: LoginPortal,
    institutionCode: string,
  ) => {
    const role = await auth.login(username, password, portal, institutionCode);
    const nextRoute = role === "developer" ? "/developer" : "/";
    history.replaceState({}, "", nextRoute);
    routeStackRef.current = [nextRoute];
    setRoute(nextRoute);
  };

  const goBack = () => {
    const query = new URLSearchParams(location.search);
    if (route === "/oj" && query.has("problem")) {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      history.pushState({}, "", `${base}/oj`);
      routeStackRef.current = routeStackRef.current.slice(0, -1);
      setOjResetToken((value) => value + 1);
      setRoute("/oj");
      return;
    }
    const stack = routeStackRef.current;
    if (stack.length > 1) {
      stack.pop();
      const target = stack[stack.length - 1] || "/";
      history.pushState(
        {},
        "",
        `${import.meta.env.BASE_URL.replace(/\/$/, "")}${target}`,
      );
      setRoute(appPath());
      return;
    }
    navigate("/");
  };

  if (!auth.currentUser)
    return <AuthPage onLogin={loginToHome} onRegister={auth.register} />;
  if (!activeSession) return null;
  return (
    <div
      className={`app-root ${route === "/" || route === "/contest" || route === "/contest/analytics" || route === "/classes" || route === "/oj" || route === "/assignments" || route === "/knowledge" || auth.role === "developer" ? "is-home" : ""} ${route === "/study" || route === "/learning" ? "is-study" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <Header
        currentUser={auth.currentUser}
        role={auth.role}
        userAvatar={userAvatar}
        onFeedback={() => setFeedbackOpen(true)}
        onContact={() => setContactOpen(true)}
        onLogin={showLogin}
        onLogout={logout}
        onUserCenter={openUserCenter}
        onNavigate={navigate}
      />
      {auth.role === "developer" ? (
        <DeveloperView onNotice={setNotice} />
      ) : route === "/knowledge" && auth.role === "teacher" ? (
        <KnowledgeView
          username={auth.currentUser}
          onNotice={setNotice}
          onClose={() => navigate("/")}
          onClasses={() => navigate("/classes")}
          onChanged={() => undefined}
        />
      ) : route === "/knowledge" && auth.role === "user" ? (
        <StudentKnowledgeView username={auth.currentUser} onClose={() => navigate("/")} />
      ) : route === "/" ? (
        <HomeView
          username={auth.currentUser}
          role={auth.role}
          onStudy={() => navigate("/study")}
          onCourseware={() => navigate("/knowledge")}
          onContest={() => navigate("/contest")}
          onOj={() => navigate("/oj")}
          onClasses={() => navigate("/classes")}
          onAssignments={() => navigate("/assignments")}
        />
      ) : route === "/classes" ? (
        <ClassroomView username={auth.currentUser} role={auth.role} />
      ) : route === "/assignments" ? (
        <AssignmentsView
          username={auth.currentUser}
          role={auth.role}
          onNotice={setNotice}
          onAskTeacher={(message, classId) =>
            navigate(
              `/classes?class=${encodeURIComponent(classId)}&ask=${encodeURIComponent(message)}`,
            )
          }
        />
      ) : route === "/contest/analytics" ? (
        <ContestAnalyticsView
          contestId={new URLSearchParams(location.search).get("contest") || ""}
          username={auth.currentUser}
          onClose={() => navigate("/contest")}
        />
      ) : route === "/contest" ? (
        <ContestView
          username={auth.currentUser}
          role={auth.role}
          modelId={selectedModel}
          onQuota={setQuota}
          onAnalytics={(contestId) => navigate(`/contest/analytics?contest=${encodeURIComponent(contestId)}`)}
          onProblem={(problemId, contestId) =>
            navigate(
              `/oj?problem=${encodeURIComponent(problemId)}${contestId ? `&contest=${encodeURIComponent(contestId)}&return=contest` : ""}`,
            )
          }
        />
      ) : route === "/oj" ? (
        <OjView
          username={auth.currentUser}
          theme={theme}
          resetToken={ojResetToken}
          contestPreview={auth.role !== "user"}
          onProblemOpen={(problemId) =>
            navigate(`/oj?problem=${encodeURIComponent(problemId)}`)
          }
          onAskTeacher={(message) =>
            navigate(`/classes?ask=${encodeURIComponent(message)}`)
          }
          onContestReturn={() => navigate("/contest")}
        />
      ) : (
        <div
          className={`workspace-grid ${route === "/study" && studyMode === "code" ? "is-code-mode" : ""}`}
        >
          <Sidebar
            sessions={courseSessions}
            activeCourse={activeCourse}
            activeId={activeSession.id}
            onCourseSelect={selectCourse}
            onSelect={(id) => {
              cancelAsk();
              setActiveId(id);
              if (route !== "/study") navigate("/study");
            }}
            onNew={createSession}
            onHome={() => navigate("/")}
            onRename={renameSession}
            onDelete={deleteSession}
          />
          {route === "/learning" ? (
            <LearningView
              username={auth.currentUser}
              courseId={activeCourse}
              sessionId={activeSession.id}
              messages={activeSession.messages}
              onLogin={showLogin}
              onNotice={setNotice}
              onClose={() => navigate("/study")}
            />
          ) : route === "/admin" ? (
            <AdminView onNotice={setNotice} />
          ) : (
            <>
              {studyMode === "code" ? (
                <CodeWorkspace
                  username={auth.currentUser}
                  courseId={activeCourse}
                  sessionId={activeSession.id}
                  theme={theme}
                  onChat={() => setStudyMode("chat")}
                  onAskAi={(prompt) => {
                    setInput(prompt);
                    setStudyMode("chat");
                    setNotice("编程环境已附加，发送问题后 AI 会自动读取");
                  }}
                />
              ) : (
                <ChatPanel
                  title={`${courseById(activeCourse).shortName} · ${activeSession.title}`}
                  userAvatar={userAvatar}
                  aiAvatar={aiAvatar}
                  messages={activeSession.messages}
                  input={input}
                  onInput={setInput}
                  onSend={sendMessage}
                  onStop={() => cancelAsk(true)}
                  onPrompt={setInput}
                  onUpload={attachFile}
                  attachments={activeAttachments}
                  attachmentBusy={attachmentBusy}
                  onRemoveAttachment={removeAttachment}
                  loading={loading}
                  error={error}
                  models={models}
                  selectedModel={selectedModel}
                  onModelChange={changeModel}
                  tutorMode={tutorMode}
                  onTutorModeChange={(mode) => {
                    setTutorMode(mode);
                    localStorage.setItem("tutorMode", mode);
                    setNotice("导师方式已切换");
                  }}
                  onVoice={startVoice}
                  onExportMarkdown={exportMarkdown}
                  onExportPdf={exportPdf}
                  onShare={share}
                  onClear={clearSession}
                  onLearning={() => navigate("/learning")}
                  onCode={() => setStudyMode("code")}
                />
              )}
              <LearningSidebar
                username={auth.currentUser}
                courseId={activeCourse}
                sessionId={activeSession.id}
                messages={activeSession.messages}
                onLogin={showLogin}
                onNavigate={navigate}
                onNotice={setNotice}
              />
            </>
          )}
        </div>
      )}
      {notice && (
        <div className="toast-notice" role="status">
          {notice}
        </div>
      )}
      <FloatingGuideBall
        route={route}
        role={auth.role}
        courseName={courseById(activeCourse).name}
        studyMode={studyMode}
        onHome={() => navigate("/")}
        onBack={goBack}
        onFeedback={() => setFeedbackOpen(true)}
        onContact={() => setContactOpen(true)}
      />

      <UserCenterDialog
        open={userCenterOpen}
        tab={userCenterTab}
        username={auth.currentUser}
        role={auth.role}
        userAvatar={userAvatar}
        aiAvatar={aiAvatar}
        quota={quota}
        stats={stats}
        onClose={() => setUserCenterOpen(false)}
        onTabChange={changeUserCenterTab}
        onBuy={() => {
          setUserCenterOpen(false);
          setBillingOpen(true);
        }}
        onAvatar={(kind) => {
          setUserCenterOpen(false);
          setAvatarOpen(kind);
        }}
        onPassword={() => {
          setUserCenterOpen(false);
          setPasswordOpen(true);
        }}
        onDeleteAccount={() => setConfirmState({
          title: "注销账号",
          message: "注销后将永久删除账号、学习记录、班级关系和提交记录，无法恢复。确定继续吗？",
          label: "确认注销",
          action: async () => {
            setUserCenterOpen(false);
            await auth.deleteAccount();
            setNotice("账号已注销");
            history.replaceState({}, "", "/");
            routeStackRef.current = ["/"];
            setRoute("/");
          },
        })}
        onNavigate={navigate}
      />
      <BillingDialog
        open={billingOpen}
        quota={quota}
        onClose={() => setBillingOpen(false)}
        onPaid={(nextQuota) => {
          setQuota(nextQuota);
          setNotice("学习次数已到账");
        }}
      />
      <Dialog
        open={!!avatarOpen}
        title={avatarOpen === "ai" ? "设置 AI 学伴头像" : "设置用户头像"}
        onClose={() => !avatarBusy && setAvatarOpen(null)}
      >
        <div className="avatar-picker">
          <div className="avatar-upload-row">
            <span className="avatar-upload-preview">
              <AvatarContent
                value={avatarOpen === "ai" ? aiAvatar : userAvatar}
                fallback={avatarOpen === "ai" ? "🤖" : "👤"}
              />
            </span>
            <div>
              <strong>上传本地图片</strong>
              <small>支持 JPG、PNG、WebP、GIF，最大 5MB</small>
            </div>
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => avatarFileRef.current?.click()}
            >
              <ImageUp size={16} />
              {avatarBusy ? "上传中..." : "选择图片"}
            </button>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
            />
          </div>
          <p>或者选择像素表情头像</p>
          <div className="avatar-picker-grid">
            {(avatarOpen === "ai" ? AI_AVATARS : USER_AVATARS).map((avatar) => (
              <button
                type="button"
                key={avatar}
                disabled={avatarBusy}
                className={
                  (avatarOpen === "ai" ? aiAvatar : userAvatar) === avatar
                    ? "is-selected"
                    : ""
                }
                onClick={() => void chooseAvatar(avatar)}
                aria-label={`选择头像 ${avatar}`}
              >
                {avatar}
              </button>
            ))}
          </div>
        </div>
      </Dialog>
      <Dialog
        open={passwordOpen}
        title="修改密码"
        onClose={() => setPasswordOpen(false)}
        footer={
          <>
            <button onClick={() => setPasswordOpen(false)}>取消</button>
            <button
              className="dialog-primary"
              onClick={async () => {
                try {
                  await auth.changePassword(
                    passwordForm.old,
                    passwordForm.next,
                  );
                  setPasswordOpen(false);
                  setPasswordForm({ old: "", next: "" });
                  setNotice("密码已修改");
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : "修改失败");
                }
              }}
            >
              保存
            </button>
          </>
        }
      >
        <div className="dialog-form">
          <label>
            原密码
            <input
              type="password"
              value={passwordForm.old}
              onChange={(e) =>
                setPasswordForm((value) => ({ ...value, old: e.target.value }))
              }
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              value={passwordForm.next}
              onChange={(e) =>
                setPasswordForm((value) => ({ ...value, next: e.target.value }))
              }
            />
          </label>
        </div>
      </Dialog>
      <Dialog
        open={feedbackOpen}
        title="意见反馈"
        width="medium"
        panelClassName="pixel-feedback-dialog"
        onClose={() => setFeedbackOpen(false)}
        footer={
          <>
            <button onClick={() => setFeedbackOpen(false)}>取消</button>
            <button
              className="dialog-primary"
              disabled={!feedback.trim()}
              onClick={async () => {
                try {
                  const form = new FormData();
                  form.append("content", feedback);
                  form.append("session_id", activeSession.id);
                  feedbackFiles.forEach((file) => form.append("files", file));
                  await apiFetch("/api/feedback/upload", {
                    method: "POST",
                    body: form,
                  });
                  setFeedback("");
                  setFeedbackFiles([]);
                  setFeedbackOpen(false);
                  setNotice("感谢你的反馈，我们会认真查看并持续改进。");
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : "提交失败");
                }
              }}
            >
              提交反馈
            </button>
          </>
        }
      >
        <div className="pixel-feedback-copy">
          感谢你使用启码 AI 学伴。您可以提交发现的
          bug、使用建议或体验感受，我们会认真记录并持续优化。
        </div>
        <label className="dialog-field">
          反馈内容
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="请尽量描述问题出现的页面、操作步骤和预期结果..."
          />
        </label>
        <div className="feedback-upload-row">
          <input
            ref={feedbackFileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            multiple
            hidden
            onChange={(e) =>
              setFeedbackFiles(Array.from(e.target.files || []).slice(0, 5))
            }
          />
          <button
            type="button"
            onClick={() => feedbackFileRef.current?.click()}
          >
            <Upload size={16} />
            上传图片或视频
          </button>
          <span>
            {feedbackFiles.length
              ? `已选择 ${feedbackFiles.length} 个附件`
              : "可选，最多 5 个文件"}
          </span>
        </div>
      </Dialog>
      <Dialog
        open={contactOpen}
        title="联系我们"
        width="medium"
        panelClassName="pixel-contact-dialog"
        onClose={() => setContactOpen(false)}
        footer={
          <button
            className="dialog-primary"
            onClick={() => setContactOpen(false)}
          >
            知道了
          </button>
        }
      >
        <div className="contact-hero">
          <ContactRound size={28} />
          <div>
            <strong>启码 AI 学伴服务小站</strong>
            <span>一起把每一次学习，变成一段清晰的编程冒险。</span>
          </div>
        </div>
        <div className="contact-sections">
          <section>
            <h3>系统介绍</h3>
            <p>
              启码 AI 学伴面向儿童编程学习，提供 AI
              导师、课程资料、班级交流、作业管理、OJ
              题库和老师自建挑战，帮助学生循序渐进地学习与练习。
            </p>
          </section>
          <section>
            <h3>业务与客服</h3>
            <p>
              如需咨询课程与机构服务、退款、账号问题、技术故障或其他售后事项，请发送邮件说明情况，我们会尽快回复处理。
            </p>
            <a href="mailto:2869210640@qq.com">2869210640@qq.com</a>
          </section>
        </div>
      </Dialog>
      <Dialog
        open={!!renameId}
        title="重命名会话"
        onClose={() => setRenameId("")}
        footer={
          <>
            <button onClick={() => setRenameId("")}>取消</button>
            <button className="dialog-primary" onClick={saveRename}>
              保存
            </button>
          </>
        }
      >
        <label className="dialog-field">
          会话标题
          <input
            value={renameValue}
            maxLength={40}
            onChange={(e) => setRenameValue(e.target.value)}
          />
        </label>
      </Dialog>
      <Dialog
        open={!!confirmState}
        title={confirmState?.title || "确认操作"}
        onClose={() => setConfirmState(null)}
        footer={
          <>
            <button onClick={() => setConfirmState(null)}>取消</button>
            <button
              className="dialog-danger"
              onClick={async () => {
                const state = confirmState;
                setConfirmState(null);
                if (state) {
                  try {
                    await state.action();
                  } catch (e) {
                    setNotice(e instanceof Error ? e.message : "操作失败");
                  }
                }
              }}
            >
              {confirmState?.label || "确认删除"}
            </button>
          </>
        }
      >
        {confirmState?.message}
      </Dialog>
    </div>
  );
}
