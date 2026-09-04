import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Square, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Message } from '../types'
import { AvatarContent } from './AvatarContent'

function formatMessageTime(timestamp: number) {
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return ''
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetDay = new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const time = value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (targetDay === today) return `今天 ${time}`
  if (today - targetDay === 86_400_000) return `昨天 ${time}`
  return `${value.getMonth() + 1} 月 ${value.getDate()} 日 ${time}`
}

function normalizeMarkdown(content: string) {
  let inCodeBlock = false

  return content.split('\n').map((line) => {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      return line
    }
    if (!inCodeBlock && /^\s*\|/.test(line) && line.includes('||')) {
      return line.replace(/\|\s*\|/g, '|\n|')
    }
    return line
  }).join('\n')
}

export function MessageBubble({ message, userAvatar, aiAvatar }: { message: Message; userAvatar: string; aiAvatar: string }) {
  const isUser = message.role === 'user'
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => () => {
    if (speaking) window.speechSynthesis?.cancel()
  }, [speaking])

  const toggleSpeech = () => {
    if (!('speechSynthesis' in window)) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message.content)
    utterance.lang = 'zh-CN'
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }

  return (
    <article className={`message-row ${isUser ? 'user-message' : 'assistant-message'}`}>
      <div className={`message-avatar ${isUser ? 'user-avatar' : 'assistant-avatar'}`} aria-hidden="true">
        <AvatarContent value={isUser ? userAvatar : aiAvatar} fallback={isUser ? '👤' : '🤖'} />
      </div>
      <div className="message-content">
        {!isUser && <div className="assistant-meta"><strong className="assistant-name">启码 AI 学伴</strong><button type="button" className="message-voice-button" onClick={toggleSpeech} aria-label={speaking ? '停止朗读' : '朗读回答'} title={speaking ? '停止朗读' : '朗读回答'}>{speaking ? <Square size={13} /> : <Volume2 size={15} />}</button></div>}
        <div className={isUser ? 'user-bubble' : 'markdown-answer'}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(message.content)}</ReactMarkdown>
        </div>
        {isUser && <time dateTime={new Date(message.createdAt).toISOString()}>{formatMessageTime(message.createdAt)}</time>}
      </div>
    </article>
  )
}
