import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, BookOpen, Headset, Home, Map, MessageSquareText, X } from 'lucide-react'

type GuideStep = { title: string; body: string }

type FloatingGuideBallProps = {
  route: string
  role?: string
  courseName?: string
  studyMode?: 'chat' | 'code'
  onHome: () => void
  onBack: () => void
  onFeedback: () => void
  onContact: () => void
}

const guideFor = (route: string, role: string, courseName: string, studyMode: 'chat' | 'code'): { title: string; intro: string; steps: GuideStep[] } => {
  const isTeacher = role === 'teacher'
  if (route === '/') return {
    title: isTeacher ? '教师工作台导航' : '学生学习空间导航',
    intro: isTeacher ? '这里是教师端的冒险地图入口，可以管理班级、课程资料、作业和老师自建周赛。' : '这里是启码 AI 学伴的冒险地图入口，你可以从六个学习模块开始今天的任务。',
    steps: [
      { title: isTeacher ? '管理教学模块' : '选择学习模块', body: isTeacher ? '班级管理用于群聊、通知和成员管理；机构课程用于上传课件与资料；作业中心用于布置和批改；编程竞赛用于创建、发布和阅卷；OJ 题库用于查看全站练习。' : '单人学习适合独立跟着 AI 学习；机构课程用于查看老师发布的课件；班级管理用于群聊、私聊和通知；作业中心查看待完成任务；OJ 题库练习题目；编程竞赛参加老师创建的挑战。' },
      { title: isTeacher ? '查看班级进度' : '查看成长进度', body: isTeacher ? '进入班级、作业或成绩页，可以查看学生提交状态、客观题得分和待批改题目。' : '首页的进度、连续学习和今日任务会记录你的学习旅程。完成练习后返回首页，可以看到经验和完成状态更新。' },
      { title: isTeacher ? '发布一次学习任务' : '保持一个学习节奏', body: isTeacher ? '建议先创建班级，再发布资料、作业或周赛；学生的提交和提问会自动同步到教师端。' : '建议每天先完成今日任务，再进入题库或编程实验室做一项小练习。遇到不会的题目，可以直接在班级里询问老师。' },
    ],
  }
  if (route === '/study') return {
    title: `${courseName} AI 学习空间`,
    intro: studyMode === 'code' ? '你当前正在编程实验室，可以编写、运行和导出代码。' : '你当前正在 AI 导师空间，可以提问、上传资料并沿着技能路线学习。',
    steps: [
      { title: '切换课程', body: '左侧课程列表可以在 Scratch、Python 和 C++ 之间切换。每门课程都有独立的会话、代码和学习进度，不会互相覆盖。' },
      { title: isTeacher ? '用 AI 辅助备课' : '向 AI 提问', body: isTeacher ? '在底部输入框描述知识点、教案或题目需求，也可以上传资料，让 AI 帮你梳理内容和生成讲解。' : '在底部输入框描述你的问题，也可以粘贴代码或上传资料。AI 会结合当前课程和会话上下文回答；建议一次只问一个具体问题。' },
      { title: '使用学习路线', body: '右侧路线会显示阶段、知识点和下一步任务。点击知识点可以查看练习，完成后会更新进度。' },
      { title: '进入编程实验室', body: '点击顶部“编程实验室”切换到代码环境。Python 和 C++ 支持运行、输入、重置和导出；Scratch 支持拖拽积木、运行舞台和导出 sb3。' },
    ],
  }
  if (route === '/learning') return {
    title: '学习管理使用指南',
    intro: '这里是你的学习路线、练习、笔记和错题复习中心。',
    steps: [
      { title: '查看路线阶段', body: '左侧阶段按学习顺序排列，已完成、学习中和待解锁状态会清楚显示。点击阶段可查看本阶段的知识点。' },
      { title: '完成知识点', body: '选择一个知识点进入练习，提交后系统会记录结果。不会做时可以回到 AI 导师，让 AI 用更简单的方式讲解。' },
      { title: '整理笔记和错题', body: '在笔记页保存自己的理解，在错题页回看做错的题目和原因。复习后重新练习，有助于真正掌握而不是只看答案。' },
    ],
  }
  if (route === '/classes') return {
    title: '班级交流使用指南',
    intro: '班级窗口像一个学习群，老师和同学可以在这里交流、收发资料和查看通知。',
    steps: [
      { title: '选择或加入班级', body: '左侧显示你创建或加入的班级。老师可以创建班级并分享邀请码，学生使用邀请码加入对应班级。' },
      { title: '发送群消息', body: '在底部输入框发送文字，点击表情按钮插入小表情，点击图片按钮上传图片或视频。消息会在班级窗口内滚动显示。' },
      { title: isTeacher ? '发布通知和私聊' : '查看通知和私聊', body: isTeacher ? '使用发通知模式提醒全班；点击成员或私聊入口，可以单独回复学生，不会打扰群聊。' : '查看老师发布的通知；点击成员或私聊入口，可以和老师或同学单独交流，不会打扰群聊。' },
      { title: isTeacher ? '管理班级' : '遵守班级交流规则', body: isTeacher ? '点击群管理可以修改班级名称、头像、公告、成员权限和禁言状态。重要通知建议写清截止时间和完成要求。' : '群聊适合讨论学习问题，作业和题目不会时可以直接询问老师；发送图片、视频和文件前请确认内容与课程相关。' },
    ],
  }
  if (route === '/assignments') return {
    title: '作业中心使用指南',
    intro: '作业中心用于布置、接收和提交班级作业。',
    steps: [
      { title: isTeacher ? '创建并发布作业' : '接收并完成作业', body: isTeacher ? '点击布置新作业，选择班级和作业类型，填写截止时间与题目后发布；发布后班级成员会同步收到。' : '打开待完成作业，按要求回答题目或提交代码。提交前可以保存草稿，确认无误后再正式提交。' },
      { title: isTeacher ? '查看学生提交' : '检查提交状态', body: isTeacher ? '在作业详情底部查看每位学生的答案、代码和提交时间，输入得分与评语后保存批改。' : '提交后回到作业详情确认状态变为“已提交”；如果需要补充内容，按老师的反馈重新提交。' },
      { title: '遇到问题及时提问', body: '题目不会时可以点击“问老师”，系统会把题目和你的问题带到班级私聊中，老师可以针对这道题回复。' },
      { title: isTeacher ? '完成批改与反馈' : '查看反馈', body: isTeacher ? '批改后学生可以看到分数和评语；需要补交时请在评语里写清修改内容和截止时间。' : '提交后回到作业详情查看老师批注、得分和补交要求。超过截止时间的作业会明确标记，避免漏交。' },
    ],
  }
  if (route === '/contest') return {
    title: '冒险挑战大厅指南',
    intro: '这里展示老师创建的周赛和编程挑战，每场挑战都有自己的题目、时间和提交记录。',
    steps: [
      { title: '查看挑战任务', body: '左侧选择一场挑战，查看题目数量、难度、开始和截止时间。挑战只来自老师创建的试卷，不会自动混入系统题目。' },
      { title: isTeacher ? '预览与检查试卷' : '预览试卷', body: isTeacher ? '点击预览题目检查选择、判断、填空、简答和编程题内容；确认答案与分值无误后再发布。' : '点击预览题目可以先了解选择题、判断题和编程题类型。开始作答后，平台会保存你的答题进度。' },
      { title: isTeacher ? '发布后查看成绩' : '完成不同题型', body: isTeacher ? '学生交卷后，进入成绩管理查看客观题自动得分，并逐题批改填空、简答和编程题。' : '选择题和判断题直接在平台作答；编程题点击进入编程系统，在对应语言环境中编写、运行并提交代码。' },
      { title: isTeacher ? '维护比赛记录' : '关注进度', body: isTeacher ? '可查看本场积分榜、未提交名单和题目正确率；删除比赛前请确认相关记录不再需要。' : '任务公告栏会显示当前完成数量和提交状态。交卷前逐题检查，确认所有必答题都已完成。' },
    ],
  }
  if (route === '/oj') return {
    title: 'OJ 题库使用指南',
    intro: '题库适合按知识点刷题，也可以直接进入某道题的编程实验环境。',
    steps: [
      { title: isTeacher ? '查看全站题库' : '筛选题目', body: isTeacher ? '教师可以按语言、难度和知识点查看题目，用于备课或设计比赛；题库榜单展示注册学生的练习积分。' : '使用搜索、难度、语言和知识点筛选器缩小范围。题目列表会显示完成状态、难度和支持的编程语言。' },
      { title: '阅读题面', body: '打开题目后先看描述、输入输出格式和样例。把样例手算一遍，再开始写代码，能减少很多低级错误。' },
      { title: isTeacher ? '查看练习结果' : '运行和提交', body: isTeacher ? '教师端可查看题目完成情况和积分榜；学生端的代码由 OJ 自动评测，只有通过测试后才会计入完成。' : '在右侧代码区选择语言，点击运行检查样例，再点击提交进行评测。编程题支持 Python、C++ 等平台已配置的语言。' },
      { title: '向老师求助', body: '如果你卡在题目理解或报错上，可以点击问老师，把题目上下文带到班级私聊中。' },
    ],
  }
  if (route === '/knowledge') return {
    title: '课程资料使用指南',
    intro: '这里集中管理课件和资料，老师可以上传，学生可以在线预览或下载。',
    steps: [
      { title: '区分课件和资料', body: '课件用于课堂讲解，资料用于练习、参考和补充阅读。两个区域分开管理，查找时不需要在一堆文件里翻找。' },
      { title: '上传文件', body: '老师可以上传 Markdown、PDF、PPT、Word、图片和视频。上传后填写清晰的标题和说明，方便学生理解用途。' },
      { title: '在线预览', body: '点击文件旁的预览按钮，可以直接查看支持的文档内容；确认需要保存到本地时再点击下载。' },
      { title: '维护资料', body: '定期删除过期版本或在标题中注明版本和日期，避免学生打开旧课件。' },
    ],
  }
  return {
    title: '页面使用指南',
    intro: '这是当前页面的操作说明。',
    steps: [
      { title: '先看页面标题', body: '标题和顶部状态会告诉你当前所在的学习空间，页面内的主要操作都围绕这个目标排列。' },
      { title: '按区域操作', body: '左侧通常是导航和筛选，中间是主要内容，右侧或底部是详情、提交和反馈。' },
      { title: '遇到问题', body: '可以返回 AI 导师提问，也可以通过班级私聊联系老师。' },
    ],
  }
}

