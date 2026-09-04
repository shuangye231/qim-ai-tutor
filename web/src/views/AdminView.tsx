import { KeyRound, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { apiFetch, jsonBody } from '../api/client'
import { Dialog } from '../components/Dialog'

export function AdminView({ onNotice }: { onNotice: (text: string) => void }) {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('adminKey') || '')
  const [data, setData] = useState<any>(null)
  const [label, setLabel] = useState('External client')
  const [owner, setOwner] = useState('admin')
  const [createdKey, setCreatedKey] = useState('')
  const [revokePrefix, setRevokePrefix] = useState('')
  const [error, setError] = useState('')
  const headers = () => ({ 'X-Admin-Key': adminKey })
  const load = async () => {
    setError('')
    try { const result = await apiFetch<any>('/api/admin/overview', { headers: headers() }); setData(result); sessionStorage.setItem('adminKey', adminKey) }
    catch (e) { setError(e instanceof Error ? e.message : '读取失败') }
  }
  return <section className="route-view admin-view" id="main-content">
    <header className="route-view-head"><div><h1>系统管理</h1><p>低频管理入口 · API 密钥只在创建时显示一次</p></div><button onClick={load}><RefreshCw size={16} />刷新</button></header>
    <div className="admin-auth"><label>管理密钥<input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} /></label><button onClick={load}><KeyRound size={16} />验证并进入</button></div>
    {error && <p className="route-error">{error}</p>}
    {data && <div className="admin-content"><div className="metric-grid"><div><strong>{data.users}</strong><span>用户</span></div><div><strong>{data.queries}</strong><span>提问</span></div><div><strong>{data.tokens}</strong><span>Token</span></div></div><section className="content-section"><h2>创建 API Key</h2><div className="admin-create"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="用途标签" /><input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="所有者" /><button onClick={async () => { try { const result = await apiFetch<any>('/api/admin/keys', { ...jsonBody({ label, owner }), headers: headers() }); setCreatedKey(result.api_key); onNotice('API Key 已创建') } catch (e) { setError(e instanceof Error ? e.message : '创建失败') } }}>创建密钥</button></div>{createdKey && <code className="created-api-key">{createdKey}</code>}</section><section className="content-section"><h2>现有密钥</h2>{data.api_keys.map((item: any) => <article className="record-row" key={item.prefix}><div><strong>{item.label}</strong><small>{item.prefix} · {item.owner} · {item.active ? '有效' : '已撤销'}</small></div>{item.active && <button className="danger-icon" onClick={() => setRevokePrefix(item.prefix)}><Trash2 size={15} /></button>}</article>)}</section></div>}
    <Dialog open={!!revokePrefix} title="撤销 API Key" onClose={() => setRevokePrefix('')} footer={<><button onClick={() => setRevokePrefix('')}>取消</button><button className="dialog-danger" onClick={async () => { try { await apiFetch(`/api/admin/keys/${encodeURIComponent(revokePrefix)}`, { method: 'DELETE', headers: headers() }); setRevokePrefix(''); onNotice('API Key 已撤销'); await load() } catch (e) { setError(e instanceof Error ? e.message : '撤销失败') } }}>确认撤销</button></>}>撤销后，使用该密钥的外部客户端将立即无法访问。</Dialog>
  </section>
}
