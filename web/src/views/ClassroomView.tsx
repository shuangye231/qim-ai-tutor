import { Archive, ArrowLeft, Bell, Camera, ChevronRight, Copy, FileArchive, ImagePlus, LogOut, Megaphone, MessageCircle, Plus, RefreshCw, Search, Send, Settings2, SmilePlus, UserMinus, UsersRound, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, jsonBody } from '../api/client'
import type { TeachingClass } from '../components/ClassPanel'
import { Dialog } from '../components/Dialog'
import { AvatarContent } from '../components/AvatarContent'

type ClassMessage = { id: string; class_id: string; username: string; recipient?: string; content: string; kind: 'message' | 'notice' | 'emoji'; media_url?: string | null; media_name?: string | null; media_type?: 'image' | 'video' | 'file' | 'emoji' | null; created_at: string }
type ClassMember = { username: string; role: string; joined_at: string; muted: boolean; avatar_url?: string }

interface ClassroomViewProps { username: string; role: string }

const CLASSROOM_EMOJIS = '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🙈 🙉 🙊 💋 💯 💥 💫 💦 💨 🕳️ 💣 💬 👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✍️ 👏 🙌 👐 🤝 💪 🖕 🙏 💅 👀 👁️ 👄 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ✨ ⭐ 🌟 💫 🔥 🎉 🎊 🎈 🎁 🚀 🍀 🌈 ☀️ 🌙 ⚡ 💡 📚 🏆 🥇 🎯 🎵 🎶 🎮 🧩 🌱 🌻 🌸 🍎 🍉 🍓 🍔 🍕 🍰 ☕ 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦄 🐝 🦋 🐞 🐢 🐳'.split(' ')
const RECENT_EMOJI_KEY = 'classroomRecentEmojis'
const CLASSROOM_FILE_ACCEPT = '.zip,.rar,.7z,.tar,.gz,.bz2,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.md,.txt,.py,.c,.cpp,.java,.js,.ts,.json,application/zip,application/x-rar-compressed,application/pdf'

