import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface MenuProps {
  open: boolean
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  label: string
  placement?: 'top' | 'bottom' | 'auto'
}

export function Menu({ open, anchor, onClose, children, label, placement = 'bottom' }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 8, left: 8, ready: false })

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) return
    const anchorRect = anchor.getBoundingClientRect()
    const menuRect = ref.current.getBoundingClientRect()
    const spaceAbove = anchorRect.top - 8
    const spaceBelow = window.innerHeight - anchorRect.bottom - 8
    const openAbove = placement === 'top' || (placement === 'auto' && spaceAbove >= menuRect.height + 6 && spaceAbove > spaceBelow)
    const wantedTop = openAbove ? anchorRect.top - menuRect.height - 6 : anchorRect.bottom + 6
    const top = Math.min(Math.max(8, wantedTop), Math.max(8, window.innerHeight - menuRect.height - 8))
    const wantedLeft = anchorRect.right - menuRect.width
    const left = Math.min(Math.max(8, wantedLeft), Math.max(8, window.innerWidth - menuRect.width - 8))
    setPosition({ top, left, ready: true })
  }, [open, anchor, placement, children])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus())
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !anchor?.contains(target)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); anchor?.focus(); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
      if (!items.length) return
      event.preventDefault()
      const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement))
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length
      items[next].focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', onKeyDown); window.removeEventListener('resize', onClose); window.removeEventListener('scroll', onClose, true) }
  }, [open, anchor, onClose])
  if (!open || !anchor) return null
  return createPortal(
    <div ref={ref} className="app-menu" role="menu" aria-label={label} style={{ top: position.top, left: position.left, visibility: position.ready ? 'visible' : 'hidden' }}>{children}</div>,
    document.body,
  )
}
