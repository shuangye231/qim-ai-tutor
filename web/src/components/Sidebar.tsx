import { Blocks, Braces, Code2, Home, Pencil, Plus, Trash2 } from 'lucide-react'
import { courseById, courses } from '../courses'
import type { CourseId, Session } from '../types'

interface SidebarProps {
  sessions: Session[]
  activeCourse: CourseId
  activeId: string
  onCourseSelect: (courseId: CourseId) => void
  onSelect: (id: string) => void
  onNew: () => void
  onHome: () => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
}

function formatSessionTime(timestamp: number) {
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return ''

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetDay = new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const time = value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

  if (targetDay === today) return `今天 ${time}`
  if (today - targetDay === 86_400_000) return `昨天 ${time}`
  if (value.getFullYear() === now.getFullYear()) return `${value.getMonth() + 1} 月 ${value.getDate()} 日`
  return `${value.getFullYear()} 年 ${value.getMonth() + 1} 月 ${value.getDate()} 日`
}

const courseIcon = (courseId: CourseId) => courseId === 'scratch' ? <Blocks size={18} /> : courseId === 'python' ? <Braces size={18} /> : <Code2 size={18} />

export function Sidebar({ sessions, activeCourse, activeId, onCourseSelect, onSelect, onNew, onHome, onRename, onDelete }: SidebarProps) {
  const activeCourseDefinition = courseById(activeCourse)
  return (
    <aside className="left-sidebar" aria-label="会话与资料">
      <div className="sidebar-scroll">
        <button className="new-chat-button" type="button" onClick={onNew}>
          <Plus size={18} />
          新建 {activeCourseDefinition.shortName} 对话
        </button>

        <section className="sidebar-section resources-section">
          <h2>学习方向</h2>
          {courses.map((course) => <button key={course.id} type="button" className={`resource-row course-option ${course.id === activeCourse ? 'is-active' : ''}`} aria-pressed={course.id === activeCourse} onClick={() => onCourseSelect(course.id)}>
            {courseIcon(course.id)}
            <span><strong>{course.name}</strong><small>{course.description}</small></span>
          </button>)}
        </section>

        <section className="sidebar-section">
          <h2>{activeCourseDefinition.shortName} 会话</h2>
          <div className="session-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`session-row ${session.id === activeId ? 'is-active' : ''}`}
              >
                <button type="button" className="session-main" onClick={() => onSelect(session.id)} aria-current={session.id === activeId ? 'page' : undefined}>
                  <span className="session-title">{session.title}</span>
                </button>
                <span className="session-meta">
                  <time dateTime={new Date(session.updatedAt).toISOString()}>{formatSessionTime(session.updatedAt)}</time>
                  <span className="session-actions">
                    <button type="button" title="重命名" aria-label="重命名会话" onClick={() => onRename(session.id)}><Pencil size={14} /></button>
                    <button type="button" title="删除" aria-label="删除会话" onClick={() => onDelete(session.id)}><Trash2 size={14} /></button>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

      </div>

      <div className="sidebar-tools" aria-label="侧栏工具">
        <button type="button" onClick={onHome} title="返回平台主页" aria-label="返回平台主页"><Home size={17} /></button>
      </div>
    </aside>
  )
}
