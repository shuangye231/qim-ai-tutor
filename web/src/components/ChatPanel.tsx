import { Code2, Download, MoreHorizontal, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Message, ModelOption, SessionAttachment } from '../types'
import { followUps } from '../data'
import { InputBox } from './InputBox'
import { MessageBubble } from './MessageBubble'
import { Menu } from './Menu'
import { AiThinking } from './AiThinking'

interface ChatPanelProps {
  title: string
  userAvatar: string
  aiAvatar: string
  messages: Message[]
  input: string
  onInput: (value: string) => void
  onSend: () => void
  onStop: () => void
  onPrompt: (value: string) => void
  onUpload: (file: File) => void
  attachments: SessionAttachment[]
  attachmentBusy: boolean
  onRemoveAttachment: (id: string) => void
  loading: boolean
  error: string
  models: ModelOption[]
  selectedModel: string
  onModelChange: (id: string) => void
  tutorMode: string
  onTutorModeChange: (mode: string) => void
  onVoice: (setText: (value: string) => void) => void
  onExportMarkdown: () => void
  onExportPdf: () => void
  onShare: () => void
  onClear: () => void
  onLearning: () => void
  onCode: () => void
}

export function ChatPanel(props: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const exportRef = useRef<HTMLButtonElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const inferenceSource = '云端编程导师'
  const isInitialRender = useRef(true)
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [props.messages, props.loading])

  return (
    <main className="chat-panel" id="main-content">
      <header className="chat-heading">
        <div>
          <h1>{props.title}</h1>
          <p>自动保存 · {props.models.find((item) => item.id === props.selectedModel)?.label || 'Free'} · {inferenceSource}</p>
        </div>
        <div className="chat-actions">
          <button className="open-code-button" type="button" title="打开编程实验室" aria-label="打开编程实验室" onClick={props.onCode}><Code2 size={17} />编程实验室</button>
          <button ref={exportRef} type="button" title="导出会话" aria-label="导出会话" aria-expanded={exportOpen} onClick={() => setExportOpen((value) => !value)}><Download size={17} />导出</button>
          <button type="button" title="分享会话" aria-label="分享会话" onClick={props.onShare}><Share2 size={17} />分享</button>
          <button ref={moreRef} type="button" className="icon-only" title="更多操作" aria-label="更多操作" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal size={19} /></button>
          <Menu open={exportOpen} anchor={exportRef.current} onClose={() => setExportOpen(false)} label="导出格式">
            <button role="menuitem" type="button" onClick={() => { setExportOpen(false); props.onExportMarkdown() }}>导出 Markdown</button>
            <button role="menuitem" type="button" onClick={() => { setExportOpen(false); props.onExportPdf() }}>打印 / 导出 PDF</button>
          </Menu>
          <Menu open={moreOpen} anchor={moreRef.current} onClose={() => setMoreOpen(false)} label="会话操作">
            <button role="menuitem" type="button" onClick={() => { setMoreOpen(false); props.onLearning() }}>打开学习管理</button>
            <button role="menuitem" type="button" className="danger-menu-item" onClick={() => { setMoreOpen(false); props.onClear() }}>清空当前对话</button>
          </Menu>
        </div>
      </header>

      <div className="messages-scroll" ref={scrollRef}>
        <div className="messages-inner">
          {props.messages.length ? props.messages.map((message) => (
            <MessageBubble key={message.id} message={message} userAvatar={props.userAvatar} aiAvatar={props.aiAvatar} />
          )) : (
            <div className="empty-chat">
              <strong>从一个问题开始</strong>
              <p>可以问 Scratch、Python、C++，也可以贴出代码一起找问题。</p>
            </div>
          )}
          {props.loading && (
            <AiThinking avatar={props.aiAvatar} />
          )}
          {props.error && <div className="inline-error" role="alert">{props.error}</div>}
        </div>
      </div>

      <div className="chat-bottom">
        <div className="follow-up-list" aria-label="建议追问">
          {followUps.map((item) => <button type="button" key={item} onClick={() => props.onPrompt(item)}>{item}</button>)}
        </div>
        <InputBox
          value={props.input}
          onChange={props.onInput}
          onSend={props.onSend}
          onStop={props.onStop}
          onUpload={props.onUpload}
          attachments={props.attachments}
          attachmentBusy={props.attachmentBusy}
          onRemoveAttachment={props.onRemoveAttachment}
          loading={props.loading}
          models={props.models}
          selectedModel={props.selectedModel}
          onModelChange={props.onModelChange}
          tutorMode={props.tutorMode}
          onTutorModeChange={props.onTutorModeChange}
          onVoice={props.onVoice}
        />
      </div>
    </main>
  )
}
