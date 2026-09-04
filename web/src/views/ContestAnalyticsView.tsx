import { ArrowLeft, BarChart3 } from 'lucide-react'
import { ContestAnalytics } from '../components/ContestAnalytics'

export function ContestAnalyticsView({ contestId, username, onClose }: { contestId: string; username: string; onClose: () => void }) {
  if (!contestId) return <main className="contest-view contest-analytics-page" id="main-content"><header className="contest-analytics-page-head"><button type="button" onClick={onClose}><ArrowLeft size={17} />返回比赛</button><div><p><BarChart3 size={15} /> 教师端 · 成绩管理</p><h1>成绩管理</h1><span>没有找到要查看的比赛，请从比赛详情进入成绩页。</span></div></header></main>
  return <main className="contest-view contest-analytics-page" id="main-content">
    <header className="contest-analytics-page-head"><button type="button" onClick={onClose}><ArrowLeft size={17} />返回比赛</button><div><p><BarChart3 size={15} /> 教师端 · 成绩管理</p><h1>成绩管理</h1><span>客观题自动判分，主观题由老师逐题批改后生成最终成绩</span></div></header>
    <ContestAnalytics contestId={contestId} username={username} />
  </main>
}
