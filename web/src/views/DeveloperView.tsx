import { Building2, Check, KeyRound, LayoutDashboard, Plus, RefreshCw, Search, Settings2, TestTube2, Trash2, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { Dialog } from '../components/Dialog'

interface Institution { id: string; code: string; name: string; active: boolean; teacher_count: number; created_at: string }
interface AccountQuota { username: string; role: string; paid_remaining: number; total_remaining: number; daily_remaining: number }
interface UserAiKey { username: string; role: string; has_custom_key: boolean; api_key: string; masked_key: string; updated_at?: string }
interface AiSettings { scope?: string; api_url: string; api_key: string; model: string; temperature: number; max_tokens: number; top_p: number; extra: Record<string, unknown>; updated_at?: string }
type Section = 'overview' | 'institutions' | 'accounts'

const navItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: '控制台概览', icon: LayoutDashboard },
  { id: 'institutions', label: '机构管理', icon: Building2 },
]

export function DeveloperView({ onNotice }: { onNotice: (message: string) => void }) {
  const [section, setSection] = useState<Section>('overview')
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [accounts, setAccounts] = useState<AccountQuota[]>([])
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({})
  const [keys, setKeys] = useState<UserAiKey[]>([])
  const [busy, setBusy] = useState(false)
  const [savingAccount, setSavingAccount] = useState('')
  const [deletingAccount, setDeletingAccount] = useState('')
  const [accountToDelete, setAccountToDelete] = useState<AccountQuota | null>(null)
  const [savingKey, setSavingKey] = useState('')
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [defaultSettings, setDefaultSettings] = useState<AiSettings | null>(null)
  const [settingsScope, setSettingsScope] = useState<'default' | string>('default')
  const [settingsDraft, setSettingsDraft] = useState<AiSettings | null>(null)
  const [settingsExtraText, setSettingsExtraText] = useState('{}')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsTest, setSettingsTest] = useState('')
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null)
  const [accountRole, setAccountRole] = useState<'teacher' | 'student'>('teacher')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const loadInstitutions = async () => { setInstitutions((await apiFetch<{ institutions: Institution[] }>('/api/developer/institutions')).institutions) }
  const loadAccounts = async () => { const result = await apiFetch<{ accounts: AccountQuota[] }>('/api/developer/institutions/accounts'); setAccounts(result.accounts); setQuotaDrafts(Object.fromEntries(result.accounts.map((account) => [account.username, String(account.paid_remaining)]))) }
  const loadKeys = async () => { setKeys((await apiFetch<{ accounts: UserAiKey[] }>('/api/developer/institutions/ai-keys')).accounts) }
  const loadInstitutionAccounts = async (institution: Institution, role: 'teacher' | 'student') => {
    const query = `?institution_code=${encodeURIComponent(institution.code)}&role=${role}`
    const [quotaResult, keyResult] = await Promise.all([
      apiFetch<{ accounts: AccountQuota[] }>(`/api/developer/institutions/accounts${query}`),
      apiFetch<{ accounts: UserAiKey[] }>(`/api/developer/institutions/ai-keys${query}`),
    ])
    setAccounts(quotaResult.accounts)
    setQuotaDrafts(Object.fromEntries(quotaResult.accounts.map((account) => [account.username, String(account.paid_remaining)])))
    setKeys(keyResult.accounts)
  }
  const loadDefaultSettings = async () => { setDefaultSettings((await apiFetch<{ settings: AiSettings }>('/api/developer/institutions/ai-settings/default')).settings) }
  const load = async () => { setBusy(true); setError(''); try { await Promise.all([loadInstitutions(), loadAccounts(), loadKeys(), loadDefaultSettings()]) } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '读取管理数据失败') } finally { setBusy(false) } }
  useEffect(() => { void load() }, [])

  const create = async () => { setBusy(true); setError(''); try { await apiFetch('/api/developer/institutions', { method: 'POST', body: JSON.stringify({ name, code }) }); setName(''); setCode(''); onNotice('机构代码已创建'); await loadInstitutions() } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '创建失败') } finally { setBusy(false) } }
  const toggle = async (institution: Institution) => { setBusy(true); setError(''); try { await apiFetch(`/api/developer/institutions/${encodeURIComponent(institution.code)}/status`, { method: 'PUT', body: JSON.stringify({ active: !institution.active }) }); onNotice(institution.active ? '机构代码已停用' : '机构代码已启用'); await loadInstitutions() } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '操作失败') } finally { setBusy(false) } }
  const saveQuota = async (account: AccountQuota) => { const credits = Number(quotaDrafts[account.username]); if (!Number.isInteger(credits) || credits < 0) { setError('次数必须是大于等于 0 的整数'); return }; setSavingAccount(account.username); setError(''); try { await apiFetch(`/api/developer/institutions/accounts/${encodeURIComponent(account.username)}/quota`, { method: 'PUT', body: JSON.stringify({ credits, institution_code: selectedInstitution?.code || '' }) }); onNotice(`${account.username} 的学习次数已设置为 ${credits} 次`); if (selectedInstitution) await loadInstitutionAccounts(selectedInstitution, accountRole); else await loadAccounts() } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '设置账号次数失败') } finally { setSavingAccount('') } }
  const accountQuery = selectedInstitution ? `?institution_code=${encodeURIComponent(selectedInstitution.code)}` : ''
  const deleteAccount = async () => { if (!accountToDelete) return; const account = accountToDelete; setDeletingAccount(account.username); setError(''); try { await apiFetch(`/api/developer/institutions/accounts/${encodeURIComponent(account.username)}${accountQuery}`, { method: 'DELETE' }); setAccountToDelete(null); onNotice(`${account.username} 已注销`); if (selectedInstitution) await loadInstitutionAccounts(selectedInstitution, accountRole); else await Promise.all([loadAccounts(), loadKeys()]) } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '注销账号失败') } finally { setDeletingAccount('') } }
  const clearKey = async (account: UserAiKey) => { setSavingKey(account.username); setError(''); try { await apiFetch(`/api/developer/institutions/ai-keys/${encodeURIComponent(account.username)}${accountQuery}`, { method: 'DELETE' }); onNotice(`${account.username} 已恢复使用服务器默认 Key`); if (selectedInstitution) await loadInstitutionAccounts(selectedInstitution, accountRole); else await loadKeys() } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '恢复默认 Key 失败') } finally { setSavingKey('') } }
  const openSettings = async (scope: 'default' | string) => {
    setSettingsScope(scope); setSettingsTest(''); setError('')
    try {
      const result = scope === 'default'
        ? { settings: defaultSettings || (await apiFetch<{ settings: AiSettings }>('/api/developer/institutions/ai-settings/default')).settings }
        : await apiFetch<{ settings: AiSettings }>(`/api/developer/institutions/ai-settings/accounts/${encodeURIComponent(scope)}${accountQuery}`)
      if (result.settings) {
        const draft = { ...result.settings, extra: result.settings.extra || {} }
        setSettingsDraft(draft)
        setSettingsExtraText(JSON.stringify(draft.extra, null, 2))
        setSettingsOpen(true)
      }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '读取 API 设置失败') }
  }
  const updateSettings = (field: keyof AiSettings, value: string | number) => setSettingsDraft((current) => current ? { ...current, [field]: value } : current)
  const saveSettings = async () => {
    if (!settingsDraft) return
    setSettingsBusy(true); setSettingsTest(''); setError('')
    try {
      const extra = JSON.parse(settingsExtraText)
      if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('其他 API 参数必须是 JSON 对象')
      const path = settingsScope === 'default' ? '/api/developer/institutions/ai-settings/default' : `/api/developer/institutions/ai-settings/accounts/${encodeURIComponent(settingsScope)}`
      await apiFetch(path, { method: 'PUT', body: JSON.stringify({ ...settingsDraft, extra, institution_code: selectedInstitution?.code || '' }) })
      if (settingsScope === 'default') await loadDefaultSettings(); else await loadKeys()
      onNotice('API 设置已更新'); setSettingsOpen(false)
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '保存 API 设置失败') } finally { setSettingsBusy(false) }
  }
  const testSettings = async () => {
    if (!settingsDraft) return
    setSettingsBusy(true); setSettingsTest('正在测试连接…'); setError('')
    try {
      const extra = JSON.parse(settingsExtraText)
      if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('其他 API 参数必须是 JSON 对象')
      const result = await apiFetch<{ message: string; reply?: string }>('/api/developer/institutions/ai-settings/test', { method: 'POST', body: JSON.stringify({ ...settingsDraft, extra }) })
      setSettingsTest(`${result.message}${result.reply ? ` · ${result.reply}` : ''}`)
    } catch (requestError) { setSettingsTest(''); setError(requestError instanceof Error ? requestError.message : '连接测试失败') } finally { setSettingsBusy(false) }
  }

  const sectionTitle = useMemo(() => section === 'accounts' ? '机构账号管理' : navItems.find((item) => item.id === section)?.label || '控制台概览', [section])
  const customKeyCount = keys.filter((item) => item.has_custom_key).length
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredInstitutions = useMemo(() => {
    if (!normalizedSearch) return institutions
    return institutions.filter((institution) => `${institution.name} ${institution.code}`.toLowerCase().includes(normalizedSearch))
  }, [institutions, normalizedSearch])
  const filteredAccounts = useMemo(() => {
    if (!normalizedSearch) return accounts
    return accounts.filter((account) => `${account.username} ${account.role === 'teacher' ? '教师 教师账号' : '学生 学生账号'}`.toLowerCase().includes(normalizedSearch))
  }, [accounts, normalizedSearch])
  const keyByUsername = useMemo(() => new Map(keys.map((key) => [key.username, key])), [keys])
  const openInstitutionAccounts = async (institution: Institution) => {
    setSelectedInstitution(institution); setAccountRole('teacher'); setSection('accounts'); setSearchTerm(''); setError(''); setBusy(true)
    try { await loadInstitutionAccounts(institution, 'teacher') } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '读取机构账号失败') } finally { setBusy(false) }
  }
  const changeAccountRole = async (role: 'teacher' | 'student') => {
    if (!selectedInstitution || role === accountRole) return
    setAccountRole(role); setError(''); setBusy(true)
    try { await loadInstitutionAccounts(selectedInstitution, role) } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '读取机构账号失败') } finally { setBusy(false) }
  }
  const searchPlaceholder = section === 'institutions' ? '搜索机构名称或机构代码' : '搜索账号名称或角色'
  const clearSearch = () => {
    setSearchTerm('')
    if (searchInputRef.current) searchInputRef.current.value = ''
  }

  return <main className="developer-view" id="main-content">
    <header className="developer-head"><div><p>QIMA ADMIN WORKSPACE</p><h1>{sectionTitle}</h1><span>启码 AI 学伴 · 账号、机构与 AI 服务配置</span></div><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={16} />刷新</button></header>
    <div className="developer-shell"><nav className="developer-nav" aria-label="管理分类"><div className="developer-nav-title"><Settings2 size={16} /><span>管理菜单</span></div>{navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={section === id ? 'is-active' : ''} onClick={() => { setSection(id); setSelectedInstitution(null); setSearchTerm(''); setError('') }}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <section className="developer-content">{section !== 'overview' && <div className="developer-search"><Search size={18} aria-hidden="true" /><input ref={searchInputRef} name="developer-search" autoComplete="off" spellCheck={false} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} /><button type="button" disabled={!searchTerm} tabIndex={searchTerm ? 0 : -1} onPointerDown={(event) => { if (!searchTerm) return; event.preventDefault(); clearSearch() }} onClick={clearSearch} aria-label="清除搜索"><X size={16} /></button></div>}{error && <p className="developer-error" role="alert"><X size={15} />{error}</p>}
        {section === 'overview' && <section className="developer-overview"><div className="developer-welcome"><span className="developer-welcome-icon">✦</span><div><h2>欢迎回来，开发者</h2><p>这里可以集中管理启码平台的机构、账号次数和用户 AI 服务。</p></div></div><div className="developer-stat-grid"><article><Building2 size={19} /><strong>{institutions.length}</strong><span>已创建机构</span></article><article><UsersRound size={19} /><strong>{accounts.length}</strong><span>可管理账号</span></article><article><KeyRound size={19} /><strong>{customKeyCount}</strong><span>已配置专属 Key</span></article></div><div className="developer-tip"><KeyRound size={18} /><div><strong>Key 使用规则</strong><p>用户配置了专属 Key 时优先使用；没有配置或已清除时，自动使用服务器默认 Key。</p></div></div></section>}
        {section === 'institutions' && <><section className="developer-create"><div><Building2 size={20} /><span><strong>创建机构</strong><small>代码创建后可分配给该机构的教师</small></span></div><label>机构名称<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：启码少儿编程中心" /></label><label>机构代码<input value={code} maxLength={20} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="例如：QIMA-001" /></label><button type="button" onClick={() => void create()} disabled={busy || !name.trim() || !code.trim()}><Plus size={16} />创建机构代码</button></section><section className="developer-list developer-institution-list"><header><h2>已创建机构</h2><span>{normalizedSearch ? `${filteredInstitutions.length} / ${institutions.length} 个` : `${institutions.length} 个`}</span></header>{filteredInstitutions.map((institution) => <article key={institution.id}><span className="developer-institution-icon"><Building2 size={18} /></span><div><strong>{institution.name}</strong><small>{institution.teacher_count} 名教师 · {new Date(institution.created_at).toLocaleDateString('zh-CN')}</small></div><button type="button" className="developer-institution-accounts" onClick={() => void openInstitutionAccounts(institution)} disabled={busy}><UsersRound size={15} />机构账号管理</button><code>{institution.code}</code><button type="button" className={institution.active ? 'is-active' : ''} onClick={() => void toggle(institution)} disabled={busy}>{institution.active ? '停用' : '启用'}</button></article>)}{!filteredInstitutions.length && <p className="developer-empty">没有找到匹配的机构</p>}</section></>}
        {section === 'accounts' && selectedInstitution && <><section className="developer-account-context"><button type="button" onClick={() => { setSection('institutions'); setSelectedInstitution(null); setSearchTerm('') }}>返回机构管理</button><div><span>{selectedInstitution.code}</span><h2>{selectedInstitution.name}</h2><p>选择账号类型后，可独立管理学习次数和用户 API 配置。</p></div></section><div className="developer-role-tabs" role="tablist" aria-label="账号类型"><button type="button" role="tab" aria-selected={accountRole === 'teacher'} className={accountRole === 'teacher' ? 'is-active' : ''} onClick={() => void changeAccountRole('teacher')}><UsersRound size={16} />教师账号</button><button type="button" role="tab" aria-selected={accountRole === 'student'} className={accountRole === 'student' ? 'is-active' : ''} onClick={() => void changeAccountRole('student')}><UsersRound size={16} />学生账号</button></div><section className="developer-list developer-accounts"><header><div><h2>{accountRole === 'teacher' ? '教师账号管理' : '学生账号管理'}</h2><p>管理当前机构内账号的可用次数、专属 API 与注销操作</p></div><span>{normalizedSearch ? `${filteredAccounts.length} / ${accounts.length} 个账号` : `${accounts.length} 个账号`}</span></header>{filteredAccounts.map((account) => { const key = keyByUsername.get(account.username); return <article key={account.username}><span className="developer-account-avatar"><UsersRound size={17} /></span><div><strong>{account.username}</strong><small>{accountRole === 'teacher' ? '教师账号' : '学生账号'} · 今日免费剩余 {account.daily_remaining} 次</small></div><label><span>可用次数</span><input type="number" min="0" max="1000000" value={quotaDrafts[account.username] ?? ''} onChange={(event) => setQuotaDrafts((current) => ({ ...current, [account.username]: event.target.value }))} /></label><div className="developer-account-actions"><button type="button" className="is-active" onClick={() => void saveQuota(account)} disabled={savingAccount === account.username || deletingAccount === account.username}><Check size={14} />{savingAccount === account.username ? '保存中' : '设置次数'}</button><button type="button" onClick={() => void openSettings(account.username)} disabled={deletingAccount === account.username}><KeyRound size={14} />{key?.has_custom_key ? 'API 已设置' : '设置 API'}</button>{key?.has_custom_key && <button type="button" className="developer-key-clear" onClick={() => void clearKey(key)} disabled={savingKey === account.username}>恢复默认</button>}<button type="button" className="developer-account-delete" onClick={() => setAccountToDelete(account)} disabled={savingAccount === account.username || deletingAccount === account.username}><Trash2 size={14} />注销</button></div></article>})}{!filteredAccounts.length && <p className="developer-empty">当前机构没有{accountRole === 'teacher' ? '教师' : '学生'}账号</p>}</section></>}
      </section>
    </div>
    <Dialog open={settingsOpen} title={settingsScope === 'default' ? '默认 API 设置' : `${settingsScope} 的 API 设置`} onClose={() => setSettingsOpen(false)} width="medium" panelClassName="developer-settings-dialog">
      {settingsDraft && <div className="developer-settings-form"><p className="developer-settings-intro">填写后可立即测试连接，保存后会应用到对应账号的 AI 请求。</p><label>API URL<input value={settingsDraft.api_url} onChange={(event) => updateSettings('api_url', event.target.value)} placeholder="https://api.example.com/v1" /></label><label>API Key<input type="text" value={settingsDraft.api_key} onChange={(event) => updateSettings('api_key', event.target.value)} placeholder="输入 API Key" /></label><div className="developer-settings-grid"><label>模型<input value={settingsDraft.model} onChange={(event) => updateSettings('model', event.target.value)} placeholder="模型名称" /></label><label>温度<input type="number" min="0" max="2" step="0.1" value={settingsDraft.temperature} onChange={(event) => updateSettings('temperature', Number(event.target.value))} /></label><label>最大 Token<input type="number" min="0" step="1" value={settingsDraft.max_tokens} onChange={(event) => updateSettings('max_tokens', Number(event.target.value))} /></label><label>Top P<input type="number" min="0" max="1" step="0.1" value={settingsDraft.top_p} onChange={(event) => updateSettings('top_p', Number(event.target.value))} /></label></div><label>其他 API 参数（JSON）<textarea value={settingsExtraText} onChange={(event) => setSettingsExtraText(event.target.value)} placeholder={'例如：{"response_format":{"type":"json_object"}}'} /></label>{settingsTest && <p className="developer-settings-test" role="status"><TestTube2 size={16} />{settingsTest}</p>}{error && <p className="developer-error" role="alert"><X size={15} />{error}</p>}<div className="developer-settings-footer"><button type="button" className="developer-test-button" onClick={() => void testSettings()} disabled={settingsBusy}><TestTube2 size={16} />测试连接</button><button type="button" className="developer-save-button" onClick={() => void saveSettings()} disabled={settingsBusy}><Check size={16} />{settingsBusy ? '处理中…' : '保存设置'}</button></div></div>}
    </Dialog>
    <Dialog open={!!accountToDelete} title="注销账号" onClose={() => deletingAccount || setAccountToDelete(null)} footer={<><button type="button" onClick={() => setAccountToDelete(null)} disabled={!!deletingAccount}>取消</button><button type="button" className="dialog-danger" onClick={() => void deleteAccount()} disabled={!!deletingAccount}><Trash2 size={15} />{deletingAccount ? '注销中…' : '确认注销'}</button></>}>
      <p>注销后将永久删除 <strong>{accountToDelete?.username}</strong> 的账号、学习记录、班级关系和提交记录，无法恢复。确定继续吗？</p>
    </Dialog>
  </main>
}
