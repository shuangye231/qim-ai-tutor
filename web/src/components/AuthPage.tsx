import { ArrowRight, Building2, Code2, Eye, EyeOff, GraduationCap, Leaf } from 'lucide-react'
import { FormEvent, useState } from 'react'
import type { LoginPortal } from '../hooks/useAuth'
import { PixelFarmScene } from './PixelFarmScene'

interface AuthPageProps {
  onLogin: (username: string, password: string, portal: LoginPortal, institutionCode: string) => Promise<void>
  onRegister: (username: string, password: string) => Promise<void>
}

export function AuthPage({ onLogin, onRegister }: AuthPageProps) {
  const [entry, setEntry] = useState<LoginPortal>('student')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [institutionCode, setInstitutionCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!username.trim()) { setError('请输入账号'); return }
    if (password.length < 8) { setError('密码至少 8 位'); return }
    setBusy(true)
    try {
      if (mode === 'register') {
        await onRegister(username.trim(), password)
        setMode('login')
        setPassword('')
        setMessage('账号已创建，请登录')
      } else {
        if (entry === 'teacher' && !institutionCode.trim()) { setError('请输入机构代码'); return }
        await onLogin(username.trim(), password, entry, institutionCode.trim().toUpperCase())
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '操作失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="启码 AI 学伴介绍">
        <PixelFarmScene />
        <div className="auth-brand"><strong>启码 AI 学伴</strong><Leaf size={24} /><small>少儿编程智能学习平台</small></div>
        <div className="auth-story-copy">
          <h1>每一个问题，<br />都通往下一步。</h1>
        </div>
        <div className="pixel-walker" aria-hidden="true"><span>◆</span></div>
        <p className="auth-story-foot">每天进步一点点<br />未来创造无限可能</p>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-shell">
          <div className="auth-entry-tabs" aria-label="选择登录入口">
            <button type="button" className={entry === 'student' ? 'is-active' : ''} onClick={() => setEntry('student')}><GraduationCap size={16} /> 学生</button>
            <button type="button" className={entry === 'teacher' ? 'is-active' : ''} onClick={() => { setEntry('teacher'); setMode('login') }}><Building2 size={16} /> 教师</button>
            <button type="button" className={entry === 'developer' ? 'is-active' : ''} onClick={() => { setEntry('developer'); setMode('login') }}><Code2 size={16} /> 开发者</button>
          </div>

          <header>
            <h2>{mode === 'login' ? '欢迎回来' : '创建学员账号'}</h2>
            <span>{entry === 'student' ? '继续你的编程学习之旅' : entry === 'teacher' ? '管理机构教学空间' : '管理平台机构代码'}</span>
          </header>

          <form className="auth-form" onSubmit={submit}>
            <label>账号<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder={entry === 'student' ? '请输入学生账号' : entry === 'teacher' ? '请输入教师账号' : '请输入开发者账号'} /></label>
            <label>密码<span className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="至少 8 位" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            {entry === 'teacher' && <label>机构代码<input value={institutionCode} onChange={(event) => setInstitutionCode(event.target.value.toUpperCase())} maxLength={20} autoComplete="off" placeholder="请输入开发者分配的机构代码" /></label>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            {message && <p className="auth-success" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? '正在处理...' : <>{mode === 'login' ? '进入学习空间' : '创建账号'}<ArrowRight size={18} /><i aria-hidden="true" /></>}</button>
          </form>

          {entry === 'student' && <p className="auth-switch">{mode === 'login' ? '还没有账号？' : '已经有账号？'}<button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage('') }}>{mode === 'login' ? '注册学员账号' : '返回登录'}</button></p>}
          <p className="auth-legal">登录即表示你已阅读并同意《服务条款》和《隐私政策》</p>
        </div>
      </section>
    </main>
  )
}
