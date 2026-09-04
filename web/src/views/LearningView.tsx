import { ArrowRight, BarChart3, Check, Lock, RefreshCw, Share2, Target, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { apiFetch, jsonBody } from '../api/client'
import { courseById, courseTopics, isStageComplete, stageCompletedCount, stageTopics, unlockedStageIndex } from '../courses'
import { useCourseProgress } from '../hooks/useCourseProgress'
import type { CourseId, Message } from '../types'
import { Dialog } from '../components/Dialog'
import { LearningGeneration } from '../components/LearningGeneration'

type Tab = 'overview' | 'plans' | 'notes' | 'quiz' | 'mistakes' | 'reviews' | 'report'
interface LearningViewProps { username: string; courseId: CourseId; sessionId: string; messages: Message[]; onLogin: () => void; onNotice: (text: string) => void; onClose: () => void }
interface Note { id: string; session_id?: string; title: string; content: string; created_at: string }
interface Attempt { id: number; session_id: string; question: string; answer: string; is_correct: number; mastered: number; created_at: string }
interface Review { id: number; topic: string; round: number; due_at: string; is_due: boolean }
interface QuizItem { id: string; question: string; hint: string; answer: string }
interface MistakeBookItem { id: string; source: 'practice' | 'oj'; title: string; detail: string; created_at: string; action_url: string }
interface ParentReport { student: string; period: { start: string; end: string }; summary: { study_days: number; queries: number; practice_total: number; practice_accuracy: number; notes: number; contest_submissions: number; contest_problems: number; contest_accepted: number; open_mistakes: number }; highlights: string[]; focus: string[]; suggestions: string[] }
interface MasteryMatrix { student: string; matrix: { course_id: string; label: string; route_completed: number; route_total: number; route_rate: number; practice_total: number; practice_accuracy: number; oj_attempts: number; oj_accepted: number; oj_rate: number }[]; weak_points: string[]; due_reviews: number; practice: { total: number; correct: number; accuracy: number } }
type GenerationKind = '笔记' | '练习'

const minimumAnimation = () => new Promise((resolve) => setTimeout(resolve, 650))

export function LearningView({ username, courseId, sessionId, messages, onLogin, onNotice, onClose }: LearningViewProps) {
  const [tab, setTab] = useState<Tab>(() => {
    const requested = new URLSearchParams(location.search).get('tab') as Tab | null
    return requested && ['overview', 'plans', 'notes', 'quiz', 'mistakes', 'reviews', 'report'].includes(requested) ? requested : 'overview'
  })
  const [selectedStageId, setSelectedStageId] = useState('')
  const [overview, setOverview] = useState<{ plans: any[]; notes: Note[]; attempts: Attempt[] }>({ plans: [], notes: [], attempts: [] })
  const [weekly, setWeekly] = useState<any>(null)
  const [daily, setDaily] = useState<any>(null)
  const [reviews, setReviews] = useState<{ due_count: number; reviews: Review[] }>({ due_count: 0, reviews: [] })
  const [goal, setGoal] = useState('理解当前会话主题并能独立应用')
  const [notes, setNotes] = useState<Note[]>([])
  const [quiz, setQuiz] = useState<QuizItem[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(`learningQuiz:${sessionId}`) || '[]') }
    catch { return [] }
  })
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [feedback, setFeedback] = useState<Record<number, string>>({})
  const [mistakeBook, setMistakeBook] = useState<{ count: number; items: MistakeBookItem[]; focus: string[] }>({ count: 0, items: [], focus: [] })
  const [parentReport, setParentReport] = useState<ParentReport | null>(null)
  const [mastery, setMastery] = useState<MasteryMatrix | null>(null)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState<GenerationKind | null>(null)
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; run: () => Promise<void> } | null>(null)
  const course = courseById(courseId)
  const { completed, error: progressError, load: loadProgress, toggle: toggleProgress } = useCourseProgress(username, courseId)
  const allTopics = courseTopics(course)
  const unlockedIndex = unlockedStageIndex(course, completed)
  const activeStage = course.stages[unlockedIndex]
  const selectedStage = course.stages.find((stage) => stage.id === selectedStageId) || activeStage || course.stages[course.stages.length - 1]
  const selectedStageIndex = course.stages.findIndex((stage) => stage.id === selectedStage.id)
  const selectedStageEditable = selectedStageIndex === unlockedIndex
  const selectedTopics = stageTopics(selectedStage)

  useEffect(() => { setSelectedStageId((activeStage || course.stages[course.stages.length - 1]).id) }, [courseId, unlockedIndex])

  const loadAll = async () => {
    if (!username) return
    setBusy(true); setError('')
    try {
      const user = encodeURIComponent(username)
      const [overviewData, reviewData, weeklyData, dailyData, noteData, mistakeBookData, parentReportData, masteryData] = await Promise.all([
        apiFetch<any>(`/api/learning/overview/${user}`),
        apiFetch<any>(`/api/learning/reviews/${user}`),
        apiFetch<any>(`/api/learning/weekly/${user}`),
        apiFetch<any>(`/api/learning/daily/${user}`),
        apiFetch<any>(`/api/learning/notes/${user}/${encodeURIComponent(sessionId)}`),
        apiFetch<any>(`/api/learning/mistake-book/${user}`),
        apiFetch<ParentReport>(`/api/learning/parent-report/${user}`),
        apiFetch<MasteryMatrix>(`/api/learning/mastery/${user}`),
      ])
      setOverview(overviewData); setReviews(reviewData); setWeekly(weeklyData); setDaily(dailyData); setNotes(noteData.notes || []); setMistakeBook(mistakeBookData); setParentReport(parentReportData); setMastery(masteryData)
      if (dailyData.goal) setGoal(dailyData.goal)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '读取学习数据失败') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    try { setQuiz(JSON.parse(sessionStorage.getItem(`learningQuiz:${sessionId}`) || '[]')) }
    catch { setQuiz([]) }
    void loadAll()
  }, [username, courseId, sessionId])
  const createNote = async () => {
    setGenerating('笔记'); setError('')
    try { await Promise.all([apiFetch('/api/learning/note', jsonBody({ username, session_id: sessionId, messages })), minimumAnimation()]); onNotice('学习笔记已生成'); await loadAll(); setTab('notes') }
    catch (e) { setError(e instanceof Error ? e.message : '生成失败') } finally { setGenerating(null) }
  }
  const createQuiz = async () => {
    setGenerating('练习'); setError('')
    try { const [data] = await Promise.all([apiFetch<{ quiz: QuizItem[] }>('/api/learning/quiz', jsonBody({ username, session_id: sessionId, messages })), minimumAnimation()]); setQuiz(data.quiz); sessionStorage.setItem(`learningQuiz:${sessionId}`, JSON.stringify(data.quiz)); setFeedback({}); setTab('quiz'); onNotice('已从本次 AI 回答生成 3 道练习') }
    catch (e) { setError(e instanceof Error ? e.message : '出题失败') } finally { setGenerating(null) }
  }
  const removeQuiz = (index: number) => {
    const next = quiz.filter((_, itemIndex) => itemIndex !== index)
    setQuiz(next); sessionStorage.setItem(`learningQuiz:${sessionId}`, JSON.stringify(next))
    setAnswers({}); setFeedback({})
    onNotice('练习题已删除')
  }
  const submitAnswer = async (index: number) => {
    try { const data = await apiFetch<{ feedback: string }>('/api/learning/attempt', jsonBody({ username, session_id: sessionId, question: quiz[index].question, answer: answers[index] || '' })); setFeedback((value) => ({ ...value, [index]: data.feedback })); await loadAll() }
    catch (e) { setError(e instanceof Error ? e.message : '提交失败') }
  }
  const shareLearning = async () => {
    try {
      const result = await apiFetch<{ share_path: string }>('/api/learning/share', jsonBody({
        username,
        kind: 'summary',
        title: '我的 AI 学习周报',
        content: {
          '本周亮点': parentReport?.highlights || [],
          '练习情况': parentReport ? `完成 ${parentReport.summary.practice_total} 次学习练习、提交 ${parentReport.summary.contest_submissions} 次代码，通过 ${parentReport.summary.contest_accepted} 道编程题。` : '本周还没有练习记录。',
          '需要巩固': parentReport?.focus || [],
          '家庭建议': parentReport?.suggestions || [],
        },
      }))
      const url = location.origin + result.share_path
      await navigator.clipboard?.writeText(url)
      onNotice(navigator.clipboard ? '学习成果链接已复制' : url)
    } catch (e) { setError(e instanceof Error ? e.message : '分享失败') }
  }

  if (!username) return <section className="route-view login-required"><button className="route-close login-close" type="button" onClick={onClose} aria-label="关闭学习管理"><X size={18} /></button><h1>学习管理</h1><p>登录后可保存路线、笔记、练习和复习进度。</p><button onClick={onLogin}>登录后继续</button></section>
  const currentAttempts = overview.attempts.filter((item) => item.session_id === sessionId)
  const tabs: Array<[Tab, string, number | null]> = [['overview', '概览', null], ['plans', '路线', completed.length], ['notes', '笔记', notes.length], ['quiz', '练习', currentAttempts.length], ['mistakes', '错题', mistakeBook.count], ['reviews', '复习', reviews.due_count], ['report', '家长报告', null]]

  return (
    <section className="route-view learning-view" id="main-content">
      <header className="route-view-head"><div><h1>学习管理</h1><p>{course.name} · 路线、沉淀、练习与复习</p></div><div className="route-actions"><button onClick={shareLearning}>分享周报</button><button onClick={() => { void loadAll(); void loadProgress() }}><RefreshCw size={16} />刷新</button><button className="route-close" type="button" onClick={onClose} aria-label="关闭学习管理" title="关闭"><X size={18} /></button></div></header>
      <nav className="route-tabs" aria-label="学习管理栏目">{tabs.map(([id, label, count]) => <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}{count !== null && <span>{count}</span>}</button>)}</nav>
      {(error || progressError) && <p className="route-error" role="alert">{error || progressError}</p>}
      <div className="learning-page-content" aria-busy={busy || generating !== null}>
        {generating && <LearningGeneration kind={generating} />}
        {tab === 'overview' && <div className="overview-layout">
          <div className="metric-grid"><div><strong>{weekly?.study_days || 0}</strong><span>本周学习天数</span></div><div><strong>{weekly?.queries || 0}</strong><span>本周提问</span></div><div><strong>{weekly?.practice?.accuracy || 0}%</strong><span>练习正确率</span></div><div><strong>{reviews.due_count}</strong><span>到期复习</span></div></div>
          <section className="content-section"><h2>今日概览</h2><div className="daily-goal-row"><input value={goal} onChange={(e) => setGoal(e.target.value)} /><button onClick={async () => { try { await apiFetch('/api/learning/daily/goal', jsonBody({ username, goal, completed: daily?.goal_completed || false })); onNotice('今日目标已保存') } catch (e) { setError(e instanceof Error ? e.message : '保存失败') } }}>保存目标</button></div><p>连续学习 {daily?.streak || 0} 天 · 今日提问 {daily?.today_queries || 0} 次 · 待复习 {daily?.review_count || 0} 项</p></section>
          <section className="content-section"><h2>本周建议</h2><ol>{(weekly?.suggestions || ['完成一次专注问答，并整理一篇笔记。']).map((item: string) => <li key={item}>{item}</li>)}</ol></section>
          <section className="content-section mastery-section"><div className="content-section-heading"><div><h2>知识点掌握矩阵</h2><p>路线进度、练习表现和 OJ 结果综合展示</p></div><Target size={19} /></div><div className="mastery-course-grid">{(mastery?.matrix || []).map((item) => <article key={item.course_id}><header><strong>{item.label}</strong><span>{item.route_completed}/{item.route_total} 知识点</span></header><div className="mastery-progress"><progress max="100" value={item.route_rate} /><b>{item.route_rate}%</b></div><dl><div><dt>练习正确率</dt><dd>{item.practice_total ? `${item.practice_accuracy}%` : '暂无记录'}</dd></div><div><dt>OJ 通过率</dt><dd>{item.oj_attempts ? `${item.oj_rate}%` : '暂无记录'}</dd></div></dl></article>)}</div>{mastery?.weak_points.length ? <div className="mastery-weak"><strong>需要优先巩固</strong>{mastery.weak_points.map((item) => <span key={item}>{item}</span>)}</div> : <p className="mastery-empty">完成几道练习后，这里会显示具体薄弱知识点。</p>}</section>
        </div>}
        {tab === 'plans' && <div className="course-route-layout"><nav className="course-stage-nav" aria-label="课程阶段">{course.stages.map((stage, index) => { const stageDone = isStageComplete(stage, completed); const stageLocked = index > unlockedIndex; const topicCount = stageTopics(stage).length; return <button type="button" key={stage.id} className={`${stage.id === selectedStage.id ? 'is-active' : ''} ${stageDone ? 'is-done' : ''} ${stageLocked ? 'is-locked' : ''}`} disabled={stageLocked} onClick={() => setSelectedStageId(stage.id)}><span>{stageDone ? <Check size={15} /> : stageLocked ? <Lock size={14} /> : index + 1}</span><strong>{stage.title}</strong><small>{stageCompletedCount(stage, completed)}/{topicCount} {stageLocked ? '待解锁' : stageDone ? '已完成' : '学习中'}</small></button> })}</nav><section className="content-section course-topic-panel"><div className="content-section-heading"><div><h2>{selectedStage.title}</h2><p>{selectedStage.summary}</p></div><strong className="course-progress-summary">{completed.length}/{allTopics.length}</strong></div>{selectedStage.modules.map((courseModule) => <section className="course-module-section" key={courseModule.id}><h3>{courseModule.title}</h3>{courseModule.topics.map((topic, index) => <label className={`plan-page-row ${completed.includes(topic.id) ? 'is-done' : ''}`} key={topic.id}><input type="checkbox" checked={completed.includes(topic.id)} disabled={!selectedStageEditable} onChange={async () => { try { await toggleProgress(topic.id) } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '进度更新失败') } }} /><span><strong>知识点 {index + 1} · {topic.title}</strong><small>{completed.includes(topic.id) ? '已完成' : selectedStageEditable ? '完成后勾选，进度自动保存' : isStageComplete(selectedStage, completed) ? '已完成阶段，可回看' : '完成上一阶段后解锁'}</small></span></label>)}</section>)}</section></div>}
        {tab === 'notes' && <div className="records-layout"><button className="primary-inline" onClick={createNote} disabled={busy || generating !== null || !messages.some((item) => item.role === 'assistant')}>整理当前对话为笔记</button>{notes.map((note) => <article className="note-page-card" key={note.id}><div><h2>{note.title}</h2><ReactMarkdown>{note.content}</ReactMarkdown></div><button className="danger-icon" title="删除笔记" aria-label={`删除笔记 ${note.title}`} onClick={() => setConfirmAction({ title: '删除学习笔记', message: '这篇笔记及其复习安排将被永久删除。', run: async () => { await apiFetch(`/api/learning/notes/${encodeURIComponent(username)}/${note.id}`, { method: 'DELETE' }); await loadAll() } })}><Trash2 size={15} /></button></article>)}</div>}
        {tab === 'quiz' && <div className="records-layout"><button className="primary-inline" onClick={createQuiz} disabled={busy || generating !== null || !messages.some((item) => item.role === 'assistant')}>根据本次 AI 回答生成 3 道练习</button>{quiz.map((item, index) => <article className="quiz-page-card" key={item.id}><div className="quiz-card-heading"><h2>{index + 1}. {item.question}</h2><button className="danger-icon" title="删除这道练习" aria-label={`删除练习 ${index + 1}`} onClick={() => setConfirmAction({ title: '删除练习题', message: '删除后，这道尚未提交的练习题将无法恢复。', run: async () => removeQuiz(index) })}><Trash2 size={15} /></button></div><p>{item.hint}</p><textarea value={answers[index] || ''} onChange={(e) => setAnswers((value) => ({ ...value, [index]: e.target.value }))} placeholder="写下你的答案" /><button onClick={() => submitAnswer(index)}>提交回答</button>{feedback[index] && <p className="practice-feedback">{feedback[index]}</p>}</article>)}{currentAttempts.length > 0 && <section className="content-section"><h2>当前会话练习记录</h2>{currentAttempts.map((item) => <article className="record-row attempt-row" key={item.id}><div><strong>{item.question}</strong><small>{item.is_correct ? '回答较完整' : '需要补充'} · {new Date(item.created_at).toLocaleDateString('zh-CN')}</small></div><button className="danger-icon" title="删除练习记录" aria-label={`删除练习记录 ${item.question}`} onClick={() => setConfirmAction({ title: '删除练习记录', message: '删除后，这次作答和对应复习安排将无法恢复。', run: async () => { await apiFetch(`/api/learning/attempts/${encodeURIComponent(username)}/${item.id}`, { method: 'DELETE' }); await loadAll() } })}><Trash2 size={15} /></button></article>)}</section>}</div>}
        {tab === 'mistakes' && <div className="mistake-book-layout"><section className="mistake-book-head"><div><Target size={21} /><span><h2>针对性重练</h2><p>汇总 AI 练习与周赛中尚未掌握的内容</p></span></div><strong>{mistakeBook.count}<small>待巩固</small></strong></section>{mistakeBook.items.length ? <div className="records-layout">{mistakeBook.items.map((item) => <article className="record-row mistake-book-row" key={item.id}><span className={`mistake-source is-${item.source}`}>{item.source === 'oj' ? 'OJ' : '练习'}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><div className="record-actions"><button onClick={() => location.assign(item.action_url)}>去重练<ArrowRight size={14} /></button><button onClick={async () => { await apiFetch(`/api/learning/mistake-book/${encodeURIComponent(username)}/mastered`, jsonBody({ item_id: item.id })); onNotice('已移出错题本'); await loadAll() }}><Check size={15} />已掌握</button></div></article>)}</div> : <p className="muted-empty">当前没有待巩固错题，继续保持。</p>}</div>}
        {tab === 'reviews' && <div className="records-layout">{reviews.reviews.map((item) => <article className="record-row" key={item.id}><div><strong>{item.topic}</strong><small>第 {item.round} 轮 · {new Date(item.due_at).toLocaleString('zh-CN')}</small></div><div className="record-actions"><button disabled={!item.is_due} onClick={async () => { const result = await apiFetch<{ message: string }>(`/api/learning/reviews/${encodeURIComponent(username)}/${item.id}/complete`, { method: 'POST' }); onNotice(result.message); await loadAll() }}>完成复习</button><button className="danger-icon" title="删除复习任务" aria-label={`删除复习任务 ${item.topic}`} onClick={() => setConfirmAction({ title: '删除复习任务', message: '删除后，这项复习安排将无法恢复。', run: async () => { await apiFetch(`/api/learning/reviews/${encodeURIComponent(username)}/${item.id}`, { method: 'DELETE' }); await loadAll() } })}><Trash2 size={15} /></button></div></article>)}</div>}
        {tab === 'report' && parentReport && <div className="parent-report"><header><div><p>WEEKLY LEARNING REPORT</p><h2>{parentReport.student} 的学习成长周报</h2><span>{parentReport.period.start} 至 {parentReport.period.end}</span></div><button type="button" onClick={shareLearning}><Share2 size={16} />生成分享链接</button></header><div className="parent-report-metrics"><span><strong>{parentReport.summary.study_days}</strong><small>学习天数</small></span><span><strong>{parentReport.summary.queries}</strong><small>AI 提问</small></span><span><strong>{parentReport.summary.contest_accepted}</strong><small>通过编程题</small></span><span><strong>{parentReport.summary.open_mistakes}</strong><small>待巩固</small></span></div><section><div className="parent-report-section-title"><BarChart3 size={17} /><h3>本周亮点</h3></div><ul>{parentReport.highlights.map((item) => <li key={item}>{item}</li>)}</ul></section><section><div className="parent-report-section-title"><Target size={17} /><h3>下周重点</h3></div>{parentReport.focus.length ? <div className="parent-report-focus">{parentReport.focus.map((item) => <span key={item}>{item}</span>)}</div> : <p>暂无明显薄弱项。</p>}</section><section><div className="parent-report-section-title"><Check size={17} /><h3>家庭陪伴建议</h3></div><ol>{parentReport.suggestions.map((item) => <li key={item}>{item}</li>)}</ol></section></div>}
      </div>
      <Dialog open={!!confirmAction} title={confirmAction?.title || '确认操作'} onClose={() => setConfirmAction(null)} footer={<><button onClick={() => setConfirmAction(null)}>取消</button><button className="dialog-danger" onClick={async () => { const action = confirmAction; setConfirmAction(null); if (action) { try { await action.run(); onNotice('已删除') } catch (e) { setError(e instanceof Error ? e.message : '删除失败') } } }}>确认删除</button></>}>{confirmAction?.message}</Dialog>
    </section>
  )
}
