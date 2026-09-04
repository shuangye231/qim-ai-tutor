import { Download, Send, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CodeContext } from '../types'
import { readScratchProject, saveScratchProject } from '../code/scratchStorage'

interface Scratch3WorkspaceProps {
  storageKey: string
  onChange: (patch: Partial<CodeContext>) => void
  onAskAi?: () => void
  onSubmitProject?: (project: ArrayBuffer) => void | Promise<void>
}

interface ScratchMessage {
  type?: string
  project?: ArrayBuffer
  context?: unknown
  requestId?: string
  message?: string
}

function downloadProject(project: ArrayBuffer) {
  const url = URL.createObjectURL(new Blob([project], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'project.sb3'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Scratch3Workspace({ storageKey, onChange, onAskAi, onSubmitProject }: Scratch3WorkspaceProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const askPendingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onAskAiRef = useRef<Scratch3WorkspaceProps['onAskAi']>(onAskAi)
  const onSubmitProjectRef = useRef<Scratch3WorkspaceProps['onSubmitProject']>()
  const submitPendingRef = useRef(false)
  const [status, setStatus] = useState('正在加载 Scratch 3...')
  const [ready, setReady] = useState(false)

  onChangeRef.current = onChange
  onAskAiRef.current = onAskAi
  onSubmitProjectRef.current = onSubmitProject

  useEffect(() => {
    setReady(false)
    setStatus('正在加载 Scratch 3...')
    const receive = async (event: MessageEvent<ScratchMessage>) => {
      if (event.origin !== location.origin || event.source !== frameRef.current?.contentWindow) return
      const data = event.data || {}
      if (data.type === 'scratch-ready') {
        setReady(true)
        try {
          const project = await readScratchProject(storageKey)
          frameRef.current?.contentWindow?.postMessage(
            project ? { type: 'load-project', project } : { type: 'load-default' },
            location.origin,
            project ? [project] : [],
          )
          setStatus(project ? '正在恢复上次作品...' : 'Scratch 3 已就绪')
        } catch {
          setStatus('Scratch 3 已就绪，自动保存暂不可用')
        }
      }
      if (data.type === 'scratch-project' && data.project) {
        try {
          await saveScratchProject(storageKey, data.project)
          setStatus('已自动保存')
        } catch {
          setStatus('自动保存失败')
        }
      }
      if (data.type === 'scratch-export' && data.project) {
        if (submitPendingRef.current) {
          submitPendingRef.current = false
          setStatus('作品已提交，等待老师评价')
          await onSubmitProjectRef.current?.(data.project)
        } else downloadProject(data.project)
      }
      if (data.type === 'scratch-context' && data.context) {
        const source = JSON.stringify(data.context, null, 2)
        onChangeRef.current({ source, workspace: source, status: 'idle', stderr: '' })
        if (data.requestId === 'ask-ai' && askPendingRef.current) {
          askPendingRef.current = false
          onAskAiRef.current?.()
        }
      }
      if (data.type === 'scratch-loaded') setStatus('作品已恢复并自动保存')
      if (data.type === 'scratch-error') setStatus(data.message || 'Scratch 3 加载失败')
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [storageKey])

  const askAi = () => {
    askPendingRef.current = true
    frameRef.current?.contentWindow?.postMessage({ type: 'get-context', requestId: 'ask-ai' }, location.origin)
  }
  const exportProject = () => frameRef.current?.contentWindow?.postMessage({ type: 'export-project' }, location.origin)
  const submitProject = () => {
    submitPendingRef.current = true
    setStatus('正在准备作品…')
    exportProject()
  }

  return <div className="scratch3-lab">
    <div className="scratch3-toolbar">
      <span className={ready ? 'is-ready' : ''}><i />{status}</span>
      <div>
        {onSubmitProject && <button type="button" onClick={submitProject} disabled={!ready}><Send size={16} />提交作品</button>}
        <button type="button" onClick={exportProject} disabled={!ready}><Download size={16} />导出 .sb3</button>
        {onAskAi && <button type="button" onClick={askAi} disabled={!ready}><Sparkles size={16} />让 AI 讲解</button>}
      </div>
    </div>
    <iframe
      key={storageKey}
      ref={frameRef}
      className="scratch3-frame"
      src="/web/dist/scratch3/editor.html"
      title="Scratch 3 编程编辑器"
      allow="microphone; camera"
    />
  </div>
}
