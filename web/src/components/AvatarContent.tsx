import type { ReactNode } from 'react'

interface AvatarContentProps {
  value?: string | null
  fallback?: ReactNode
  alt?: string
}

export function AvatarContent({ value, fallback = '👤', alt = '' }: AvatarContentProps) {
  const avatar = String(value || '')
  const isImage = avatar.startsWith('/static/') || avatar.startsWith('data:image/') || /^https?:\/\//.test(avatar)
  return isImage ? <img className="avatar-content-image" src={avatar} alt={alt} /> : <>{avatar || fallback}</>
}