export function FloatingGuideBall({ route, role = 'user', courseName = '当前课程', studyMode = 'chat', onHome, onBack, onFeedback, onContact }: FloatingGuideBallProps) {
  const guideSize = 64
  const [expanded, setExpanded] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [position, setPosition] = useState({ x: 24, y: 24 })
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const guide = guideFor(route, role, courseName, studyMode)

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) drag.moved = true
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - guideSize - 8, event.clientX - drag.offsetX)),
        y: Math.max(8, Math.min(window.innerHeight - guideSize - 8, window.innerHeight - event.clientY - drag.offsetY)),
      })
    }
    const onUp = () => { suppressClickRef.current = !!dragRef.current?.moved; dragRef.current = null; document.body.classList.remove('is-dragging-guide-ball') }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  useEffect(() => {
    const onResize = () => {
      const next = { width: window.innerWidth, height: window.innerHeight }
      setViewport(next)
      setPosition((current) => ({
        x: Math.max(8, Math.min(next.width - guideSize - 8, current.x)),
        y: Math.max(8, Math.min(next.height - guideSize - 8, current.y)),
      }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: rect.bottom - event.clientY, startX: event.clientX, startY: event.clientY, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    document.body.classList.add('is-dragging-guide-ball')
  }
  const openGuide = () => { setExpanded(false); setGuideOpen(true) }
  const nearLeft = position.x < 116
  const nearRight = viewport.width - position.x - guideSize < 116
  const nearTop = viewport.height - position.y - guideSize < 116
  const edgeClasses = `${nearLeft ? 'is-left-anchored' : nearRight ? 'is-right-anchored' : 'is-centered-anchored'} ${nearTop ? 'is-top-anchored' : ''}`

  return <>
    <div className={`floating-guide ${expanded ? 'is-expanded' : ''} ${edgeClasses}`} style={{ left: position.x, bottom: position.y }}>
      <div className="floating-guide-actions" aria-label="快捷功能">
        <button type="button" className="floating-guide-action is-home" onClick={onHome} title="返回平台主页" aria-label="返回平台主页"><Home size={18} /><span>主页</span></button>
        <button type="button" className="floating-guide-action is-back" onClick={onBack} title="返回上个页面" aria-label="返回上个页面"><ArrowLeft size={18} /><span>返回</span></button>
        <button type="button" className="floating-guide-action is-guide" onClick={openGuide} title="查看当前页面教程" aria-label="查看当前页面教程"><BookOpen size={18} /><span>教程</span></button>
        <button type="button" className="floating-guide-action is-feedback" onClick={() => { setExpanded(false); onFeedback() }} title="提交意见反馈" aria-label="提交意见反馈"><MessageSquareText size={18} /><span>反馈</span></button>
        <button type="button" className="floating-guide-action is-contact" onClick={() => { setExpanded(false); onContact() }} title="联系我们" aria-label="联系我们"><Headset size={18} /><span>联系</span></button>
      </div>
      <button type="button" className="floating-guide-main" onPointerDown={startDrag} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return }; setExpanded((value) => !value) }} aria-expanded={expanded} aria-label={expanded ? '收起快捷功能' : '展开快捷功能'} title="拖动或点击展开快捷功能">
        {expanded ? <X size={25} /> : <Map size={25} />}
        <i aria-hidden="true" />
      </button>
    </div>
    {guideOpen && <div className="guide-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setGuideOpen(false) }}>
      <section className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="floating-guide-title">
        <header><div><span className="guide-dialog-icon"><BookOpen size={19} /></span><div><p>像素冒险手册</p><h2 id="floating-guide-title">{guide.title}</h2></div></div><button type="button" onClick={() => setGuideOpen(false)} aria-label="关闭教程"><X size={19} /></button></header>
        <p className="guide-dialog-intro">{guide.intro}</p>
        <ol>{guide.steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></li>)}</ol>
        <footer><span>完成一小步，再继续下一步。</span><button type="button" onClick={() => setGuideOpen(false)}>开始探索</button></footer>
      </section>
    </div>}
  </>
}
