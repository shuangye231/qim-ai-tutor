import { ArrowRight, BookOpenCheck, Bot, Building2, CalendarCheck, Code2, Flame, GraduationCap, Sparkles, Star, Trophy, UsersRound } from 'lucide-react'
import { useEffect, useState, type PointerEvent } from 'react'
import { apiFetch } from '../api/client'
import { ojProblems } from '../data/ojProblems'

interface HomeViewProps {
  username: string
  role: string
  onStudy: () => void
  onCourseware: () => void
  onContest: () => void
  onOj: () => void
  onClasses: () => void
  onAssignments: () => void
}

const plannedModules = [
  { icon: UsersRound, title: '班级空间', detail: '通知、交流与班级协作' },
  { icon: BookOpenCheck, title: '作业中心', detail: '布置、完成与智能批改' },
  { icon: Code2, title: 'OJ 题库', detail: '在线练习与代码评测' },
  { icon: Trophy, title: '编程竞赛', detail: '周赛、月赛与成长排行' },
]

type DailyOverview = { streak: number; goal: string; goal_completed: boolean }
type AssignmentOverview = { submission?: { status: string } }
type ContestOverview = { id: string; title: string; status: 'draft' | 'published'; created_at: string }
type ClassOverview = { id: string }

type HomeOverview = {
  streak: number
  goal: string
  goalCompleted: boolean
  ojPoints: number
  assignments: number
  classes: number
  contests: number
  latestContest: string
}

const emptyOverview: HomeOverview = {
  streak: 0,
  goal: '今天完成一次专注学习',
  goalCompleted: false,
  ojPoints: 0,
  assignments: 0,
  classes: 0,
  contests: 0,
  latestContest: '',
}

