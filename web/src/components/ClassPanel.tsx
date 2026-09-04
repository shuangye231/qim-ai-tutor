import { Plus, RefreshCw, UsersRound, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiFetch, jsonBody } from '../api/client'

export interface TeachingClass {
  id: string
  name: string
  invite_code: string
  member_count: number
  teacher: string
  announcement?: string
  avatar_url?: string
}

interface ClassPanelProps {
  username: string
  role: string
}

export function ClassPanel({ username, role }: ClassPanelProps) {
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).get('classes') === '1')
  const [classes, setClasses] = useState<TeachingClass[]>([])
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    try {
      const result = await apiFetch<{ classes: TeachingClass[] }>(`/api/classes?username=${encodeURIComponent(username)}`)
      setClasses(result.classes)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '班级读取失败') }
  }
  useEffect(() => { if (open) void load() }, [open, username])
  const create = async () => {
    if (!name.trim()) return setError('请填写班级名称')
    setBusy(true); setError('')
    try { const result = await apiFetch<{ class: TeachingClass }>('/api/teacher/classes', jsonBody({ username, name })); setClasses((current) => [result.class, ...current]); setName('') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '班级创建失败') }
    finally { setBusy(false) }
  }
  const join = async () => {
    setBusy(true); setError('')
    try { const result = await apiFetch<{ class: TeachingClass }>('/api/classes/join', jsonBody({ username, invite_code: inviteCode })); setClasses((current) => [result.class, ...current.filter((item) => item.id !== result.class.id)]); setInviteCode('') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '加入班级失败') }
    finally { setBusy(false) }
  }
  return <section className={`class-panel ${open ? 'is-open' : ''}`}>
    <button type="button" className="class-panel-toggle" onClick={() => setOpen((value) => !value)}><UsersRound size={16} />我的班级</button>
    {open && <div className="class-panel-body"><header><div><strong>{role === 'user' ? '我的学习班级' : '班级管理'}</strong><span>{role === 'user' ? '加入老师创建的班级后即可查看定向周赛' : '创建班级并把邀请码发给学生'}</span></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭"><X size={16} /></button></header>
      {role === 'user' ? <div className="class-join-form"><input value={inviteCode} maxLength={6} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="输入 6 位邀请码" /><button type="button" disabled={busy || inviteCode.length !== 6} onClick={() => void join()}><UserPlus size={15} />加入班级</button></div> : <div className="class-create-form"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：Python 基础班" /><button type="button" disabled={busy} onClick={() => void create()}><Plus size={15} />创建班级</button></div>}
      {error && <p className="class-panel-error">{error}</p>}
      <div className="class-list">{classes.length ? classes.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{item.member_count} 名学生</small></div>{role === 'user' ? <span>任课老师：{item.teacher}</span> : <code>{item.invite_code}</code>}</article>) : <p className="class-empty">还没有班级记录</p>}</div>
      <button type="button" className="class-refresh" onClick={() => void load()}><RefreshCw size={14} />刷新</button>
    </div>}
  </section>
}