export function ClassroomView({ username, role }: ClassroomViewProps) {
  const [classes, setClasses] = useState<TeachingClass[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [members, setMembers] = useState<ClassMember[]>([])
  const [messages, setMessages] = useState<ClassMessage[]>([])
  const [privateMessages, setPrivateMessages] = useState<ClassMessage[]>([])
  const [privatePeer, setPrivatePeer] = useState('')
  const [chatMode, setChatMode] = useState<'group' | 'private'>('group')
  const [draft, setDraft] = useState('')
  const [privateDraft, setPrivateDraft] = useState('')
  const [className, setClassName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [noticeMode, setNoticeMode] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [manageName, setManageName] = useState('')
  const [manageAnnouncement, setManageAnnouncement] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [manageStatus, setManageStatus] = useState('')
  const [manageBusy, setManageBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [recentEmojis, setRecentEmojis] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const documentFileRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<number | null>(null)
  const groupAvatarRef = useRef<HTMLInputElement>(null)
  const selected = useMemo(() => classes.find((item) => item.id === selectedId), [classes, selectedId])
  const currentMember = useMemo(() => members.find((item) => item.username === username), [members, username])
  const isMuted = role !== 'teacher' && !!currentMember?.muted
  const filteredMembers = useMemo(() => members.filter((item) => item.username.toLowerCase().includes(memberQuery.trim().toLowerCase())), [members, memberQuery])
  const requestedParams = useMemo(() => new URLSearchParams(location.search), [])
  const requestedClassId = requestedParams.get('class') || ''
  const requestedPrompt = requestedParams.get('ask') || ''

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_EMOJI_KEY) || '[]')
      if (Array.isArray(saved)) setRecentEmojis(saved.filter((item): item is string => typeof item === 'string').slice(0, 10))
    } catch { /* ignore malformed local preferences */ }
  }, [])

  const loadClasses = async () => {
    try {
      const result = await apiFetch<{ classes: TeachingClass[] }>(`/api/classes?username=${encodeURIComponent(username)}`)
      setClasses(result.classes)
      setSelectedId((current) => current || requestedClassId || result.classes[0]?.id || '')
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '班级读取失败') }
  }

  const loadChat = async () => {
    if (!selectedId) return
    try {
      const result = await apiFetch<{ members: ClassMember[]; messages: ClassMessage[] }>(`/api/classes/${encodeURIComponent(selectedId)}/chat?username=${encodeURIComponent(username)}`)
      setMembers(result.members); setMessages(result.messages)
      if (requestedPrompt && role !== 'teacher' && !privatePeer) {
        const teacher = result.members.find((member) => member.role === 'teacher')
        if (teacher) { setPrivatePeer(teacher.username); setChatMode('private'); setPrivateDraft(requestedPrompt) }
      }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '群聊读取失败') }
  }

  useEffect(() => { void loadClasses() }, [username])
  const loadDirect = async () => {
    if (!selectedId || !privatePeer) return
    try {
      const result = await apiFetch<{ messages: ClassMessage[] }>(`/api/classes/${encodeURIComponent(selectedId)}/direct/${encodeURIComponent(privatePeer)}?username=${encodeURIComponent(username)}`)
      setPrivateMessages(result.messages)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '私聊读取失败') }
  }

  useEffect(() => {
    void loadChat()
    if (!selectedId) return
    const timer = window.setInterval(() => void (chatMode === 'private' ? loadDirect() : loadChat()), 8000)
    return () => window.clearInterval(timer)
  }, [selectedId, username, chatMode, privatePeer])
  useEffect(() => { setManageOpen(false); setConfirmRemove(''); setConfirmLeave(false); setConfirmArchive(false); setChatMode('group'); setPrivatePeer(''); setEmojiOpen(false) }, [selectedId])

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 1000)
  }

  const openPrivateChat = (member: ClassMember) => {
    if (member.username === username) return
    setPrivatePeer(member.username); setChatMode('private'); setPrivateDraft(''); setEmojiOpen(false)
  }

  const closePrivateChat = () => { setChatMode('group'); setPrivatePeer(''); setPrivateMessages([]); setEmojiOpen(false) }

  const createClass = async () => {
    if (!className.trim()) return showToast('请填写班级名称')
    setBusy(true); setError('')
    try { const result = await apiFetch<{ class: TeachingClass }>('/api/teacher/classes', jsonBody({ username, name: className })); setClasses((current) => [result.class, ...current]); setSelectedId(result.class.id); setClassName('') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '班级创建失败') }
    finally { setBusy(false) }
  }

  const joinClass = async () => {
    if (inviteCode.trim().length !== 6) return showToast('请输入 6 位邀请码')
    setBusy(true); setError('')
    try { const result = await apiFetch<{ class: TeachingClass }>('/api/classes/join', jsonBody({ username, invite_code: inviteCode })); setClasses((current) => [result.class, ...current.filter((item) => item.id !== result.class.id)]); setSelectedId(result.class.id); setInviteCode('') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '加入班级失败') }
    finally { setBusy(false) }
  }

  const sendMessage = async () => {
    const activeDraft = chatMode === 'private' ? privateDraft : draft
    if (!selectedId || !activeDraft.trim()) return
    if (isMuted) return setError('你已被老师禁言，暂时不能发送消息')
    setBusy(true); setError('')
    try {
      const result = chatMode === 'private'
        ? await apiFetch<{ message: ClassMessage }>(`/api/classes/${encodeURIComponent(selectedId)}/direct/${encodeURIComponent(privatePeer)}`, jsonBody({ username, content: activeDraft }))
        : await apiFetch<{ message: ClassMessage }>(`/api/classes/${encodeURIComponent(selectedId)}/chat`, jsonBody({ username, content: activeDraft, kind: noticeMode ? 'notice' : 'message' }))
      if (chatMode === 'private') { setPrivateMessages((current) => [...current, result.message]); setPrivateDraft('') } else { setMessages((current) => [...current, result.message]); setDraft(''); setNoticeMode(false) }
    }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '消息发送失败') }
    finally { setBusy(false) }
  }

  const sendMedia = async (file: File) => {
    if (!selectedId) return
    if (isMuted) return setError('你已被老师禁言，暂时不能发送文件')
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const isDocument = !isImage && !isVideo
    if (isDocument && !CLASSROOM_FILE_ACCEPT.split(',').some((item) => item.startsWith('.') && file.name.toLowerCase().endsWith(item))) return setError('请选择支持的图片、视频、文档或压缩包')
    if (file.size > (isImage ? 15 : 100) * 1024 * 1024) return setError(isImage ? '图片不能超过 15MB' : '文件不能超过 100MB')
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('username', username); form.append('content', (chatMode === 'private' ? privateDraft : draft).trim()); form.append('file', file)
      const result = chatMode === 'private'
        ? await apiFetch<{ message: ClassMessage }>(`/api/classes/${encodeURIComponent(selectedId)}/direct/${encodeURIComponent(privatePeer)}/media`, { method: 'POST', body: form })
        : await apiFetch<{ message: ClassMessage }>(`/api/classes/${encodeURIComponent(selectedId)}/media`, { method: 'POST', body: form })
      if (chatMode === 'private') { setPrivateMessages((current) => [...current, result.message]); setPrivateDraft('') } else { setMessages((current) => [...current, result.message]); setDraft('') }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '文件上传失败') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; if (documentFileRef.current) documentFileRef.current.value = '' }
  }

  const sendEmoji = async (emoji: string) => {
    if (chatMode === 'private') setPrivateDraft((value) => `${value}${emoji}`)
    else setDraft((value) => `${value}${emoji}`)
    setRecentEmojis((current) => {
      const next = [emoji, ...current.filter((item) => item !== emoji)].slice(0, 10)
      localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(next))
      return next
    })
    setEmojiOpen(false)
  }

  const visibleMessages = chatMode === 'private' ? privateMessages : messages

  const openManager = () => {
    if (!selected) return
    setManageName(selected.name)
    setManageAnnouncement(selected.announcement || '')
    setMemberQuery('')
    setManageStatus('')
    setConfirmRemove('')
    setConfirmLeave(false)
    setManageOpen(true)
  }

  const saveGroupSettings = async () => {
    if (!selected || role !== 'teacher' || !manageName.trim()) return
    setManageBusy(true); setManageStatus('')
    try {
      const result = await apiFetch<{ class: TeachingClass }>(`/api/classes/${encodeURIComponent(selected.id)}/settings`, { ...jsonBody({ username, name: manageName, announcement: manageAnnouncement }), method: 'PUT' })
      setClasses((current) => current.map((item) => item.id === result.class.id ? result.class : item))
      setManageName(result.class.name); setManageAnnouncement(result.class.announcement || '')
      setManageStatus('群资料已保存')
    } catch (requestError) { setManageStatus(requestError instanceof Error ? requestError.message : '保存失败') }
    finally { setManageBusy(false) }
  }

  const copyInviteCode = async () => {
    if (!selected) return
    try { await navigator.clipboard.writeText(selected.invite_code); showToast('邀请码已复制') }
    catch { showToast(`邀请码：${selected.invite_code}`) }
  }

  const archiveGroup = async () => {
    if (!selected || role !== 'teacher') return
    setManageBusy(true)
    try {
      await apiFetch(`/api/classes/${encodeURIComponent(selected.id)}?username=${encodeURIComponent(username)}`, { method: 'DELETE' })
      const remaining = classes.filter((item) => item.id !== selected.id)
      setClasses(remaining); setSelectedId(remaining[0]?.id || ''); setManageOpen(false); setConfirmArchive(false); showToast('班级已解散')
    } catch (requestError) { showToast(requestError instanceof Error ? requestError.message : '解散班级失败') }
    finally { setManageBusy(false) }
  }

  const uploadGroupAvatar = async (file: File) => {
    if (!selected || role !== 'teacher') return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return setManageStatus('群头像仅支持 JPG、PNG、WebP 和 GIF')
    if (file.size > 5 * 1024 * 1024) return setManageStatus('群头像不能超过 5MB')
    const form = new FormData()
    form.append('username', username); form.append('file', file)
    setManageBusy(true); setManageStatus('')
    try {
      const result = await apiFetch<{ class: TeachingClass }>(`/api/classes/${encodeURIComponent(selected.id)}/avatar`, { method: 'POST', body: form })
      setClasses((current) => current.map((item) => item.id === result.class.id ? result.class : item))
      setManageStatus('群头像已更新')
    } catch (requestError) { setManageStatus(requestError instanceof Error ? requestError.message : '群头像上传失败') }
    finally { setManageBusy(false); if (groupAvatarRef.current) groupAvatarRef.current.value = '' }
  }

  const toggleMemberMute = async (member: ClassMember) => {
    if (!selected || role !== 'teacher') return
    setManageBusy(true); setManageStatus('')
    try {
      await apiFetch(`/api/classes/${encodeURIComponent(selected.id)}/members/${encodeURIComponent(member.username)}/mute`, { ...jsonBody({ username, muted: !member.muted }), method: 'PUT' })
      setMembers((current) => current.map((item) => item.username === member.username ? { ...item, muted: !item.muted } : item))
      setManageStatus(member.muted ? '已解除禁言' : '已禁言该成员')
    } catch (requestError) { setManageStatus(requestError instanceof Error ? requestError.message : '操作失败') }
    finally { setManageBusy(false) }
  }

  const removeMember = async (member: ClassMember) => {
    if (!selected || role !== 'teacher') return
    setManageBusy(true); setManageStatus('')
    try {
      await apiFetch(`/api/classes/${encodeURIComponent(selected.id)}/members/${encodeURIComponent(member.username)}?username=${encodeURIComponent(username)}`, { method: 'DELETE' })
      setMembers((current) => current.filter((item) => item.username !== member.username))
      setClasses((current) => current.map((item) => item.id === selected.id ? { ...item, member_count: Math.max(0, item.member_count - 1) } : item))
      setConfirmRemove(''); setManageStatus('成员已移出班级')
    } catch (requestError) { setManageStatus(requestError instanceof Error ? requestError.message : '移除失败') }
    finally { setManageBusy(false) }
  }

  const leaveGroup = async () => {
    if (!selected || role === 'teacher') return
    setManageBusy(true); setManageStatus('')
    try {
      await apiFetch(`/api/classes/${encodeURIComponent(selected.id)}/leave?username=${encodeURIComponent(username)}`, { method: 'DELETE' })
      const remaining = classes.filter((item) => item.id !== selected.id)
      setClasses(remaining); setSelectedId(remaining[0]?.id || ''); setManageOpen(false)
    } catch (requestError) { setManageStatus(requestError instanceof Error ? requestError.message : '退出失败') }
    finally { setManageBusy(false) }
  }

  return <main className="classroom-view" id="main-content">
    <header className="classroom-head"><div><p className="classroom-kicker"><UsersRound size={15} /> CLASS COMMUNITY</p><h1>班级管理</h1><span>像群聊一样交流学习进度，老师的通知会一直留在班级里。</span></div><button type="button" onClick={() => void loadClasses()} title="刷新班级"><RefreshCw size={16} />刷新</button></header>
    <section className="classroom-shell">
      <aside className="classroom-list-panel">
        <div className="classroom-panel-title"><strong>我的班级</strong><span>{classes.length} 个班级</span></div>
        {role === 'teacher' ? <div className="classroom-create"><input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="新建班级名称" /><button type="button" disabled={busy} onClick={() => void createClass()}><Plus size={15} />创建</button></div> : <div className="classroom-create"><input value={inviteCode} maxLength={6} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="输入邀请码" /><button type="button" disabled={busy} onClick={() => void joinClass()}><Plus size={15} />加入</button></div>}
        <div className="classroom-list">{classes.length ? classes.map((item) => <button type="button" key={item.id} className={item.id === selectedId ? 'is-active' : ''} onClick={() => setSelectedId(item.id)}><span className="classroom-avatar"><AvatarContent value={item.avatar_url} fallback={<UsersRound size={16} />} /></span><span><strong>{item.name}</strong><small>{item.member_count} 名学生 · {item.teacher}</small></span><ChevronRight size={15} /></button>) : <p className="classroom-empty">还没有班级，先创建或加入一个吧。</p>}</div>
      </aside>
      <section className="classroom-chat">
        {selected ? <><header className="classroom-chat-head"><div className="classroom-chat-identity"><span className="classroom-avatar"><AvatarContent value={chatMode === 'private' ? members.find((member) => member.username === privatePeer)?.avatar_url : selected.avatar_url} fallback={chatMode === 'private' ? privatePeer.slice(0, 1).toUpperCase() : <UsersRound size={16} />} /></span><div><strong>{chatMode === 'private' ? `与 ${privatePeer} 私聊` : selected.name}</strong><span>{chatMode === 'private' ? '只有你们两人可以看到这段对话' : `${members.length} 位成员 · 邀请码 ${selected.invite_code}${selected.announcement && ` · 公告：${selected.announcement}`}`}</span></div></div><div className="classroom-chat-actions">{chatMode === 'private' ? <button type="button" onClick={closePrivateChat} title="返回班级群聊" aria-label="返回班级群聊"><ArrowLeft size={18} /></button> : <><MessageCircle size={21} /><button type="button" onClick={openManager} title="群管理" aria-label="打开群管理"><Settings2 size={18} /></button></>}</div></header><div className="classroom-messages">{visibleMessages.length ? visibleMessages.map((message) => <article key={message.id} className={`${message.username === username ? 'is-mine' : ''} ${message.kind === 'notice' ? 'is-notice' : ''}`}><div className="chat-avatar">{message.kind === 'notice' ? <Bell size={14} /> : <AvatarContent value={members.find((member) => member.username === message.username)?.avatar_url} fallback={message.username.slice(0, 1).toUpperCase()} />}</div><div className={`chat-bubble ${message.media_url ? 'has-media' : ''} ${message.kind === 'emoji' ? 'is-emoji' : ''}`}><small>{message.username}{message.kind === 'notice' && ' · 班级通知'} · {new Date(message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>{message.kind === 'emoji' && message.media_url && <img className="classroom-emoji-media" src={message.media_url} alt={message.media_name || '自定义表情'} />}{message.kind !== 'emoji' && message.media_type === 'image' && message.media_url && <a href={message.media_url} target="_blank" rel="noreferrer" className="classroom-media"><img src={message.media_url} alt={message.media_name || '班级图片'} loading="lazy" /></a>}{message.kind !== 'emoji' && message.media_type === 'video' && message.media_url && <video className="classroom-media" src={message.media_url} controls preload="metadata">当前浏览器不支持视频播放。</video>}{message.kind !== 'emoji' && message.media_type === 'file' && message.media_url && <a className="classroom-file-link" href={message.media_url} target="_blank" rel="noreferrer" download><FileArchive size={18} /><span>{message.media_name || '下载附件'}</span></a>}{message.content && <p>{message.content}</p>}</div></article>) : <div className="classroom-chat-empty"><MessageCircle size={30} /><strong>{chatMode === 'private' ? '还没有私聊消息' : '班级群聊已准备好'}</strong><span>{chatMode === 'private' ? '发一条消息，和老师或同学单独交流。' : '发一条消息，和同学一起开始交流吧。'}</span></div>}</div><footer className="classroom-composer"><button type="button" className={noticeMode ? 'is-notice' : ''} disabled={role !== 'teacher' || chatMode === 'private'} onClick={() => setNoticeMode((value) => !value)} title={role === 'teacher' ? '切换班级通知' : '只有老师可以发通知'}><Bell size={16} />{noticeMode ? '通知模式' : '发通知'}</button><input value={chatMode === 'private' ? privateDraft : draft} disabled={isMuted} onChange={(event) => chatMode === 'private' ? setPrivateDraft(event.target.value) : setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder={isMuted ? '你已被老师禁言' : chatMode === 'private' ? '输入私聊消息...' : noticeMode ? '写下要通知全班的内容...' : '输入消息，和班级成员交流...'} /><button type="button" className={`classroom-emoji-button ${emojiOpen ? 'is-active' : ''}`} disabled={busy || isMuted} onClick={() => setEmojiOpen((value) => !value)} title="选择表情" aria-label="选择表情"><SmilePlus size={17} /></button><input ref={fileRef} className="classroom-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendMedia(file) }} /><button type="button" className="classroom-media-button" disabled={busy || isMuted} onClick={() => fileRef.current?.click()} title="发送图片或视频" aria-label="发送图片或视频"><ImagePlus size={17} /></button><input ref={documentFileRef} className="classroom-file-input" type="file" accept={CLASSROOM_FILE_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendMedia(file) }} /><button type="button" className="classroom-custom-emoji-button" disabled={busy || isMuted} onClick={() => documentFileRef.current?.click()} title="上传文件或压缩包" aria-label="上传文件或压缩包"><FileArchive size={17} /></button><button type="button" className="classroom-send" disabled={busy || isMuted || !(chatMode === 'private' ? privateDraft.trim() : draft.trim())} onClick={() => void sendMessage()} aria-label="发送消息"><Send size={17} /></button>{emojiOpen && <div className="classroom-emoji-picker" role="listbox">{['😀', '😄', '😂', '🥳', '🤔', '😮', '😢', '👍', '👏', '🎉', '🌟', '🔥', '💡', '❤️', '🍀', '🚀'].map((emoji) => <button type="button" key={emoji} onClick={() => void sendEmoji(emoji)} aria-label={`插入表情 ${emoji}`}>{emoji}</button>)}<button type="button" className="classroom-emoji-upload" onClick={() => documentFileRef.current?.click()}><FileArchive size={13} />上传文件或压缩包</button></div>}</footer></> : <div className="classroom-chat-empty"><UsersRound size={34} /><strong>选择一个班级</strong><span>左侧会显示你创建或加入的班级。</span></div>}
      </section>
      <aside className="classroom-members"><div className="classroom-panel-title"><strong>班级成员</strong><span>{members.length} 人</span></div>{members.map((member) => <div className="classroom-member" key={member.username}><span className="member-avatar"><AvatarContent value={member.avatar_url} fallback={member.username.slice(0, 1).toUpperCase()} /></span><span><strong>{member.username}</strong><small>{member.role === 'teacher' ? '群主 · 老师' : member.muted ? '学生 · 已禁言' : '学生'}</small></span>{member.username !== username && <button type="button" onClick={() => openPrivateChat(member)} title={`和 ${member.username} 私聊`} aria-label={`和 ${member.username} 私聊`}><MessageCircle size={14} /></button>}</div>)}</aside>
    </section>
    {error && <div className="classroom-toast is-error" role="alert">{error}</div>}
    {toast && <div className="classroom-toast" role="status">{toast}</div>}
    {emojiOpen && selected && <div className="classroom-emoji-picker-rich" role="listbox"><section><p className="classroom-emoji-section-title">最近使用</p><div className="classroom-emoji-recent">{(recentEmojis.length ? recentEmojis : CLASSROOM_EMOJIS.slice(0, 10)).map((emoji) => <button type="button" key={`recent-${emoji}`} onClick={() => void sendEmoji(emoji)} aria-label={`插入表情 ${emoji}`}>{emoji}</button>)}</div></section><section><p className="classroom-emoji-section-title">所有表情</p><div className="classroom-emoji-grid">{CLASSROOM_EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => void sendEmoji(emoji)} aria-label={`插入表情 ${emoji}`}>{emoji}</button>)}</div></section></div>}
    <Dialog open={manageOpen && !!selected} title="群管理" onClose={() => setManageOpen(false)} width="medium" panelClassName="class-group-dialog" footer={<><button type="button" onClick={() => setManageOpen(false)}>关闭</button>{role === 'teacher' && <button type="button" className="dialog-primary" disabled={manageBusy || !manageName.trim()} onClick={() => void saveGroupSettings()}>保存群资料</button>}</>}>
      {selected && <div className="class-group-manager">
        <section className="class-group-profile"><div className="class-group-avatar-control"><span className="class-group-mark"><AvatarContent value={selected.avatar_url} fallback={<UsersRound size={24} />} /></span>{role === 'teacher' && <><button type="button" disabled={manageBusy} onClick={() => groupAvatarRef.current?.click()}><Camera size={14} />上传群头像</button><input ref={groupAvatarRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadGroupAvatar(file) }} /></>}</div><div><strong>{selected.name}</strong><small>{members.length} 位成员 · 群主 {selected.teacher}</small></div></section>
        <section className="class-group-fields">
          <label><span>群名称</span><input value={manageName} maxLength={80} disabled={role !== 'teacher'} onChange={(event) => setManageName(event.target.value)} /></label>
          <label><span><Megaphone size={14} />群公告</span><textarea value={manageAnnouncement} maxLength={1000} disabled={role !== 'teacher'} onChange={(event) => setManageAnnouncement(event.target.value)} placeholder={role === 'teacher' ? '写下课程安排、作业提醒或班级约定...' : '群主暂未发布公告'} /></label>
        </section>
        <section className="class-group-invite"><div><strong>班级邀请码</strong><small>发送给学生即可加入当前班级</small></div><code>{selected.invite_code}</code><button type="button" onClick={() => void copyInviteCode()}><Copy size={15} />复制</button></section>
        <section className="class-group-members-panel">
          <header><div><strong>群成员</strong><small>{members.length} 人</small></div><label><Search size={14} /><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="搜索成员" /></label></header>
          <div className="class-group-member-list">{filteredMembers.map((member) => <div className="class-group-member-row" key={member.username}><span className="member-avatar"><AvatarContent value={member.avatar_url} fallback={member.username.slice(0, 1).toUpperCase()} /></span><span className="class-group-member-info"><strong>{member.username}</strong><small>{member.role === 'teacher' ? '群主 · 老师' : member.muted ? '学生 · 已禁言' : '学生'}</small></span>{role === 'teacher' && member.role !== 'teacher' && <span className="class-group-member-actions"><button type="button" disabled={manageBusy} onClick={() => void toggleMemberMute(member)} title={member.muted ? '解除禁言' : '禁言成员'}>{member.muted ? <Volume2 size={15} /> : <VolumeX size={15} />}{member.muted ? '解除' : '禁言'}</button>{confirmRemove === member.username ? <><button type="button" className="is-danger" disabled={manageBusy} onClick={() => void removeMember(member)}>确认移除</button><button type="button" onClick={() => setConfirmRemove('')}>取消</button></> : <button type="button" className="is-danger" onClick={() => setConfirmRemove(member.username)}><UserMinus size={15} />移除</button>}</span>}</div>)}</div>
        </section>
        {role !== 'teacher' && <section className="class-group-leave"><div><strong>退出班级群</strong><small>退出后需要重新使用邀请码加入</small></div>{confirmLeave ? <span><button type="button" onClick={() => setConfirmLeave(false)}>取消</button><button type="button" className="is-danger" disabled={manageBusy} onClick={() => void leaveGroup()}><LogOut size={15} />确认退出</button></span> : <button type="button" className="is-danger" onClick={() => setConfirmLeave(true)}><LogOut size={15} />退出群聊</button>}</section>}
        {role === 'teacher' && <section className="class-group-leave class-group-archive"><div><strong>解散班级</strong><small>解散后学生将无法继续访问此班级</small></div>{confirmArchive ? <span><button type="button" onClick={() => setConfirmArchive(false)}>取消</button><button type="button" className="is-danger" disabled={manageBusy} onClick={() => void archiveGroup()}><Archive size={15} />确认解散</button></span> : <button type="button" className="is-danger" onClick={() => setConfirmArchive(true)}><Archive size={15} />解散班级</button>}</section>}
        {manageStatus && <p className="class-group-status" role="status">{manageStatus}</p>}
      </div>}
    </Dialog>
  </main>
}
