import { BarChart3, Check, CheckCircle2, RefreshCw, Trophy, UserRoundX, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'

interface Analytics {
  contest: { id: string; title: string; problem_count: number; points: number }
  summary: { participant_count: number; submitted_count: number; unsubmitted_count: number; completion_rate: number; average_score: number }
  problems: { problem_id: string; title: string; points: number; submitted: number; solved: number; correct_rate: number }[]
  students: { username: string; score: number; auto_score: number; final_score: number | null; solved_count: number; submitted_count: number; submitted: boolean; completion_rate: number; rank: number; last_submitted_at?: string | null; manual_items: { problem_id: string; title: string; type: string; points: number; answer?: string; source?: string; status?: string; score?: number; feedback?: string }[] }[]
}

interface ContestAnalyticsProps {
  contestId: string
  username: string
}

export function ContestAnalytics({ contestId, username }: ContestAnalyticsProps) {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [draftProblemScores, setDraftProblemScores] = useState<Record<string, string>>({})
  const [savingStudent, setSavingStudent] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const next = await apiFetch<Analytics>(`/api/oj/teacher/contests/${encodeURIComponent(contestId)}/analytics?username=${encodeURIComponent(username)}`)
      setData(next)
      setDraftProblemScores(Object.fromEntries(next.students.flatMap((student) => student.manual_items.map((item) => [`${student.username}:${item.problem_id}`, item.score === undefined ? '' : String(item.score)]))))
    }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '成绩读取失败') }
    finally { setLoading(false) }
  }
  const saveProblemScore = async (student: Analytics['students'][number], item: Analytics['students'][number]['manual_items'][number]) => {
    const value = Number(draftProblemScores[`${student.username}:${item.problem_id}`])
    if (!Number.isInteger(value) || value < 0 || value > item.points) return
    setSavingStudent(`${student.username}:${item.problem_id}`)
    try {
      await apiFetch(`/api/oj/teacher/contests/${encodeURIComponent(contestId)}/grades/${encodeURIComponent(student.username)}/problems/${encodeURIComponent(item.problem_id)}?username=${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify({ score: value }) })
      await load()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '题目评分保存失败') }
    finally { setSavingStudent('') }
  }
  useEffect(() => { void load() }, [contestId, username])
  const unsubmitted = data?.students.filter((student) => !student.submitted) || []
  return <section className="contest-analytics">
    <header><div><span><BarChart3 size={18} /></span><div><strong>班级成绩汇总</strong><small>{data?.contest.title || '正在读取比赛数据'}</small></div></div><span className="contest-readonly-label">成绩看板</span></header>
    {loading && <p className="contest-analytics-state">正在统计班级成绩...</p>}
    {error && <p className="contest-create-error">{error}</p>}
    {data && <>
      <div className="contest-analytics-metrics"><article><UsersRound size={18} /><strong>{data.summary.participant_count}</strong><span>班级学生</span></article><article><CheckCircle2 size={18} /><strong>{data.summary.completion_rate}%</strong><span>平均完成率</span></article><article><Trophy size={18} /><strong>{data.summary.average_score}</strong><span>平均最终分 / 100</span></article><article><UserRoundX size={18} /><strong>{data.summary.unsubmitted_count}</strong><span>未提交</span></article></div>
      <div className="contest-analytics-grid"><section><div className="contest-analytics-title"><div><strong>班级成绩汇总</strong><span>选择、判断题自动计分；填空、简答和编程题逐题批改后生成最终分</span></div><button type="button" onClick={() => void load()}><RefreshCw size={14} />刷新</button></div><div className="contest-student-table"><div className="is-head"><span>名次</span><span>学生</span><span>客观题得分</span><span>最终分</span><span>阅卷状态</span></div>{data.students.map((student) => { const reviewStatus = !student.submitted ? '未交卷' : student.final_score !== null ? '已完成' : student.manual_items.length ? `待批改 ${student.manual_items.length} 题` : '系统已判'; const reviewTone = !student.submitted ? 'is-muted' : student.final_score !== null ? 'is-success' : student.manual_items.length ? 'is-warning' : 'is-info'; return <div key={student.username}><b>{student.rank}</b><strong>{student.username}</strong><span className="contest-score-chip">{student.submitted ? `${student.auto_score} 分` : '未交卷'}</span><em className={student.final_score === null ? 'is-pending' : 'is-final'}>{student.final_score === null ? '待生成' : `${student.final_score} / 100`}</em><span className={`contest-status-chip ${reviewTone}`}>{reviewStatus}</span>{student.manual_items.length > 0 && <details className="contest-manual-review"><summary>查看并批改主观题（{student.manual_items.length}）</summary>{student.manual_items.map((item) => <article key={item.problem_id}><header><strong>{item.title}</strong><span>{item.type === 'programming' ? '编程题' : item.type === 'fill_blank' ? '填空题' : '简答题'} · {item.points} 分</span></header><pre>{item.type === 'programming' ? (item.source || '学生尚未提交代码') : (item.answer || '学生未填写答案')}</pre><label>本题得分 <input type="number" min="0" max={item.points} value={draftProblemScores[`${student.username}:${item.problem_id}`] ?? ''} onChange={(event) => setDraftProblemScores((current) => ({ ...current, [`${student.username}:${item.problem_id}`]: event.target.value }))} placeholder={`0-${item.points}`} disabled={!student.submitted} /><button type="button" onClick={() => void saveProblemScore(student, item)} disabled={!student.submitted || savingStudent === `${student.username}:${item.problem_id}`}><Check size={13} />保存</button>{!student.submitted && <small>学生交卷后才能批改</small>}</label></article>)}</details>}</div>})}{!data.summary.participant_count && <p>班级中暂时没有学生</p>}</div></section>
        <section><div className="contest-analytics-title"><div><strong>未提交名单</strong><span>可用于课后提醒</span></div></div><div className="contest-unsubmitted-list">{unsubmitted.length ? unsubmitted.map((student) => <span key={student.username}>{student.username}</span>) : <p>所有学生都已提交</p>}</div></section></div>
      <section className="contest-problem-analysis"><div className="contest-analytics-title"><div><strong>题目正确率</strong><span>根据学生历史最高成绩统计</span></div></div>{data.problems.map((problem, index) => <article key={problem.problem_id}><span>{index + 1}</span><div><strong>{problem.title}</strong><small>{problem.solved} 人通过 · {problem.submitted} 人作答</small></div><progress max="100" value={problem.correct_rate} /><b>{problem.correct_rate}%</b></article>)}</section>
    </>}
  </section>
}
