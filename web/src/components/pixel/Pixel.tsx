import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

const join = (...values: Array<string | undefined | false>) => values.filter(Boolean).join(' ')

export function PixelPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={join('pixel-panel', className)} {...props} />
}

export function PixelCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={join('pixel-card', className)} {...props} />
}

export function PixelButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={join('pixel-button', className)} {...props} />
}

export function PixelBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={join('pixel-badge', className)} {...props} />
}

export function PixelIcon({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <span className={join('pixel-icon', className)} aria-label={label} aria-hidden={label ? undefined : true}>{children}</span>
}
