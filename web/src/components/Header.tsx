import { CircleUserRound, Headset, LogOut, MessageSquareText, SlidersHorizontal, UserRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { Menu } from './Menu'
import type { UserCenterTab } from './UserCenterDialog'
import { AvatarContent } from './AvatarContent'

interface HeaderProps {
  currentUser: string
  role: string
  userAvatar: string
  onFeedback: () => void
  onContact: () => void
  onLogin: () => void
  onLogout: () => void
  onUserCenter: (tab: UserCenterTab) => void
  onNavigate: (path: string) => void
}

export function Header({ currentUser, role, userAvatar, onFeedback, onContact, onLogin, onLogout, onUserCenter, onNavigate }: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLButtonElement>(null)
  const act = (callback: () => void) => { setProfileOpen(false); callback() }

  return (
    <header className="app-header">
      <div className="header-inner">
        <button className="brand-block brand-button" type="button" aria-label="返回平台主页" onClick={() => onNavigate('/')}>
          <span className="brand-mark" aria-hidden="true">启</span>
          <span><strong>启码 AI 学伴</strong><small>少儿编程智能学习平台</small></span>
        </button>
        <nav className="header-actions" aria-label="账号入口">
          <button
            ref={profileRef}
            type="button"
            className="account-action"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => currentUser ? setProfileOpen((value) => !value) : onLogin()}
          >
            <span className="account-avatar">{currentUser ? <AvatarContent value={userAvatar} fallback={<UserRound size={18} />} /> : <UserRound size={18} />}</span><span className="account-name">{currentUser || '登录'}</span>
          </button>
          <Menu open={profileOpen} anchor={profileRef.current} onClose={() => setProfileOpen(false)} label="账号菜单">
            <div className="menu-user"><strong>{currentUser}</strong><small>{role === 'user' ? '学生账号' : role === 'teacher' ? '教师账号' : '开发者账号'}</small></div>
            {role !== 'developer' && <button role="menuitem" type="button" onClick={() => act(() => onUserCenter('account'))}><CircleUserRound size={16} />用户中心</button>}
            {role !== 'developer' && <button role="menuitem" type="button" onClick={() => act(onFeedback)}><MessageSquareText size={16} />意见反馈</button>}
            {role !== 'developer' && <button role="menuitem" type="button" onClick={() => act(onContact)}><Headset size={16} />联系我们</button>}
            {role !== 'developer' && <button role="menuitem" type="button" onClick={() => act(() => onUserCenter('settings'))}><SlidersHorizontal size={16} />设置</button>}
            <button role="menuitem" type="button" className="danger-menu-item" onClick={() => act(onLogout)}><LogOut size={16} />退出登录</button>
          </Menu>
        </nav>
      </div>
    </header>
  )
}
