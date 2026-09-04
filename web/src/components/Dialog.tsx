import { Maximize2, Minimize2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'small' | 'medium' | 'large'
  panelClassName?: string
  showMaximize?: boolean
}

export function Dialog({ open, title, onClose, children, footer, width = 'small', panelClassName = '', showMaximize = false }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const [maximized, setMaximized] = useState(false)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) setMaximized(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('input, textarea, button, [tabindex]')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = [...panelRef.current.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled'))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreRef.current?.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={panelRef} className={`dialog-panel dialog-${width} ${panelClassName} ${maximized ? 'is-maximized' : ''}`.trim()} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header className="dialog-head"><h2 id="dialog-title">{title}</h2><div className="dialog-window-actions">{showMaximize && <button type="button" onClick={() => setMaximized((value) => !value)} aria-label={maximized ? '还原窗口' : '放大窗口'} title={maximized ? '还原窗口' : '放大窗口'}>{maximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>}<button type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button></div></header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
