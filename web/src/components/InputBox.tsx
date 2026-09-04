import { ArrowUp, Check, ChevronDown, FileText, GraduationCap, Mic, Paperclip, Square, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ModelOption, SessionAttachment } from '../types'
import { Menu } from './Menu'

interface InputBoxProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onUpload: (file: File) => void
  attachments: SessionAttachment[]
  attachmentBusy: boolean
  onRemoveAttachment: (id: string) => void
  loading: boolean
  models: ModelOption[]
  selectedModel: string
  onModelChange: (id: string) => void
  tutorMode: string
  onTutorModeChange: (mode: string) => void
  onVoice: (setText: (value: string) => void) => void
}

interface ModelPickerProps {
  models: ModelOption[]
  selectedModel: string
  onModelChange: (id: string) => void
}

function modelLabel(model: ModelOption) {
  return model.label || model.name || model.id
}

function ModelPicker({ models, selectedModel, onModelChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 156 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const selected = models.find((model) => model.id === selectedModel) || models[0]

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const width = Math.max(156, rect.width)
      const menuHeight = models.length * 36 + 8
      const rightSide = rect.right + 6
      const left = rightSide + width <= window.innerWidth - 8
        ? rightSide
        : rect.left - width - 6
      const top = Math.min(
        Math.max(8, rect.bottom - menuHeight),
        window.innerHeight - menuHeight - 8,
      )
      setPosition({ left: Math.max(8, left), top, width })
    }
    setOpen(true)
  }

  const closeMenu = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const chooseModel = (id: string) => {
    closeMenu(true)
    if (id !== selectedModel) onModelChange(id)
  }

  const focusOption = (index: number) => {
    const options = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
    options?.[Math.max(0, Math.min(index, options.length - 1))]?.focus()
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption((index + 1) % models.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption((index - 1 + models.length) % models.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusOption(models.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
    }
  }

  useEffect(() => {
    if (!open) return
    const selectedIndex = Math.max(0, models.findIndex((model) => model.id === selectedModel))
    requestAnimationFrame(() => focusOption(selectedIndex))

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) closeMenu()
    }
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true)
    }
    const onViewportChange = () => closeMenu()
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onEscape)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, models, selectedModel])

  return (
    <>
      <button
        ref={triggerRef}
        className="model-picker-trigger"
        type="button"
        aria-label="选择模型"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={(event) => {
          if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault()
            openMenu()
          }
        }}
      >
        <span className="model-status-dot" />
        <strong>{selected ? modelLabel(selected) : '选择模型'}</strong>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="model-picker-menu"
          role="listbox"
          aria-label="可用模型"
          style={position}
        >
          {models.map((model, index) => {
            const active = model.id === selectedModel
            return (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'is-selected' : ''}
                onClick={() => chooseModel(model.id)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span>{modelLabel(model)}</span>
                {active && <Check size={15} aria-hidden="true" />}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

export function InputBox({
  value,
  onChange,
  onSend,
  onStop,
  onUpload,
  attachments,
  attachmentBusy,
  onRemoveAttachment,
  loading,
  models,
  selectedModel,
  onModelChange,
  tutorMode,
  onTutorModeChange,
  onVoice,
}: InputBoxProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const tutorRef = useRef<HTMLButtonElement>(null)
  const [tutorOpen, setTutorOpen] = useState(false)
  const tutorModes = [
    ['explain', '通俗讲解'],
    ['socratic', '苏格拉底追问'],
    ['interview', '面试官'],
    ['review', '代码审查'],
    ['quiz', '出题老师'],
  ]
  const tutorLabel = tutorModes.find(([id]) => id === tutorMode)?.[1] || '通俗讲解'
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSend()
    }
  }
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onUpload(file)
    event.target.value = ''
  }

  return (
    <div className="composer-wrap">
      <div className={`composer ${loading ? 'is-loading' : ''}`}>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="继续提问，或粘贴一段代码让 AI 帮你讲解..."
          rows={2}
          disabled={loading}
          aria-label="输入问题"
        />
        {attachments.length > 0 && <div className="attachment-list" aria-label="当前会话附件">
          {attachments.map((attachment) => <span className="attachment-chip" key={attachment.id}>
            <FileText size={14} />
            <span title={attachment.name}>{attachment.name}</span>
            <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label={`移除 ${attachment.name}`}><X size={13} /></button>
          </span>)}
        </div>}
        <div className="composer-toolbar">
          <div className="composer-tools">
            <button type="button" className="icon-text-button" disabled={attachmentBusy} onClick={() => fileRef.current?.click()}>
              <Paperclip size={17} />
              {attachmentBusy ? '读取中' : '添加文件'}
            </button>
            <input ref={fileRef} type="file" accept=".md,.txt,.csv,.json,.pdf,.docx,.pptx,.xlsx,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml,.log,text/*,application/pdf" onChange={onFile} hidden />
            <ModelPicker models={models} selectedModel={selectedModel} onModelChange={onModelChange} />
            <button ref={tutorRef} type="button" className="tutor-trigger" aria-haspopup="menu" aria-expanded={tutorOpen} onClick={() => setTutorOpen((value) => !value)}>
              <GraduationCap size={15} />{tutorLabel}<ChevronDown size={13} />
            </button>
            <Menu open={tutorOpen} anchor={tutorRef.current} onClose={() => setTutorOpen(false)} label="导师方式" placement="top">
              {tutorModes.map(([id, label]) => (
                <button key={id} role="menuitemradio" aria-checked={tutorMode === id} type="button" className={tutorMode === id ? 'is-selected' : ''} onClick={() => { setTutorOpen(false); onTutorModeChange(id) }}>
                  {label}{tutorMode === id && <Check size={14} />}
                </button>
              ))}
            </Menu>
            <button type="button" className="voice-button" onClick={() => onVoice(onChange)} title="语音输入" aria-label="语音输入"><Mic size={16} /></button>
          </div>
          <button
            className="send-button"
            type="button"
            onClick={loading ? onStop : onSend}
            disabled={!loading && !value.trim()}
            aria-label={loading ? '停止生成' : '发送消息'}
          >
            {loading ? <Square size={16} fill="currentColor" /> : <ArrowUp size={20} />}
          </button>
        </div>
      </div>
      <div className="composer-footnote">
        <span>AI 可能会犯错，请核对重要信息</span>
        <span>Enter 发送，Shift + Enter 换行</span>
      </div>
    </div>
  )
}
