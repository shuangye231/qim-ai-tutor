import { ArrowLeft, BookOpen, Download, Eye, FileText, FolderOpen, RefreshCw, Presentation } from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiFetch } from '../api/client'
import { Dialog } from '../components/Dialog'
import type { KnowledgeFile } from '../types'

type StudentClass = { id: string; name: string; member_count: number; teacher: string }
type Preview = { file: KnowledgeFile; kind: 'pdf' | 'markdown' | 'text'; content?: string; url?: string }

export function StudentKnowledgeView({ username, onClose }: { username: string; onClose: () => void }) {
  const [classes, setClasses] = useState<StudentClass[]>([])
  const [classId, setClassId] = useState('')
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const classResult = await apiFetch<{ classes: StudentClass[] }>(`/api/classes?username=${encodeURIComponent(username)}`)
      setClasses(classResult.classes)
      const nextClass = classResult.classes.some((item) => item.id === classId) ? classId : classResult.classes[0]?.id || ''
      setClassId(nextClass)
      if (nextClass) {
        const fileResult = await apiFetch<{ files: KnowledgeFile[] }>(`/api/knowledge/files/${encodeURIComponent(username)}?class_id=${encodeURIComponent(nextClass)}`)
        setFiles(fileResult.files)
      } else setFiles([])
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '机构课程读取失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [username])
  useEffect(() => {
    if (!classId) return
    void apiFetch<{ files: KnowledgeFile[] }>(`/api/knowledge/files/${encodeURIComponent(username)}?class_id=${encodeURIComponent(classId)}`).then((result) => setFiles(result.files)).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '课件读取失败'))
  }, [classId, username])

  const source = async (file: KnowledgeFile) => {
    const response = await fetch(`/api/knowledge/files/${encodeURIComponent(username)}/${encodeURIComponent(file.stored_name)}/download`, { headers: { 'X-Session-Token': localStorage.getItem('sessionToken') || '' } })
    if (!response.ok) throw new Error('文件读取失败')
    return response
  }
  const openPreview = async (file: KnowledgeFile) => {
    try {
      const result = await apiFetch<{ kind: 'pdf' | 'markdown' | 'text'; content: string }>(`/api/knowledge/files/${encodeURIComponent(username)}/${encodeURIComponent(file.stored_name)}/preview`)
      if (result.kind === 'pdf') setPreview({ file, kind: 'pdf', url: URL.createObjectURL(await (await source(file)).blob()) })
      else setPreview({ file, kind: result.kind, content: result.content })
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '预览失败') }
  }
  const download = async (file: KnowledgeFile) => {
    try { const url = URL.createObjectURL(await (await source(file)).blob()); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); URL.revokeObjectURL(url) }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '下载失败') }
  }
  const groups = [
    { key: 'courseware', title: '课程课件', description: '老师发布的课堂讲义与演示内容', icon: <Presentation size={22} />, items: files.filter((file) => file.category === 'courseware') },
    { key: 'material', title: '学习资料', description: '练习参考与拓展阅读', icon: <BookOpen size={22} />, items: files.filter((file) => file.category !== 'courseware') },
  ]
  return <main className="teacher-courseware-view student-courseware-view" id="main-content">
    <header className="teacher-courseware-head"><button type="button" onClick={onClose}><ArrowLeft size={17} />返回主页</button><div><p>CLASS COURSEWARE</p><h1>机构课程</h1><span>查看老师为班级发布的课件与资料</span></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />刷新</button></header>
    <div className="teacher-courseware-content">
      {!classes.length && !loading ? <section className="courseware-no-class"><BookOpen size={30} /><h2>还没有加入班级</h2><p>加入班级后，老师发布的机构课程会显示在这里。</p></section> : <>
        <section className="courseware-class-bar"><div><FolderOpen size={20} /><span><strong>当前班级</strong><small>老师发布的资料会同步到这里</small></span></div><label className="student-courseware-select"><span className="sr-only">选择班级</span><select value={classId} onChange={(event) => setClassId(event.target.value)} aria-label="选择班级">{classes.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.teacher}</option>)}</select></label><span className="courseware-total">共 {files.length} 个文件</span></section>
        <div className="courseware-groups">{groups.map((group) => <section className={`courseware-files is-${group.key}`} key={group.key}><header><span className="courseware-group-icon">{group.icon}</span><div><h2>{group.title}</h2><span>{group.description}</span></div><b>{group.items.length} 个文件</b></header>{group.items.map((file) => <article key={file.stored_name}><span className="knowledge-file-icon"><FileText size={18} /></span><div><strong>{file.name}</strong><small>{file.class_name || '当前班级'} · 老师上传</small></div><button className="preview-button" type="button" onClick={() => void openPreview(file)}><Eye size={15} />预览</button><button type="button" onClick={() => void download(file)} aria-label={`下载 ${file.name}`}><Download size={16} /></button></article>)}{!group.items.length && <div className="courseware-empty"><FileText size={28} /><strong>暂时没有文件</strong><p>老师发布后会自动显示。</p></div>}</section>)}</div>
      </>}
      {error && <p className="courseware-error">{error}</p>}
    </div>
    <Dialog open={!!preview} title={preview?.file.name || '在线预览'} onClose={() => { if (preview?.url) URL.revokeObjectURL(preview.url); setPreview(null) }} width="large" panelClassName="courseware-preview-dialog" showMaximize>{preview?.kind === 'pdf' && preview.url && <iframe className="courseware-pdf-preview" src={preview.url} title="PDF 预览" />}{preview?.kind === 'markdown' && <article className="courseware-document-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content || ''}</ReactMarkdown></article>}{preview?.kind === 'text' && <pre className="courseware-text-preview">{preview.content}</pre>}</Dialog>
  </main>
}