export function HomeView({ username, role, onStudy, onCourseware, onContest, onOj, onClasses, onAssignments }: HomeViewProps) {
  const isLearner = role === 'user'
  const [overview, setOverview] = useState<HomeOverview>(emptyOverview)
  const [overviewLoading, setOverviewLoading] = useState(true)

  useEffect(() => {
    let active = true
    setOverviewLoading(true)

    const dailyRequest = isLearner
      ? apiFetch<DailyOverview>(`/api/learning/daily/${encodeURIComponent(username)}`).catch(() => null)
      : Promise.resolve(null)
    const classesRequest = apiFetch<{ classes: ClassOverview[] }>(`/api/classes?username=${encodeURIComponent(username)}`).catch(() => ({ classes: [] }))
    const contestsRequest = apiFetch<{ contests: ContestOverview[] }>(isLearner ? '/api/contests' : `/api/teacher/contests?username=${encodeURIComponent(username)}`).catch(() => ({ contests: [] }))

    Promise.all([
      dailyRequest,
      classesRequest,
      apiFetch<{ assignments: AssignmentOverview[] }>(`/api/assignments?username=${encodeURIComponent(username)}`).catch(() => ({ assignments: [] })),
      contestsRequest,
    ]).then(([daily, classData, assignmentData, contestData]) => {
      if (!active) return
      const published = contestData.contests.filter((contest) => contest.status === 'published')
      const latestContest = [...published].sort((left, right) => right.created_at.localeCompare(left.created_at))[0]
      let solvedIds: string[] = []
      if (isLearner) {
        try {
          const saved = JSON.parse(localStorage.getItem(`ai-tutor-oj-solved:${username}`) || '[]')
          if (Array.isArray(saved)) solvedIds = saved.filter((id): id is string => typeof id === 'string')
        } catch {
          solvedIds = []
        }
      }
      const solved = new Set(solvedIds)

      setOverview({
        streak: daily?.streak || 0,
        goal: daily?.goal || (isLearner ? emptyOverview.goal : '检查班级作业与周赛'),
        goalCompleted: daily?.goal_completed || false,
        ojPoints: ojProblems.filter((problem) => solved.has(problem.id)).reduce((total, problem) => total + problem.points, 0),
        assignments: isLearner ? assignmentData.assignments.filter((assignment) => assignment.submission?.status !== 'submitted').length : assignmentData.assignments.length,
        classes: classData.classes.length,
        contests: published.length,
        latestContest: latestContest?.title || '',
      })
      setOverviewLoading(false)
    })

    return () => { active = false }
  }, [isLearner, username])

  const spotlight = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
  }

  return (
    <main className="home-view" id="main-content">
      <section className="home-hero">
        <div className="home-cloud home-cloud-one" aria-hidden="true" />
        <div className="home-cloud home-cloud-two" aria-hidden="true" />
        <div className="home-leaves" aria-hidden="true"><i /><i /><i /></div>
        <div className="home-hero-inner">
          <p className="home-kicker"><Sparkles size={15} /> 今日冒险日志</p>
          <h1>欢迎回来，{username}</h1>
          <p className="home-lead">选择一处学习空间，继续今天的编程冒险。</p>
          <div className="home-hero-actions">
            <button type="button" className="home-primary-action" onClick={onStudy}><Bot size={18} />进入单人学习<ArrowRight size={18} /></button>
          </div>
        </div>
        <div className="home-quest-board"><span>今日目标</span><strong>{overview.goalCompleted ? '今日目标已完成' : overview.goal}</strong><small>{isLearner ? '完成目标，继续积累学习成长' : '及时查看班级与教学任务'}</small></div>
      </section>

      <section className="home-modules" aria-labelledby="home-modules-title">
        <div className="home-growth-strip" aria-busy={overviewLoading}>
          <button type="button" className="home-stat-card" onPointerMove={spotlight} onClick={isLearner ? onStudy : onClasses}>
            {isLearner ? <Flame size={20} /> : <UsersRound size={20} />}
            <span><strong>{overviewLoading ? '—' : isLearner ? `${overview.streak} 天` : `${overview.classes} 个`}</strong><small>{isLearner ? '连续学习' : '管理中的班级'}</small></span>
          </button>
          <button type="button" className="home-stat-card" onPointerMove={spotlight} onClick={isLearner ? onOj : onAssignments}>
            {isLearner ? <Star size={20} /> : <BookOpenCheck size={20} />}
            <span><strong>{overviewLoading ? '—' : isLearner ? overview.ojPoints : `${overview.assignments} 份`}</strong><small>{isLearner ? 'OJ 成长积分' : '已布置作业'}</small></span>
          </button>
          <button type="button" className="home-stat-card" onPointerMove={spotlight} onClick={isLearner ? onAssignments : onContest}>
            {isLearner ? <CalendarCheck size={20} /> : <Trophy size={20} />}
            <span><strong>{overviewLoading ? '—' : `${isLearner ? overview.assignments : overview.contests} 项`}</strong><small>{isLearner ? '待完成作业' : '已发布周赛'}</small></span>
          </button>
          <button type="button" className="home-contest-card" onPointerMove={spotlight} onClick={onContest}><Trophy size={20} /><span><strong>{overview.latestContest || '本周挑战'}</strong><small>{overviewLoading ? '正在读取挑战…' : overview.latestContest ? (isLearner ? '老师发布的挑战等待出发' : '查看最近发布的周赛') : '暂无已发布挑战'}</small></span><ArrowRight size={16} /></button>
        </div>
        <div className="home-section-head">
          <div><p>LEARNING MAP</p><h2 id="home-modules-title">选择学习空间</h2></div>
          <span>当前开放 6 个核心模块</span>
        </div>
        <div className="home-module-grid">
          <button type="button" className="home-module-card is-live" onPointerMove={spotlight} onClick={onStudy}>
            <span className="home-module-icon"><GraduationCap size={26} /></span>
            <span className="home-module-copy"><b>单人学习</b><small>AI 导师、学习路线与个性化练习</small></span>
            <span className="home-module-state">立即进入 <ArrowRight size={16} /></span>
          </button>
          <button type="button" className="home-module-card is-live" onPointerMove={spotlight} onClick={onCourseware}>
            <span className="home-module-icon"><Building2 size={26} /></span>
            <span className="home-module-copy"><b>机构课程</b><small>{isLearner ? '查看老师发布的课件和学习资料' : '上传和管理机构课程资料'}</small></span>
            <span className="home-module-state">{isLearner ? <>查看课程 <ArrowRight size={16} /></> : <>管理课件 <ArrowRight size={16} /></>}</span>
          </button>
          {plannedModules.map(({ icon: Icon, title, detail }) => {
            const action = Icon === Trophy ? onContest : Icon === Code2 ? onOj : Icon === BookOpenCheck ? onAssignments : Icon === UsersRound ? onClasses : undefined
            return <button type="button" className={`home-module-card ${action ? 'is-live contest-module-card' : 'is-planned'}`} onPointerMove={spotlight} disabled={!action} onClick={action} key={title}>
              <span className="home-module-icon"><Icon size={25} /></span>
              <span className="home-module-copy"><b>{Icon === UsersRound && !isLearner ? '班级管理' : title}</b><small>{Icon === UsersRound && !isLearner ? '创建班级、查看邀请码与学生人数' : detail}</small></span>
              <span className="home-module-state">{action ? <>{Icon === UsersRound ? (isLearner ? '进入班级' : '管理班级') : '立即进入'} <ArrowRight size={16} /></> : '规划中'}</span>
            </button>
          })}
        </div>
      </section>
    </main>
  )
}
