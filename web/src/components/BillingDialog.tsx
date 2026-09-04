import { Headset, X } from 'lucide-react'
import type { Quota } from '../types'

interface BillingDialogProps {
  open: boolean
  quota: Quota | null
  onClose: () => void
  onPaid?: (quota: Quota) => void
}

export function BillingDialog({ open, quota, onClose }: BillingDialogProps) {
  if (!open) return null
  return <div className="billing-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="billing-panel beta-billing-panel" role="dialog" aria-modal="true" aria-labelledby="billing-title">
      <header><div><small>学习次数</small><h2 id="billing-title">当前为内测阶段</h2></div><button type="button" onClick={onClose} aria-label="关闭提示"><X size={20} /></button></header>
      <div className="beta-billing-content"><span className="beta-billing-icon"><Headset size={28} /></span><strong>暂不支持在线购买</strong><p>如需增加学习次数，请联系您的机构老师充值。当前可用次数：<b>{quota?.total_remaining ?? 0}</b> 次</p></div>
      <footer><button type="button" className="billing-beta-close" onClick={onClose}>知道了</button></footer>
    </section>
  </div>
}
