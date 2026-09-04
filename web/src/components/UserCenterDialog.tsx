import { BookOpenCheck, Bot, Building2, CircleUserRound, CreditCard, KeyRound, Palette, UserRound, UserX } from 'lucide-react'
import type { Quota } from '../types'
import { Dialog } from './Dialog'
import { AvatarContent } from './AvatarContent'

export type UserCenterTab = 'account' | 'usage' | 'settings' | 'security'

interface UserCenterDialogProps {
  open: boolean
  tab: UserCenterTab
  username: string
  role: string
  userAvatar: string
  aiAvatar: string
  quota: Quota | null
  stats: any
  onClose: () => void
  onTabChange: (tab: UserCenterTab) => void
  onBuy: () => void
  onAvatar: (kind: 'user' | 'ai') => void
  onPassword: () => void
  onDeleteAccount: () => void
  onNavigate: (path: string) => void
}

const number = (value: unknown) => new Intl.NumberFormat('zh-CN').format(Number(value) || 0)

export function UserCenterDialog(props: UserCenterDialogProps) {
  const tabs = [
    { id: 'account' as const, label: '账户概览', icon: CircleUserRound },
    { id: 'usage' as const, label: '用量与套餐', icon: CreditCard },
    { id: 'settings' as const, label: '个性化设置', icon: Palette },
    { id: 'security' as const, label: '账号安全', icon: KeyRound },
  ]
  const leave = (path: string) => { props.onClose(); props.onNavigate(path) }

  return <Dialog open={props.open} title="用户中心" width="large" panelClassName="user-center-dialog" onClose={props.onClose}>
    <div className="user-center-layout">
      <aside className="user-center-sidebar">
        <div className="user-center-profile"><span><AvatarContent value={props.userAvatar} /></span><strong>{props.username}</strong><small>{props.role === 'user' ? '学员账号' : '机构账号'}</small></div>
        <nav aria-label="用户中心导航">
          {tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={props.tab === id ? 'is-active' : ''} aria-current={props.tab === id ? 'page' : undefined} onClick={() => props.onTabChange(id)}><Icon size={17} />{label}</button>)}
        </nav>
        <div className="user-center-shortcuts">
          <button type="button" onClick={() => leave('/learning')}><BookOpenCheck size={17} />学习管理</button>
          {props.role !== 'user' && <button type="button" onClick={() => leave('/knowledge')}><Building2 size={17} />课件管理</button>}
        </div>
      </aside>

      <section className="user-center-content">
        {props.tab === 'account' && <>
          <header className="user-center-title"><p>账户概览</p><h2>欢迎回来，{props.username}</h2><span>在这里统一管理你的学习账号和常用入口。</span></header>
          <div className="user-center-account-row"><span className="user-center-large-avatar"><AvatarContent value={props.userAvatar} /></span><div><strong>{props.username}</strong><small>{props.role === 'user' ? '启码 AI 学伴 · 学员' : '启码 AI 学伴 · 机构'}</small></div></div>
          <dl className="user-center-details"><div><dt>账号类型</dt><dd>{props.role === 'user' ? '学员账号' : '机构账号'}</dd></div><div><dt>当前课程</dt><dd>Scratch、Python、C++</dd></div><div><dt>账号状态</dt><dd><span className="user-center-online" />正常使用</dd></div></dl>
          <button type="button" className="user-center-primary" onClick={() => leave('/study')}><Bot size={18} />进入单人学习</button>
        </>}

        {props.tab === 'usage' && <>
          <header className="user-center-title"><p>用量与次数</p><h2>学习次数</h2><span>当前为内测阶段，次数不足时请联系机构老师充值。</span></header>
          <div className="user-center-usage-strip"><span><strong>{props.quota?.daily_remaining ?? 0}</strong><small>今日免费剩余</small></span><span><strong>{props.quota?.paid_remaining ?? 0}</strong><small>已购次数</small></span><span><strong>{props.quota?.total_remaining ?? 0}</strong><small>当前可用</small></span></div>
          <div className="user-center-progress"><div><strong>今日免费用量</strong><span>{props.quota?.daily_used ?? 0} / {props.quota?.daily_limit ?? 5}</span></div><progress max={props.quota?.daily_limit || 5} value={props.quota?.daily_used || 0} /></div>
          <div className="user-center-learning-stats"><h3>学习统计</h3>{!props.stats ? <p>正在读取统计...</p> : props.stats.error ? <p className="dialog-error">{props.stats.error}</p> : <div><span><strong>{number(props.stats.user?.today_queries)}</strong><small>今日提问</small></span><span><strong>{number(props.stats.user?.total_queries)}</strong><small>累计提问</small></span><span><strong>{number(props.stats.user?.total_tokens)}</strong><small>累计 Token</small></span></div>}</div>
          <button type="button" className="user-center-primary" onClick={props.onBuy}><CreditCard size={18} />联系机构老师充值</button>
        </>}

        {props.tab === 'settings' && <>
          <header className="user-center-title"><p>个性化设置</p><h2>外观与头像</h2><span>头像保存在本地服务中，登录后会自动同步显示。</span></header>
          <div className="user-center-setting-row"><span className="user-center-setting-icon"><AvatarContent value={props.userAvatar} /></span><div><strong>用户头像</strong><small>显示在顶栏、群聊和你的消息旁</small></div><button type="button" onClick={() => props.onAvatar('user')}>更换</button></div>
          <div className="user-center-setting-row"><span className="user-center-setting-icon"><AvatarContent value={props.aiAvatar} fallback="🤖" /></span><div><strong>AI 学伴头像</strong><small>显示在 AI 回答和思考状态旁</small></div><button type="button" onClick={() => props.onAvatar('ai')}>更换</button></div>
        </>}

        {props.tab === 'security' && <>
          <header className="user-center-title"><p>账号安全</p><h2>登录与密码</h2><span>定期更新密码，避免与其他平台使用相同密码。</span></header>
          <div className="user-center-setting-row"><span className="user-center-setting-icon"><UserRound size={20} /></span><div><strong>登录账号</strong><small>{props.username}</small></div><span className="user-center-readonly">不可修改</span></div>
          <div className="user-center-setting-row"><span className="user-center-setting-icon"><KeyRound size={20} /></span><div><strong>登录密码</strong><small>使用原密码验证后可更新</small></div><button type="button" onClick={props.onPassword}>修改密码</button></div>
          {props.role !== 'developer' && <div className="user-center-danger-zone"><div><strong><UserX size={18} />注销账号</strong><small>注销后将永久删除账号、学习记录、班级关系和提交记录，无法恢复。</small></div><button type="button" onClick={props.onDeleteAccount}>注销账号</button></div>}
        </>}
      </section>
    </div>
  </Dialog>
}
