import { ArrowLeft, BookOpen, Building2, Download, Eye, FileText, FolderOpen, Presentation, RefreshCw, Table2, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { renderAsync } from 'docx-preview'
import { init as initPptxPreview } from 'pptx-preview'
import * as XLSX from 'xlsx'
import { apiFetch } from '../api/client'
import { Dialog } from '../components/Dialog'
import type { KnowledgeFile } from '../types'

interface TeachingClass {
  id: string
  name: string
  member_count: number
}

interface KnowledgeViewProps {
  username: string
  onNotice: (message: string) => void
  onClose: () => void
  onClasses: () => void
  onChanged: (files: KnowledgeFile[]) => void
}

type FileCategory = 'courseware' | 'material'
type SpreadsheetCell = { value: string; link?: string; rowSpan?: number; colSpan?: number; hidden?: boolean }
type SpreadsheetSheet = { name: string; rows: SpreadsheetCell[][]; columnWidths: number[]; rowHeights: number[]; totalRows: number; totalColumns: number; startRow: number; startColumn: number }
type PreviewState = { file: KnowledgeFile; loading: boolean; kind?: 'markdown' | 'text' | 'pdf' | 'docx' | 'pptx' | 'xlsx'; content?: string; url?: string; blob?: Blob; sheets?: SpreadsheetSheet[]; error?: string }

const MAX_PREVIEW_ROWS = 2000
const MAX_PREVIEW_COLUMNS = 200
const columnLabel = (index: number) => XLSX.utils.encode_col(index)

function readSpreadsheetSheet(workbook: XLSX.WorkBook, name: string): SpreadsheetSheet {
  const sheet = workbook.Sheets[name]
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
  const totalRows = range.e.r - range.s.r + 1
  const totalColumns = range.e.c - range.s.c + 1
  const rowCount = Math.min(totalRows, MAX_PREVIEW_ROWS)
  const columnCount = Math.min(totalColumns, MAX_PREVIEW_COLUMNS)
  const mergeAnchors = new Map<string, { rowSpan: number; colSpan: number }>()
  const mergedChildren = new Set<string>()

  for (const merge of sheet['!merges'] || []) {
    if (merge.s.r < range.s.r || merge.s.c < range.s.c || merge.s.r >= range.s.r + rowCount || merge.s.c >= range.s.c + columnCount) continue
    const anchor = XLSX.utils.encode_cell(merge.s)
    mergeAnchors.set(anchor, {
      rowSpan: Math.min(merge.e.r, range.s.r + rowCount - 1) - merge.s.r + 1,
      colSpan: Math.min(merge.e.c, range.s.c + columnCount - 1) - merge.s.c + 1,
    })
    for (let row = merge.s.r; row <= Math.min(merge.e.r, range.s.r + rowCount - 1); row += 1) {
      for (let column = merge.s.c; column <= Math.min(merge.e.c, range.s.c + columnCount - 1); column += 1) {
        if (row !== merge.s.r || column !== merge.s.c) mergedChildren.add(XLSX.utils.encode_cell({ r: row, c: column }))
      }
    }
  }

  const rows = Array.from({ length: rowCount }, (_, rowOffset) => Array.from({ length: columnCount }, (_, columnOffset) => {
    const address = XLSX.utils.encode_cell({ r: range.s.r + rowOffset, c: range.s.c + columnOffset })
    const cell = sheet[address]
    const merge = mergeAnchors.get(address)
    const value = cell ? XLSX.utils.format_cell(cell) : ''
    const explicitLink = cell?.l?.Target
    return {
      value,
      link: explicitLink && /^https?:\/\//i.test(explicitLink) ? explicitLink : /^https?:\/\/\S+$/i.test(value) ? value : undefined,
      rowSpan: merge?.rowSpan,
      colSpan: merge?.colSpan,
      hidden: mergedChildren.has(address),
    }
  }))

  return {
    name,
    rows,
    columnWidths: Array.from({ length: columnCount }, (_, index) => {
      const column = sheet['!cols']?.[range.s.c + index]
      return Math.max(72, Math.min(420, column?.wpx || (column?.wch ? column.wch * 8 : 120)))
    }),
    rowHeights: Array.from({ length: rowCount }, (_, index) => {
      const row = sheet['!rows']?.[range.s.r + index]
      return Math.max(28, Math.min(160, row?.hpx || (row?.hpt ? row.hpt * 4 / 3 : 32)))
    }),
    totalRows,
    totalColumns,
    startRow: range.s.r,
    startColumn: range.s.c,
  }
}

function SpreadsheetPreview({ sheets, fileName }: { sheets: SpreadsheetSheet[]; fileName: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => setActiveIndex(0), [sheets])
  const sheet = sheets[activeIndex]
  if (!sheet) return <div className="courseware-preview-state"><Table2 size={28} /><strong>工作簿中没有可显示的数据</strong></div>
  const truncated = sheet.totalRows > sheet.rows.length || sheet.totalColumns > sheet.columnWidths.length

  return <div className="courseware-spreadsheet-preview" aria-label={`${fileName} 表格预览`}>
    <div className="spreadsheet-toolbar"><span><Table2 size={16} />只读工作簿</span><small>{sheet.totalRows} 行 · {sheet.totalColumns} 列{truncated ? ' · 大型表格仅展示前部分内容' : ''}</small></div>
    <div className="courseware-spreadsheet-scroll">
      <table>
        <colgroup><col className="spreadsheet-row-number-column" />{sheet.columnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <thead><tr><th className="spreadsheet-corner" />{sheet.columnWidths.map((_, index) => <th key={index} scope="col">{columnLabel(sheet.startColumn + index)}</th>)}</tr></thead>
        <tbody>{sheet.rows.map((row, rowIndex) => <tr key={rowIndex} style={{ height: sheet.rowHeights[rowIndex] }}><th scope="row">{sheet.startRow + rowIndex + 1}</th>{row.map((cell, cellIndex) => cell.hidden ? null : <td key={cellIndex} rowSpan={cell.rowSpan} colSpan={cell.colSpan} className={cell.link ? 'has-link' : undefined}>{cell.link ? <a href={cell.link} target="_blank" rel="noreferrer">{cell.value || cell.link}</a> : cell.value}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <nav className="spreadsheet-tabs" aria-label="工作表">{sheets.map((item, index) => <button key={item.name} type="button" className={index === activeIndex ? 'is-active' : undefined} onClick={() => setActiveIndex(index)}>{item.name}</button>)}</nav>
  </div>
}

const formatSize = (size: number) => size < 1024 ? `${size} B` : `${Math.max(1, Math.round(size / 1024))} KB`
const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function KnowledgeView({ username, onNotice, onClose, onClasses, onChanged }: KnowledgeViewProps) {
  const [classes, setClasses] = useState<TeachingClass[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [files, setFiles] = useState<KnowledgeFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<KnowledgeFile | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const docxPreviewRef = useRef<HTMLDivElement>(null)
  const pptxPreviewRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadCategoryRef = useRef<FileCategory>('material')

  const loadClasses = async () => {
    const result = await apiFetch<{ classes: TeachingClass[] }>(`/api/teacher/classes?username=${encodeURIComponent(username)}`)
    setClasses(result.classes)
    setSelectedClass((current) => result.classes.some((item) => item.id === current) ? current : result.classes[0]?.id || '')
  }

  const loadFiles = async (classId = selectedClass) => {
    if (!classId) { setFiles([]); onChanged([]); return }
    const result = await apiFetch<{ files: KnowledgeFile[] }>(`/api/knowledge/files/${encodeURIComponent(username)}?class_id=${encodeURIComponent(classId)}`)
    setFiles(result.files)
    onChanged(result.files)
  }

  const load = async () => {
    setLoading(true); setError('')
    try { await loadClasses() }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '读取班级失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [username])
  useEffect(() => {
    if (!selectedClass) { setFiles([]); return }
    setLoading(true); setError('')
    void loadFiles(selectedClass).catch((requestError) => setError(requestError instanceof Error ? requestError.message : '读取课件失败')).finally(() => setLoading(false))
  }, [selectedClass])

  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview?.url])

  useEffect(() => {
    if (preview?.kind !== 'docx' || !preview.blob || !docxPreviewRef.current) return
    const container = docxPreviewRef.current
    container.replaceChildren()
    void renderAsync(preview.blob, container, undefined, { breakPages: true, inWrapper: true, ignoreWidth: false, ignoreHeight: false })
      .catch(() => setPreview((current) => current?.file.stored_name === preview.file.stored_name ? { ...current, loading: false, error: 'Word 页面渲染失败，请下载文件后查看。' } : current))
  }, [preview?.blob, preview?.file.stored_name, preview?.kind])

  useEffect(() => {
    if (preview?.kind !== 'pptx' || !preview.blob || !pptxPreviewRef.current) return
    const container = pptxPreviewRef.current
    let cancelled = false
    let buffer: ArrayBuffer | null = null
    let viewer: ReturnType<typeof initPptxPreview> | null = null
    let renderFrame = 0
    let renderId = 0
    const render = () => {
      if (cancelled || !buffer) return
      const styles = getComputedStyle(container)
      const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
      const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
      const availableWidth = Math.max(280, container.clientWidth - horizontalPadding)
      const availableHeight = Math.max(220, container.clientHeight - verticalPadding)
      const width = Math.floor(Math.min(availableWidth, availableHeight * 16 / 9))
      viewer?.destroy()
      container.replaceChildren()
      viewer = initPptxPreview(container, { width, height: availableHeight, mode: 'list' })
      const currentRender = ++renderId
      void viewer.preview(buffer).catch(() => {
        if (!cancelled && currentRender === renderId) setPreview((current) => current?.file.stored_name === preview.file.stored_name ? { ...current, loading: false, error: 'PPT 页面渲染失败，请下载文件后查看。' } : current)
      })
    }
    void preview.blob.arrayBuffer().then((value) => {
      if (cancelled) return
      buffer = value
      requestAnimationFrame(render)
    }).catch(() => setPreview((current) => current?.file.stored_name === preview.file.stored_name ? { ...current, loading: false, error: 'PPT 文件读取失败，请下载文件后查看。' } : current))
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(renderFrame)
      renderFrame = requestAnimationFrame(render)
    })
    resizeObserver.observe(container)
    return () => {
      cancelled = true
      cancelAnimationFrame(renderFrame)
      resizeObserver.disconnect()
      viewer?.destroy()
      container.replaceChildren()
    }
  }, [preview?.blob, preview?.file.stored_name, preview?.kind])

  const chooseUpload = (category: FileCategory) => {
    uploadCategoryRef.current = category
    uploadRef.current?.click()
  }

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedClass) return
    if (!/\.(md|txt|csv|docx|pptx|xlsx|pdf)$/i.test(file.name)) { setError('支持 Markdown、TXT、CSV、Word、PPTX、Excel XLSX 和 PDF 文件'); return }
    const form = new FormData()
    form.append('file', file); form.append('username', username); form.append('class_id', selectedClass); form.append('category', uploadCategoryRef.current)
    setLoading(true); setError('')
    try {
      await apiFetch('/api/upload', { method: 'POST', body: form })
      onNotice(`${file.name} 已上传到${uploadCategoryRef.current === 'courseware' ? '课件' : '资料'}`)
      await loadFiles()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '上传失败') }
    finally { setLoading(false) }
  }

  const fetchSource = async (file: KnowledgeFile) => {
    const response = await fetch(`/api/knowledge/files/${encodeURIComponent(username)}/${encodeURIComponent(file.stored_name)}/download`, { headers: { 'X-Session-Token': localStorage.getItem('sessionToken') || '' } })
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || '读取文件失败')
    return response
  }

  const openPreview = async (file: KnowledgeFile) => {
    setPreview({ file, loading: true })
    try {
      const result = await apiFetch<{ kind: 'markdown' | 'text' | 'pdf'; content: string }>(`/api/knowledge/files/${encodeURIComponent(username)}/${encodeURIComponent(file.stored_name)}/preview`)
      if (result.kind === 'pdf') {
        const url = URL.createObjectURL(await (await fetchSource(file)).blob())
        setPreview({ file, loading: false, kind: 'pdf', url })
      } else if (/\.docx$/i.test(file.name)) {
        const blob = await (await fetchSource(file)).blob()
        setPreview({ file, loading: false, kind: 'docx', blob })
      } else if (/\.pptx$/i.test(file.name)) {
        const blob = await (await fetchSource(file)).blob()
        setPreview({ file, loading: false, kind: 'pptx', blob })
      } else if (/\.(xlsx|csv)$/i.test(file.name)) {
        const workbook = XLSX.read(await (await fetchSource(file)).arrayBuffer(), { type: 'array', cellDates: true, cellStyles: true })
        const sheets = workbook.SheetNames.map((name) => readSpreadsheetSheet(workbook, name))
        setPreview({ file, loading: false, kind: 'xlsx', sheets })
      } else {
        setPreview({ file, loading: false, kind: result.kind, content: result.content })
      }
    } catch (requestError) {
      setPreview({ file, loading: false, error: requestError instanceof Error ? requestError.message : '预览失败' })
    }
  }

  const download = async (file: KnowledgeFile) => {
    setError('')
    try {
      const response = await fetchSource(file)
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); URL.revokeObjectURL(url)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '下载失败') }
  }

  const remove = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null); setLoading(true); setError('')
    try {
      await apiFetch(`/api/knowledge/files/${encodeURIComponent(username)}/${encodeURIComponent(target.stored_name)}`, { method: 'DELETE' })
      onNotice(`${target.name} 已删除`)
      await loadFiles()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '删除失败') }
    finally { setLoading(false) }
  }

  const activeClass = classes.find((item) => item.id === selectedClass)
  const fileGroups: { category: FileCategory; title: string; description: string; files: KnowledgeFile[] }[] = [
    { category: 'courseware', title: '课程课件', description: '课堂演示、讲义和教学内容', files: files.filter((file) => file.category === 'courseware') },
    { category: 'material', title: '学习资料', description: '拓展阅读、练习参考和补充文档', files: files.filter((file) => file.category !== 'courseware') },
  ]
  return <main className="teacher-courseware-view" id="main-content">
    <header className="teacher-courseware-head">
      <button type="button" onClick={onClose}><ArrowLeft size={17} />返回主页</button>
      <div><p>TEACHER COURSEWARE</p><h1>机构课程</h1><span>按班级管理课件和教学资料</span></div>
      <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />刷新</button>
    </header>
    <div className="teacher-courseware-content">
      {!classes.length && !loading ? <section className="courseware-no-class"><Building2 size={30} /><h2>请先创建班级</h2><p>创建班级后，才能为对应班级上传课件和资料。</p><button type="button" onClick={onClasses}>前往班级管理</button></section> : <>
        <section className="courseware-class-bar">
          <div><FolderOpen size={20} /><span><strong>当前班级</strong><small>资料仅归属于所选班级</small></span></div>
          <select value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} aria-label="选择班级">{classes.map((item) => <option value={item.id} key={item.id}>{item.name}（{item.member_count} 名学生）</option>)}</select>
          <span className="courseware-total">{activeClass?.name || '当前班级'} · 共 {files.length} 个文件</span>
          <input ref={uploadRef} type="file" accept=".md,.txt,.csv,.docx,.pptx,.xlsx,.pdf" hidden onChange={upload} />
        </section>
        {error && <p className="route-error" role="alert">{error}</p>}
        <div className="courseware-groups">
          {fileGroups.map((group) => <section className={`courseware-files is-${group.category}`} key={group.category}>
            <header><span className="courseware-group-icon">{group.category === 'courseware' ? <Presentation size={22} /> : <BookOpen size={22} />}</span><div><h2>{group.title}</h2><span>{group.description}</span></div><b>{group.files.length} 个文件</b><button type="button" onClick={() => chooseUpload(group.category)} disabled={loading || !selectedClass}><Upload size={15} />上传{group.category === 'courseware' ? '课件' : '资料'}</button></header>
            {group.files.map((file) => <article key={file.stored_name}><span className="knowledge-file-icon"><FileText size={18} /></span><div><strong>{file.name}</strong><small>{formatSize(file.size)} · {formatDate(file.updated_at)}</small></div><button className="preview-button" type="button" onClick={() => void openPreview(file)} title="在线预览"><Eye size={15} />预览</button><button type="button" onClick={() => void download(file)} title="下载" aria-label={`下载 ${file.name}`}><Download size={16} /></button><button className="danger-icon" type="button" onClick={() => setPendingDelete(file)} title="删除" aria-label={`删除 ${file.name}`}><Trash2 size={16} /></button></article>)}
            {!group.files.length && !loading && <div className="courseware-empty">{group.category === 'courseware' ? <Presentation size={28} /> : <BookOpen size={28} />}<strong>还没有{group.title}</strong><p>点击右上角上传，文件会单独归档在这里。</p></div>}
            {loading && !group.files.length && <div className="courseware-empty"><span className="answer-loading-dot" /><p>正在读取文件...</p></div>}
          </section>)}
        </div>
      </>}
    </div>
    <Dialog open={!!preview} title={preview?.file.name || '在线预览'} onClose={() => setPreview(null)} width="large" panelClassName="courseware-preview-dialog" showMaximize>
      {preview?.loading && <div className="courseware-preview-state"><span className="answer-loading-dot" /><p>正在准备预览...</p></div>}
      {preview?.error && <div className="courseware-preview-state is-error"><FileText size={28} /><strong>无法预览此文件</strong><p>{preview.error}</p></div>}
      {preview?.kind === 'pdf' && preview.url && <iframe className="courseware-pdf-preview" src={preview.url} title={`${preview.file.name} 在线预览`} />}
      {preview?.kind === 'docx' && !preview.error && <div ref={docxPreviewRef} className="courseware-docx-preview" aria-label={`${preview.file.name} Word 页面预览`} />}
      {preview?.kind === 'pptx' && !preview.error && <div ref={pptxPreviewRef} className="courseware-pptx-preview" aria-label={`${preview.file.name} 幻灯片预览`} />}
      {preview?.kind === 'xlsx' && !preview.error && preview.sheets && <SpreadsheetPreview sheets={preview.sheets} fileName={preview.file.name} />}
      {preview?.kind === 'markdown' && <article className="courseware-document-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content || ''}</ReactMarkdown></article>}
      {preview?.kind === 'text' && <pre className="courseware-text-preview">{preview.content}</pre>}
    </Dialog>
    <Dialog open={!!pendingDelete} title="删除班级资料" onClose={() => setPendingDelete(null)} footer={<><button onClick={() => setPendingDelete(null)}>取消</button><button className="dialog-danger" onClick={() => void remove()}>确认删除</button></>}>删除“{pendingDelete?.name}”后将无法恢复。</Dialog>
  </main>
}
