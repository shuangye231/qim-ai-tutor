import Editor from '@monaco-editor/react'
import { Bot, Code2, Download, Play, RotateCcw, Sparkles, TerminalSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiFetch, jsonBody } from '../api/client'
import { emptyCodeContext, readCodeContext, saveCodeContext } from '../code/workspace'
import type { CodeContext, CourseId } from '../types'
import { Scratch3Workspace } from './Scratch3Workspace'

interface CodeWorkspaceProps {
  username: string
  courseId: CourseId
  sessionId: string
  theme: 'light' | 'dark'
  onChat: () => void
  onAskAi: (prompt: string) => void
}

const labels: Record<CourseId, { title: string; language: string; file: string }> = {
  scratch: { title: 'Scratch 3 在线创作室', language: '官方 Scratch 3', file: 'project.sb3' },
  python: { title: 'Python 编程实验室', language: 'Python 3', file: 'main.py' },
  cpp: { title: 'C++ 编程实验室', language: 'C++17', file: 'main.cpp' },
}

export function CodeWorkspace({ username, courseId, sessionId, theme, onChat, onAskAi }: CodeWorkspaceProps) {
  const storageId = `${username}:${courseId}:${sessionId}`
  const [context, setContext] = useState<CodeContext>(() => readCodeContext(username, courseId, sessionId))
  const meta = labels[courseId]

  useEffect(() => { setContext(readCodeContext(username, courseId, sessionId)) }, [storageId])
  useEffect(() => { saveCodeContext(username, sessionId, context) }, [context, sessionId, username])

  const patch = (value: Partial<CodeContext>) => setContext((current) => ({ ...current, ...value, updatedAt: Date.now() }))
  const run = async () => {
    patch({ status: 'running', stdout: '', stderr: '' })
    try {
      const result = await apiFetch<{ stdout: string; stderr: string; exit_code: number; timed_out: boolean }>('/api/compiler/run', jsonBody({ username, course_id: courseId, source: context.source, stdin: context.stdin }))
      patch({ stdout: result.stdout || '', stderr: result.stderr || '', status: result.stderr ? 'error' : 'success' })
    } catch (error) {
      patch({ stdout: '', stderr: error instanceof Error ? error.message : '运行失败', status: 'error' })
    }
  }
  const reset = () => {
    if (!confirm('确定恢复这门课程的示例代码吗？当前代码会被替换。')) return
    setContext(emptyCodeContext(courseId))
  }
  const exportSource = () => {
    const url = URL.createObjectURL(new Blob([context.source], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = meta.file
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const askAi = () => onAskAi(context.stderr ? '请结合编程实验室里的代码和报错，告诉我哪里错了，并一步一步引导我修改。' : '请查看编程实验室里的代码和运行结果，帮我讲解这段程序并给出下一步练习建议。')

  return <main className={`code-workspace ${courseId === 'scratch' ? 'is-scratch-workspace' : ''}`} id="main-content">
    <header className="code-workspace-head">
      <div><span className="code-workspace-icon"><Code2 size={19} /></span><div><h1>{meta.title}</h1><p>{meta.file} · {meta.language} · 自动保存</p></div></div>
      <div className="study-mode-switch" role="group" aria-label="学习模式">
        <button type="button" onClick={onChat}><Bot size={16} />AI 导师</button>
        <button type="button" className="is-active"><TerminalSquare size={16} />编程实验室</button>
      </div>
    </header>
    {courseId === 'scratch' ? <Scratch3Workspace storageKey={storageId} onChange={patch} onAskAi={askAi} /> : <div className="text-code-lab">
      <div className="code-toolbar">
        <span><i />{meta.file}</span>
        <div>
          <button className="compiler-run" type="button" onClick={run} disabled={context.status === 'running'}><Play size={16} />{context.status === 'running' ? '运行中' : '运行'}</button>
          <button type="button" onClick={reset} title="恢复示例代码"><RotateCcw size={16} />重置</button>
          <button type="button" onClick={exportSource} title={`导出 ${meta.file}`}><Download size={16} />导出 {courseId === 'python' ? '.py' : '.cpp'}</button>
          <button type="button" onClick={askAi}><Sparkles size={16} />让 AI 讲解</button>
        </div>
      </div>
      <div className="code-editor-shell">
        <Editor
          language={courseId === 'cpp' ? 'cpp' : 'python'}
          value={context.source}
          onChange={(source) => patch({ source: source || '', status: 'idle' })}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          loading={<div className="compiler-loading">正在准备代码编辑器...</div>}
          options={{ automaticLayout: true, fontSize: 14, lineHeight: 23, minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 14 }, tabSize: 4, wordWrap: 'on' }}
        />
      </div>
      <div className="compiler-bottom">
        <label>程序输入<textarea value={context.stdin} onChange={(event) => patch({ stdin: event.target.value })} placeholder="需要 input / cin 时，在这里填写输入" /></label>
        <section className={`compiler-console is-${context.status}`} aria-live="polite">
          <div><TerminalSquare size={15} /><strong>运行结果</strong><span>{context.status === 'running' ? '执行中' : context.status === 'success' ? '运行成功' : context.status === 'error' ? '需要修改' : '等待运行'}</span></div>
          <pre>{context.stderr || context.stdout || '点击“运行”后，这里会显示输出和报错。'}</pre>
        </section>
      </div>
    </div>}
  </main>
}
