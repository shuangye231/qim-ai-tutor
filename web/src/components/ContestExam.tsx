import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, Check, CheckCircle2, Clock3, Code2, Save, Send, ShieldCheck } from 'lucide-react'
import { apiFetch, jsonBody } from '../api/client'
import type { OjProblem } from '../data/ojProblems'

type Attempt = {
  id: string
  contest_id: string
  username: string
  status: 'in_progress' | 'submitted' | 'auto_submitted'
  answers: Record<string, string>
  marked: string[]
  started_at: string
  expires_at: string
  submitted_at?: string | null
  score: number
  total_score: number
  final_score: number | null
  manual_problem_count: number
}

interface ContestExamProps {
  contestId: string
  title: string
  duration: string
  username: string
  problems: OjProblem[]
  onProgramming: (problemId: string, contestId: string) => void
  onExit: () => void
  preview?: boolean
}

const typeName = (problem: OjProblem) => problem.type === 'single_choice' ? '选择题' : problem.type === 'true_false' ? '判断题' : problem.type === 'fill_blank' ? '填空题' : problem.type === 'short_answer' ? '简答题' : '编程题'

export function ContestExam({ contestId, title, duration, username, problems, onProgramming, onExit, preview = false }: ContestExamProps) {
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [programmingSolved, setProgrammingSolved] = useState<string[]>([])
  const [programmingSubmitted, setProgrammingSubmitted] = useState<string[]>([])
  const hydrated = useRef(false)
  const lastSaved = useRef('')
  const current = problems[currentIndex]

  useEffect(() => {
    if (preview) {
      const now = new Date()
      const expiresAt = new Date(now.getTime() + Math.max(15, Number.parseInt(duration, 10) || 60) * 60_000)
      setAttempt({ id: `preview-${contestId}`, contest_id: contestId, username, status: 'in_progress', answers: {}, marked: [], started_at: now.toISOString(), expires_at: expiresAt.toISOString(), score: 0, total_score: problems.reduce((sum, problem) => sum + problem.points, 0), final_score: null, manual_problem_count: problems.filter((problem) => problem.type === 'fill_blank' || problem.type === 'short_answer' || !problem.type || problem.type === 'programming').length })
      hydrated.current = true
      return
    }
    Promise.all([
      apiFetch<{ attempt: Attempt }>(`/api/contests/${encodeURIComponent(contestId)}/attempts/start`, jsonBody({ username })),
      apiFetch<{ solved_problem_ids: string[]; submitted_problem_ids?: string[] }>(`/api/oj/progress?username=${encodeURIComponent(username)}&contest_id=${encodeURIComponent(contestId)}`).catch(() => ({ solved_problem_ids: [], submitted_problem_ids: [] })),
    ]).then(([attemptResult, progress]) => {
      lastSaved.current = JSON.stringify([attemptResult.attempt.answers, attemptResult.attempt.marked])
      setAttempt(attemptResult.attempt)
      setProgrammingSolved(progress.solved_problem_ids)
      setProgrammingSubmitted(progress.submitted_problem_ids || progress.solved_problem_ids)
      hydrated.current = true
    }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '无法进入考试'))
  }, [contestId, duration, preview, problems, username])

  useEffect(() => {
    if (!attempt || attempt.status !== 'in_progress') return
    const update = () => setSecondsLeft(Math.max(0, Math.floor((new Date(attempt.expires_at).getTime() - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [attempt])

  useEffect(() => {
    if (preview || !attempt || attempt.status !== 'in_progress' || !hydrated.current) return
    const signature = JSON.stringify([attempt.answers, attempt.marked])
    if (signature === lastSaved.current) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      apiFetch<{ attempt: Attempt }>(`/api/contests/${encodeURIComponent(contestId)}/attempt`, { ...jsonBody({ username, answers: attempt.answers, marked: attempt.marked }), method: 'PUT' })
        .then((result) => { lastSaved.current = JSON.stringify([result.attempt.answers, result.attempt.marked]); setAttempt(result.attempt); setSaveState('saved') })
        .catch(() => setSaveState('error'))
    }, 550)
    return () => window.clearTimeout(timer)
  }, [JSON.stringify(attempt?.answers), JSON.stringify(attempt?.marked), attempt?.status, contestId, preview, username])

  useEffect(() => {
    if (!preview && attempt?.status === 'in_progress' && attempt.expires_at && Date.now() >= new Date(attempt.expires_at).getTime()) void submit()
  }, [preview, secondsLeft])

  const answered = useMemo(() => new Set([
    ...Object.keys(attempt?.answers || {}).filter((id) => attempt?.answers[id] !== ''),
    ...programmingSolved,
    ...programmingSubmitted,
  ]), [attempt?.answers, programmingSolved, programmingSubmitted])
  const unanswered = problems.filter((problem) => !answered.has(problem.id)).length

  const choose = (value: string) => {
    if (!attempt || attempt.status !== 'in_progress') return
    setAttempt({ ...attempt, answers: { ...attempt.answers, [current.id]: value } })
  }

  const toggleMarked = () => {
    if (!attempt || attempt.status !== 'in_progress') return
    const marked = attempt.marked.includes(current.id) ? attempt.marked.filter((id) => id !== current.id) : [...attempt.marked, current.id]
    setAttempt({ ...attempt, marked })
  }

  const submit = async () => {
    if (!attempt || attempt.status !== 'in_progress') return
    setError('')
    try {
      await apiFetch(`/api/contests/${encodeURIComponent(contestId)}/attempt`, { ...jsonBody({ username, answers: attempt.answers, marked: attempt.marked }), method: 'PUT' })
      const result = await apiFetch<{ attempt: Attempt }>(`/api/contests/${encodeURIComponent(contestId)}/attempt/submit`, jsonBody({ username }))
      setAttempt(result.attempt)
      setConfirmSubmit(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '交卷失败，请重试')
    }
  }

  const clock = `${String(Math.floor(secondsLeft / 3600)).padStart(2, '0')}:${String(Math.floor(secondsLeft % 3600 / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
  if (error && !attempt) return <section className="exam-load-error"><AlertTriangle size={25} /><strong>无法进入考试</strong><p>{error}</p><button type="button" onClick={onExit}>返回挑战大厅</button></section>
  if (!attempt) return <section className="exam-loading"><span className="answer-loading-dot" /><p>正在布置像素考场...</p></section>
  if (attempt.status !== 'in_progress') {
    const waitingForGrade = attempt.final_score === null && attempt.manual_problem_count > 0
    const displayedScore = attempt.final_score ?? (!waitingForGrade ? attempt.score : null)
    return <section className="exam-result"><span className="exam-result-star">★</span><p>{waitingForGrade ? '试卷已提交，客观题已记录，简答题和编程题等待老师批改' : attempt.status === 'auto_submitted' ? '考试时间已到，系统已自动交卷' : '试卷已成功提交'}</p><h2>{displayedScore === null ? '待批改' : displayedScore}<small>{displayedScore === null ? '' : ` / ${attempt.total_score} 分`}</small></h2><div><span><b>{answered.size}</b>已作答</span><span><b>{problems.length}</b>总题数</span></div><button type="button" onClick={onExit}><ArrowLeft size={16} />返回挑战大厅</button></section>
  }

  return <section className="contest-exam-shell">
    <header className="contest-exam-head">
      <button type="button" onClick={onExit} aria-label="暂离考试"><ArrowLeft size={18} /></button>
      <div><span>{preview ? '启码月赛 · 教师预览' : '启码月赛 · 正式考试'}</span><strong>{title}</strong></div>
      {preview ? <div className="exam-save-state is-saved"><ShieldCheck size={14} />题型预览模式</div> : <div className={`exam-save-state is-${saveState}`}><Save size={14} />{saveState === 'saving' ? '正在保存' : saveState === 'error' ? '保存失败' : '已自动保存'}</div>}
      <div className={`exam-countdown ${!preview && secondsLeft < 300 ? 'is-urgent' : ''}`}><Clock3 size={17} /><span>{preview ? '考试时长' : '剩余时间'}</span><b>{preview ? duration : clock}</b></div>
    </header>
    <div className="contest-exam-body">
      <aside className="exam-answer-sheet">
        <div className="exam-sheet-title"><ShieldCheck size={18} /><span><strong>答题卡</strong><small>{answered.size}/{problems.length} 已作答</small></span></div>
        <div className="exam-progress"><i style={{ width: `${problems.length ? answered.size / problems.length * 100 : 0}%` }} /></div>
        <div className="exam-question-grid">{problems.map((problem, index) => <button type="button" key={problem.id} className={`${index === currentIndex ? 'is-current' : ''} ${answered.has(problem.id) ? 'is-answered' : ''} ${attempt.marked.includes(problem.id) ? 'is-marked' : ''}`} onClick={() => setCurrentIndex(index)}>{index + 1}</button>)}</div>
        <div className="exam-sheet-legend"><span><i className="is-current" />当前</span><span><i className="is-answered" />已答</span><span><i className="is-marked" />标记</span><span><i />未答</span></div>
        <div className="exam-sheet-summary"><span>客观题<b>{problems.filter((p) => p.type === 'single_choice' || p.type === 'true_false').length}</b></span><span>待批题<b>{problems.filter((p) => p.type === 'fill_blank' || p.type === 'short_answer' || !p.type || p.type === 'programming').length}</b></span></div>
        {preview ? <button type="button" className="exam-submit" onClick={onExit}><ArrowLeft size={16} />结束预览</button> : <button type="button" className="exam-submit" onClick={() => setConfirmSubmit(true)}><Send size={16} />交卷</button>}
      </aside>
      <main className="exam-question-panel">
        <div className="exam-question-meta"><span>第 {currentIndex + 1} 题 / 共 {problems.length} 题</span><i>{typeName(current)}</i><b>{current.points} 分</b></div>
        <h1>{current.title}</h1>
        <p className="exam-question-description">{current.description}</p>
        {current.type === 'single_choice' && <div className="exam-options">{(current.options || []).map((option) => <button type="button" key={option.key} className={attempt.answers[current.id] === option.key ? 'is-selected' : ''} onClick={() => choose(option.key)}><b>{option.key}</b><span>{option.text}</span>{attempt.answers[current.id] === option.key && <Check size={17} />}</button>)}</div>}
        {current.type === 'true_false' && <div className="exam-boolean"><button type="button" className={attempt.answers[current.id] === 'true' ? 'is-selected' : ''} onClick={() => choose('true')}><CheckCircle2 size={22} /><span><b>正确</b>这段描述是正确的</span></button><button type="button" className={attempt.answers[current.id] === 'false' ? 'is-selected' : ''} onClick={() => choose('false')}><AlertTriangle size={22} /><span><b>错误</b>这段描述是不正确的</span></button></div>}
        {(current.type === 'fill_blank' || current.type === 'short_answer') && <label className="exam-short-answer"><span>{current.type === 'fill_blank' ? '填写答案' : '简答作答'}</span><textarea value={attempt.answers[current.id] || ''} onChange={(event) => choose(event.target.value)} placeholder={current.type === 'fill_blank' ? '请填写答案，提交后由老师批改' : '请写下你的解答，提交后由老师批改'} maxLength={1000} /></label>}
        {(!current.type || current.type === 'programming') && <div className="exam-programming-callout"><Code2 size={31} /><div><strong>使用启码编程系统作答</strong><p>进入代码编辑器完成作品，提交后返回试卷，由老师人工评分。</p>{programmingSolved.includes(current.id) ? <span><CheckCircle2 size={15} />本题已通过</span> : programmingSubmitted.includes(current.id) && <span><CheckCircle2 size={15} />作品已提交，等待评分</span>}</div><button type="button" onClick={() => onProgramming(current.id, contestId)}>进入编程答题<ArrowRight size={16} /></button></div>}
        <footer className="exam-question-actions">{preview ? <span /> : <button type="button" className={attempt.marked.includes(current.id) ? 'is-marked' : ''} onClick={toggleMarked}><Bookmark size={15} />{attempt.marked.includes(current.id) ? '取消标记' : '标记本题'}</button>}<span /><button type="button" disabled={currentIndex === 0} onClick={() => setCurrentIndex((value) => value - 1)}><ArrowLeft size={15} />上一题</button><button type="button" className="is-next" disabled={currentIndex === problems.length - 1} onClick={() => setCurrentIndex((value) => value + 1)}>下一题<ArrowRight size={15} /></button></footer>
      </main>
    </div>
    {confirmSubmit && <div className="exam-confirm-backdrop" role="presentation"><section className="exam-confirm" role="dialog" aria-modal="true" aria-labelledby="exam-confirm-title"><span><AlertTriangle size={24} /></span><h2 id="exam-confirm-title">确认交卷？</h2><p>{unanswered ? `还有 ${unanswered} 道题未作答，交卷后不能继续修改。` : '所有题目均已作答，交卷后不能继续修改。'}</p><div><button type="button" onClick={() => setConfirmSubmit(false)}>继续检查</button><button type="button" className="is-primary" onClick={() => void submit()}>确认交卷</button></div></section></div>}
  </section>
}
