    let isLoginMode = true;
    let currentUser = localStorage.getItem('currentUser') || '';
    let sessionToken = localStorage.getItem('sessionToken') || '';
    function sessionStorageKey(name) { return name + ':' + encodeURIComponent(currentUser || 'guest'); }
    function chatHistoryKey(sid) { return sessionStorageKey('chatHistory') + ':' + sid; }
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, options = {}) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (!sessionToken || !url.startsWith('/api/')) return nativeFetch(input, options);
        const headers = new Headers(options.headers || {});
        headers.set('X-Session-Token', sessionToken);
        return nativeFetch(input, { ...options, headers });
    };

    const userAvatars = ['👤','🙂','😎','🧑‍💻','🦊','🐼','🌟','🚀'];
    const aiAvatars = ['🤖','🧠','🧑‍🏫','✨','🔮','🛰️','📚','🎓'];
    function getUserAvatar() { return localStorage.getItem('userAvatar') || '👤'; }
    function getAiAvatar() { return localStorage.getItem('aiAvatar') || '🤖'; }
    function updateProfileUI() {
        if (!currentUser) return;
        document.getElementById('userInfo').textContent = getUserAvatar() + ' ' + currentUser;
        document.getElementById('profileAvatar').textContent = getUserAvatar();
        document.getElementById('profileName').textContent = currentUser;
    }
    function toggleProfile() { document.getElementById('profileMenu').classList.toggle('show'); }
    function closeProfileModal(id) { document.getElementById(id).classList.remove('show'); }
    function logout() { localStorage.removeItem('currentUser'); localStorage.removeItem('sessionToken'); currentUser = ''; sessionToken = ''; document.getElementById('userInfo').style.display = 'none'; document.getElementById('loginBtn').style.display = 'inline-block'; document.getElementById('profileMenu').classList.remove('show'); activateSessionScope(); showToast('已退出登录', 'success'); }
    function showPasswordModal() { document.getElementById('profileMenu').classList.remove('show'); document.getElementById('passwordModal').classList.add('show'); }
    let learningManagerData = null;
    let learningManagerTab = 'loop';
    async function showLearningManager() {
        if (!currentUser) { showLogin(); return; }
        document.getElementById('profileMenu').classList.remove('show');
        document.getElementById('learningManageModal').classList.add('show');
        const content = document.getElementById('learningManageContent');
        content.innerHTML = '<div class="learning-manage-empty">正在读取学习记录...</div>';
        try {
            const user = encodeURIComponent(currentUser);
            const responses = await Promise.all([
                fetch('/api/learning/overview/' + user),
                fetch('/api/learning/reviews/' + user),
                fetch('/api/learning/weekly/' + user)
            ]);
            const [overview, reviews, weekly] = await Promise.all(responses.map(res => res.json()));
            const failed = responses.findIndex(res => !res.ok);
            if (failed >= 0) throw new Error([overview, reviews, weekly][failed].detail || '读取学习记录失败');
            learningManagerData = { ...overview, reviews, weekly };
            renderLearningManager();
        } catch (err) { content.innerHTML = `<div class="learning-manage-empty">${escapeText(err.message)}</div>`; }
    }
    function learningSessionTitle(id) { return new Map(getSessions().map(item => [item.id, item.title])).get(id) || '学习会话'; }
    function learningDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : ''; }
    function renderLearningManager() {
        const data = learningManagerData;
        const content = document.getElementById('learningManageContent');
        if (!data) return;
        const openMistakes = data.attempts.filter(item => !item.is_correct && !item.mastered);
        const tabs = [
            ['loop', '复习与周报', data.reviews.due_count],
            ['plans', '学习路线', data.plans.length], ['notes', '笔记', data.notes.length],
            ['attempts', '练习记录', data.attempts.length], ['mistakes', '待复习错题', openMistakes.length]
        ];
        const nav = `<nav class="learning-manager-nav">${tabs.map(([id, label, count]) => `<button class="learning-manager-tab ${learningManagerTab === id ? 'active' : ''}" onclick="setLearningManagerTab('${id}')"><span>${label}</span><span class="learning-manager-count">${count}</span></button>`).join('')}</nav>`;
        let title = '', description = '', records = '';
        if (learningManagerTab === 'loop') {
            const weekly = data.weekly;
            const due = data.reviews.reviews.filter(item => item.is_due);
            title = '复习与周报'; description = `${weekly.period.start} 至 ${weekly.period.end} · 根据遗忘曲线安排复习`;
            const metrics = [
                ['学习天数', weekly.study_days], ['本周提问', weekly.queries],
                ['练习正确率', weekly.practice.total ? weekly.practice.accuracy + '%' : '暂无'],
                ['路线进度', weekly.plan.total ? weekly.plan.completed + '/' + weekly.plan.total : '暂无']
            ];
            const reviewList = due.map(item => `<article class="learning-record"><div class="learning-record-head"><div><h3>${escapeText(item.topic)}</h3><p class="learning-record-meta">第 ${item.round} 轮 · ${learningDate(item.due_at)} 到期</p></div><button class="review-complete" type="button" onclick="completeLearningReview(${item.id})">完成复习</button></div></article>`).join('');
            const weakPoints = weekly.weak_points.length ? weekly.weak_points.map(item => `<span>${escapeText(item)}</span>`).join('') : '<span>暂无明显薄弱点</span>';
            const suggestions = weekly.suggestions.map(item => `<li>${escapeText(item)}</li>`).join('');
            records = `<div class="weekly-metrics">${metrics.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><section class="weekly-section"><h3>到期复习 <small>${due.length} 项</small></h3>${reviewList || '<div class="learning-manage-empty compact">本周复习已完成。</div>'}</section><section class="weekly-section"><h3>薄弱点</h3><div class="weekly-tags">${weakPoints}</div></section><section class="weekly-section"><h3>下周建议</h3><ol class="weekly-suggestions">${suggestions}</ol></section>`;
        } else if (learningManagerTab === 'plans') {
            title = '学习路线'; description = '每个会话各自维护进度，删除不会影响其他会话。';
            records = data.plans.map(item => {
                const completed = item.plan.filter(step => step.done).length;
                return `<article class="learning-record"><div class="learning-record-head"><div><h3>${escapeText(item.goal)}</h3><p class="learning-record-meta">${escapeText(learningSessionTitle(item.session_id))} · 已完成 ${completed}/${item.plan.length}</p></div><div class="learning-record-actions"><button class="record-action record-view" aria-label="查看路线" title="查看路线" onclick="toggleLearningDetail('plan-${escapeText(item.session_id)}')"></button><button class="record-action record-delete danger" aria-label="删除路线" title="删除路线" onclick="deleteLearningPlan('${encodeURIComponent(item.session_id)}')"></button></div></div><div class="learning-record-detail" id="plan-${escapeText(item.session_id)}" hidden>${item.plan.map((step, index) => `${step.done ? '✓' : index + 1 + '.'} ${escapeText(step.title || step.task || String(step))}`).join('<br>')}</div></article>`;
            }).join('');
        } else if (learningManagerTab === 'notes') {
            title = '笔记'; description = '阅读由每个会话沉淀下来的复习笔记。';
            records = data.notes.map(item => `<article class="learning-record"><div class="learning-record-head"><div><h3>${escapeText(item.title)}</h3><p class="learning-record-meta">${escapeText(learningSessionTitle(item.session_id))} · ${learningDate(item.created_at)}</p></div><div class="learning-record-actions"><button class="record-action record-view" aria-label="阅读笔记" title="阅读笔记" onclick="toggleLearningNote('${item.id}')"></button><button class="record-action record-delete danger" aria-label="删除笔记" title="删除笔记" onclick="deleteLearningNote('${item.id}')"></button></div></div><article class="learning-record-detail note-reader" id="note-${item.id}" hidden></article></article>`).join('');
        } else if (learningManagerTab === 'attempts') {
            title = '练习记录'; description = '查看每次作答，删除无效或重复的练习记录。';
            records = data.attempts.map(item => `<article class="learning-record"><div class="learning-record-head"><div><h3>${escapeText(item.question)}</h3><p class="learning-record-meta">${escapeText(learningSessionTitle(item.session_id))} · ${item.is_correct ? '已完成' : item.mastered ? '已掌握' : '需要复习'} · ${learningDate(item.created_at)}</p></div><div class="learning-record-actions"><button class="record-action record-view" aria-label="查看作答" title="查看作答" onclick="toggleLearningDetail('attempt-${item.id}')"></button><button class="record-action record-delete danger" aria-label="删除记录" title="删除记录" onclick="deleteLearningAttempt(${item.id})"></button></div></div><div class="learning-record-detail" id="attempt-${item.id}" hidden><strong>我的回答</strong><br>${escapeText(item.answer)}</div></article>`).join('');
        } else {
            title = '待复习错题'; description = '掌握后标记完成，错题会从当前列表移走。';
            records = openMistakes.map(item => `<article class="learning-record"><div class="learning-record-head"><div><h3>${escapeText(item.question)}</h3><p class="learning-record-meta">${escapeText(learningSessionTitle(item.session_id))} · ${learningDate(item.created_at)}</p></div><div class="learning-record-actions"><button class="record-action record-check" aria-label="标记已掌握" title="标记已掌握" onclick="markLearningMastered(${item.id})"></button><button class="record-action record-delete danger" aria-label="删除错题" title="删除错题" onclick="deleteLearningAttempt(${item.id})"></button></div></div><div class="learning-record-detail">我的回答：${escapeText(item.answer)}</div></article>`).join('');
        }
        content.innerHTML = nav + `<section class="learning-manager-main"><h2 class="learning-manager-title">${title}</h2><p class="learning-manager-description">${description}</p>${records || '<div class="learning-manage-empty">这里还没有内容。</div>'}</section>`;
    }
    function setLearningManagerTab(tab) { learningManagerTab = tab; renderLearningManager(); }
    function toggleLearningDetail(id) { const item = document.getElementById(id); if (item) item.hidden = !item.hidden; }
    function toggleLearningNote(noteId) { const note = learningManagerData.notes.find(item => item.id === noteId); const node = document.getElementById('note-' + noteId); if (!note || !node) return; if (!node.innerHTML) node.innerHTML = renderMarkdown(note.content); node.hidden = !node.hidden; }
    async function refreshLearningManager() { await showLearningManager(); }
    async function completeLearningReview(id) { try { await learningFetch('/api/learning/reviews/' + encodeURIComponent(currentUser) + '/' + id + '/complete', { method:'POST' }); showToast('本轮复习完成，已安排下一次复习', 'success'); await refreshLearningManager(); } catch (err) { showToast(err.message, 'error'); } }
    let pendingConfirmAction = null;
    function requestConfirm(title, message, action, label = '删除') { pendingConfirmAction = action; document.getElementById('confirmTitle').textContent = title; document.getElementById('confirmMessage').textContent = message; document.getElementById('confirmSubmit').textContent = label; document.getElementById('confirmModal').hidden = false; }
    function closeConfirm() { pendingConfirmAction = null; document.getElementById('confirmModal').hidden = true; }
    async function runConfirmAction() { const action = pendingConfirmAction; closeConfirm(); if (action) await action(); }
    async function deleteLearningNote(noteId) { requestConfirm('删除笔记', '删除后无法恢复这篇笔记。', async () => { try { await learningFetch('/api/learning/notes/' + encodeURIComponent(currentUser) + '/' + encodeURIComponent(noteId), { method:'DELETE' }); showToast('笔记已删除', 'success'); refreshLearningManager(); } catch (err) { showToast(err.message, 'error'); } }); }
    async function deleteLearningPlan(encodedSessionId) { requestConfirm('删除学习路线', '删除后不会影响原始聊天记录。', async () => { try { await learningFetch('/api/learning/plans/' + encodeURIComponent(currentUser) + '/' + encodedSessionId, { method:'DELETE' }); showToast('学习路线已删除', 'success'); refreshLearningManager(); } catch (err) { showToast(err.message, 'error'); } }); }
    async function deleteLearningAttempt(id) { requestConfirm('删除练习记录', '删除后无法恢复这条练习记录。', async () => { try { await learningFetch('/api/learning/attempts/' + encodeURIComponent(currentUser) + '/' + id, { method:'DELETE' }); showToast('练习记录已删除', 'success'); refreshLearningManager(); } catch (err) { showToast(err.message, 'error'); } }); }
    async function markLearningMastered(id) { try { await learningFetch('/api/learning/attempts/' + encodeURIComponent(currentUser) + '/' + id + '/mastered', { method:'POST' }); showToast('已标记为掌握', 'success'); refreshLearningManager(); } catch (err) { showToast(err.message, 'error'); } }
    let workspaceActiveFile = '';
    let workspaceSelectedFolder = '';
    let workspaceRootName = '我的学习资料';
    let workspaceFolderChosen = false;
    let workspaceCollapsedFolders = new Set();
    let workspaceListing = null;
    let chatMode = localStorage.getItem('chatMode') || 'chat';
    const mobileChatOnly = matchMedia('(max-width: 800px)');
    function setChatMode(mode) {
        chatMode = !mobileChatOnly.matches && mode === 'task' ? 'task' : 'chat';
        localStorage.setItem('chatMode', chatMode);
        document.getElementById('chatModeBtn').classList.toggle('active', chatMode === 'chat');
        document.getElementById('taskModeBtn').classList.toggle('active', chatMode === 'task');
        document.getElementById('workspaceComposerBtn').classList.toggle('show', chatMode === 'task');
        const chip = document.getElementById('taskFolderChip');
        chip.classList.toggle('show', chatMode === 'task' && workspaceFolderChosen);
        chip.textContent = workspaceFolderChosen ? (workspaceSelectedFolder || workspaceRootName) : '';
        queryInput.placeholder = chatMode === 'task' ? (workspaceFolderChosen ? '描述要在此文件夹中完成的任务...' : '请先选择任务文件夹') : '输入问题...';
    }
    async function showWorkspace() {
        if (mobileChatOnly.matches) { closeProfileModal('workspaceModal'); setChatMode('chat'); showToast('手机端仅支持聊天模式', 'error'); return; }
        if (!currentUser) { showLogin(); return; }
        if (chatMode !== 'task') { showToast('切换到任务模式后才能使用工作区', 'error'); return; }
        document.getElementById('profileMenu').classList.remove('show');
        document.getElementById('workspaceModal').classList.add('show');
        document.getElementById('workspaceEditor').value = '';
        document.getElementById('workspacePreview').hidden = true;
        document.getElementById('workspaceEditor').hidden = false;
        document.getElementById('workspaceFileTitle').textContent = '选择一个文档';
        workspaceActiveFile = '';
        await loadWorkspaceFiles();
    }
    mobileChatOnly.addEventListener('change', event => {
        if (!event.matches) return;
        closeProfileModal('workspaceModal');
        setChatMode('chat');
    });
    async function workspaceFetch(url, options = {}) {
        const res = await fetch(url, options);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || '文档操作失败');
        return data;
    }
    async function loadWorkspaceFiles() {
        const list = document.getElementById('workspaceFiles');
        list.textContent = '正在读取...';
        try {
            const data = await workspaceFetch('/api/workspace/' + encodeURIComponent(currentUser));
            workspaceListing = data;
            workspaceRootName = data.root_name || '我的学习资料';
            document.getElementById('workspaceRootLabel').textContent = workspaceRootName;
            renderWorkspaceTree();
        } catch (err) { list.textContent = err.message; }
    }
    function renderWorkspaceTree() {
        const list = document.getElementById('workspaceFiles');
        if (!workspaceListing) return;
        const root = { folders:new Map(), files:[] };
        const ensureFolder = path => {
            let node = root;
            for (const part of path.split('/').filter(Boolean)) {
                if (!node.folders.has(part)) node.folders.set(part, { folders:new Map(), files:[] });
                node = node.folders.get(part);
            }
            return node;
        };
        (workspaceListing.folders || []).forEach(ensureFolder);
        (workspaceListing.files || []).forEach(file => {
            const parts = file.path.split('/');
            ensureFolder(parts.slice(0, -1).join('/')).files.push(file);
        });
        const compare = (a, b) => a.localeCompare(b, 'zh-CN', { numeric:true, sensitivity:'base' });
        const draw = (node, parentPath, depth) => {
            const folders = [...node.folders.keys()].sort(compare).map(name => {
                const folder = parentPath ? parentPath + '/' + name : name;
                const collapsed = workspaceCollapsedFolders.has(folder);
                const row = `<div class="workspace-tree-row" style="padding-left:${4 + depth * 14}px"><button class="tree-disclosure ${collapsed ? 'collapsed' : ''}" type="button" title="${collapsed ? '展开文件夹' : '收起文件夹'}" onclick="toggleWorkspaceFolder(event, decodeURIComponent('${encodeURIComponent(folder)}'))"><span></span></button><button class="workspace-tree-folder ${folder === workspaceSelectedFolder ? 'selected' : ''}" type="button" onclick="selectWorkspaceFolder(decodeURIComponent('${encodeURIComponent(folder)}'))"><span class="tree-folder-icon"></span><span>${escapeText(name)}</span></button></div>`;
                return row + (collapsed ? '' : draw(node.folders.get(name), folder, depth + 1));
            }).join('');
            const files = [...node.files].sort((a, b) => compare(a.name, b.name)).map(file => `<button class="workspace-tree-file ${file.path === workspaceActiveFile ? 'active' : ''}" style="padding-left:${31 + depth * 14}px" onclick="openWorkspaceFile(decodeURIComponent('${encodeURIComponent(file.path)}'))">${escapeText(file.name)}</button>`).join('');
            return folders + files;
        };
        const tree = draw(root, '', 0);
        list.innerHTML = tree || '<div class="learning-empty">新建一个文件夹后开始整理资料</div>';
        const status = document.getElementById('workspaceFolderStatus');
        if (status) status.textContent = workspaceFolderChosen ? '任务文件夹：' + (workspaceSelectedFolder || workspaceRootName) : '请选择一个任务文件夹';
    }
    function selectWorkspaceFolder(folder) {
        workspaceSelectedFolder = folder || '';
        workspaceFolderChosen = true;
        if (currentUser) { localStorage.setItem('taskWorkspaceFolder_' + currentUser, workspaceSelectedFolder); localStorage.setItem('taskWorkspaceFolderChosen_' + currentUser, '1'); }
        setChatMode(chatMode); renderWorkspaceTree();
        showToast('已选择任务文件夹：' + (folder || workspaceRootName), 'success');
    }
    function toggleWorkspaceFolder(event, folder) {
        event.stopPropagation();
        if (workspaceCollapsedFolders.has(folder)) workspaceCollapsedFolders.delete(folder); else workspaceCollapsedFolders.add(folder);
        if (currentUser) localStorage.setItem('workspaceCollapsedFolders_' + currentUser, JSON.stringify([...workspaceCollapsedFolders]));
        renderWorkspaceTree();
    }
    async function openExistingWorkspaceFolder() {
        try {
            const data = await workspaceFetch('/api/workspace/open-folder', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser }) });
            if (data.status === 'cancelled') return;
            workspaceRootName = data.root_name;
            workspaceSelectedFolder = '';
            workspaceFolderChosen = true;
            workspaceCollapsedFolders = new Set();
            localStorage.setItem('taskWorkspaceFolder_' + currentUser, '');
            localStorage.setItem('taskWorkspaceFolderChosen_' + currentUser, '1');
            localStorage.removeItem('workspaceCollapsedFolders_' + currentUser);
            setChatMode(chatMode); await loadWorkspaceFiles(); showToast('已打开文件夹：' + workspaceRootName, 'success');
        } catch (err) { showToast(err.message, 'error'); }
    }
    async function createWorkspaceFolder() {
        const name = prompt('新建文件夹名称');
        if (!name || !name.trim()) return;
        const folder = [workspaceSelectedFolder, name.trim()].filter(Boolean).join('/');
        try { const data = await workspaceFetch('/api/workspace/folders', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, folder }) }); selectWorkspaceFolder(data.folder); }
        catch (err) { showToast(err.message, 'error'); }
    }
    async function openWorkspaceFile(name) {
        try {
            const data = await workspaceFetch('/api/workspace/' + encodeURIComponent(currentUser) + '/' + encodeURIComponent(name));
            workspaceActiveFile = data.path;
            document.getElementById('workspaceFileTitle').textContent = data.path;
            document.getElementById('workspaceEditor').value = data.content;
            document.getElementById('workspacePreview').hidden = true;
            document.getElementById('workspaceEditor').hidden = false;
            renderWorkspaceTree();
        } catch (err) { showToast(err.message, 'error'); }
    }
    document.getElementById('workspaceFileInput').addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file || !currentUser) return;
        const form = new FormData(); form.append('file', file);
        try {
            if (!workspaceFolderChosen) { showToast('请先在左侧选择一个任务文件夹', 'error'); return; }
            const data = await workspaceFetch('/api/workspace/upload?username=' + encodeURIComponent(currentUser) + '&folder=' + encodeURIComponent(workspaceSelectedFolder), { method:'POST', body:form });
            workspaceActiveFile = data.file.path;
            document.getElementById('workspaceFileTitle').textContent = data.file.path;
            document.getElementById('workspaceEditor').value = data.content;
            showToast('文档已加入工作区', 'success'); loadWorkspaceFiles();
        } catch (err) { showToast(err.message, 'error'); }
        event.target.value = '';
    });
    async function saveWorkspaceFile() {
        if (!workspaceActiveFile) { showToast('请先选择一个文档', 'error'); return; }
        try {
            await workspaceFetch('/api/workspace/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, filename:workspaceActiveFile, content:document.getElementById('workspaceEditor').value }) });
            showToast('文档已保存', 'success'); loadWorkspaceFiles();
        } catch (err) { showToast(err.message, 'error'); }
    }
    function toggleWorkspacePreview() {
        const editor = document.getElementById('workspaceEditor');
        const preview = document.getElementById('workspacePreview');
        if (preview.hidden) { preview.innerHTML = renderMarkdown(editor.value || '# 空文档'); preview.hidden = false; editor.hidden = true; }
        else { preview.hidden = true; editor.hidden = false; }
    }
    async function generateWorkspaceDocument() {
        if (!workspaceActiveFile) { showToast('请先选择一个文档', 'error'); return; }
        const instruction = document.getElementById('workspaceInstruction').value.trim();
        if (!instruction) { showToast('请描述要生成什么文档', 'error'); return; }
        const button = document.getElementById('workspaceGenerateBtn');
        button.disabled = true; button.textContent = 'AI 正在生成...';
        try {
            const data = await workspaceFetch('/api/workspace/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, filename:workspaceActiveFile, instruction }) });
            workspaceActiveFile = data.file.path;
            document.getElementById('workspaceFileTitle').textContent = data.file.path;
            document.getElementById('workspaceEditor').value = data.content;
            document.getElementById('workspaceInstruction').value = '';
            showToast('AI 文档已生成到工作区', 'success'); loadWorkspaceFiles();
        } catch (err) { showToast(err.message, 'error'); }
        button.disabled = false; button.textContent = 'AI 生成文档';
    }
    async function exportCurrentSessionToWorkspace() {
        const messages = getCurrentHistory();
        if (!messages.length) { showToast('当前会话还没有可保存的内容', 'error'); return; }
        const title = getSessions().find(item => item.id === sessionId)?.title || '学习对话';
        try {
            if (!workspaceFolderChosen) { showToast('请先选择任务文件夹', 'error'); return; }
            const data = await workspaceFetch('/api/workspace/session-export', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, title, messages, folder:workspaceSelectedFolder }) });
            workspaceActiveFile = data.file.path;
            document.getElementById('workspaceFileTitle').textContent = data.file.path;
            document.getElementById('workspaceEditor').value = data.content;
            document.getElementById('workspacePreview').hidden = true;
            document.getElementById('workspaceEditor').hidden = false;
            await loadWorkspaceFiles(); showToast('当前会话已保存到工作区', 'success');
        } catch (err) { showToast(err.message, 'error'); }
    }
    async function openWorkspaceInVSCode() {
        try { await workspaceFetch('/api/workspace/open-vscode', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser }) }); showToast('已打开 VS Code 工作区', 'success'); }
        catch (err) { showToast(err.message, 'error'); }
    }
    function showThemePicker() { document.getElementById('profileMenu').classList.remove('show'); document.getElementById('themeModal').classList.add('show'); }
    function showAvatarPicker() { document.getElementById('profileMenu').classList.remove('show'); renderAvatarGrid('avatarGrid', userAvatars, 'userAvatar', 'avatarModal'); }
    function showAiAvatarPicker() { document.getElementById('profileMenu').classList.remove('show'); renderAvatarGrid('aiAvatarGrid', aiAvatars, 'aiAvatar', 'aiAvatarModal'); }
    function renderAvatarGrid(id, avatars, key, modal) { const grid = document.getElementById(id); grid.innerHTML = ''; avatars.forEach(avatar => { const button = document.createElement('button'); button.textContent = avatar; button.onclick = () => { localStorage.setItem(key, avatar); updateProfileUI(); closeProfileModal(modal); renderSessions(); }; grid.appendChild(button); }); document.getElementById(modal).classList.add('show'); }
    function setTheme(theme) { const actual = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme; document.body.dataset.theme = actual; localStorage.setItem('theme', theme); closeProfileModal('themeModal'); }
    setTheme(localStorage.getItem('theme') || 'light');

    function toggleModelMenu() { document.getElementById('modelMenu').classList.toggle('show'); }
    function selectModel(modelId) { document.getElementById('modelMenu').classList.remove('show'); const select = document.getElementById('modelSelect'); select.value = modelId; onModelChange(select); }
    function updateModelTrigger(modelId) {
        const trigger = document.getElementById('modelTrigger');
        const local = modelId === 'flash';
        const labels = { flash:['Free', '本地推理'], glm:['Flash', '高速云端'], pro:['Pro', '增强云端'] };
        const [name, description] = labels[modelId] || labels.flash;
        trigger.classList.remove('mode-flash', 'mode-glm', 'mode-pro');
        trigger.classList.add('mode-' + modelId);
        trigger.innerHTML = `<span class="model-dot"></span><span class="model-label"><b>${name}</b><small>${description}</small></span>`;
    }

    let tutorMode = localStorage.getItem('tutorMode') || 'explain';
    const tutorModeNames = { explain:'通俗讲解', socratic:'苏格拉底追问', interview:'面试官', review:'代码审查', quiz:'出题老师' };
    function toggleTutorMenu() { document.getElementById('tutorMenu').classList.toggle('show'); }
    function selectTutorMode(mode) {
        tutorMode = tutorModeNames[mode] ? mode : 'explain';
        localStorage.setItem('tutorMode', tutorMode);
        document.getElementById('tutorLabel').textContent = tutorModeNames[tutorMode];
        document.getElementById('tutorMenu').classList.remove('show');
        showToast('导师方式已切换为' + tutorModeNames[tutorMode], 'success');
    }
    document.getElementById('tutorLabel').textContent = tutorModeNames[tutorMode];

    // ── 用户登录系统 ───────────────────────────────────
    function showLogin() {
        document.getElementById('loginModal').classList.add('show');
        document.getElementById('loginError').style.display = 'none';
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
    }

    function switchLoginMode() {
        isLoginMode = !isLoginMode;
        document.getElementById('loginTitle').textContent = isLoginMode ? '登录' : '注册';
        document.getElementById('loginSubmitBtn').textContent = isLoginMode ? '登录' : '注册';
        document.getElementById('loginSwitch').textContent = isLoginMode ? '没有账号？点此注册' : '已有账号？点此登录';
        document.getElementById('loginError').style.display = 'none';
    }

    async function submitLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const errorEl = document.getElementById('loginError');

        if (!username || !password) {
            errorEl.textContent = '用户名和密码不能为空';
            errorEl.style.display = 'block';
            return;
        }

        const url = isLoginMode ? '/api/login' : '/api/register';

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.detail || '操作失败';
                errorEl.style.display = 'block';
                return;
            }

            if (isLoginMode) {
                currentUser = username;
                sessionToken = data.session_token || '';
                localStorage.setItem('currentUser', username);
                localStorage.setItem('sessionToken', sessionToken);
                workspaceSelectedFolder = localStorage.getItem('taskWorkspaceFolder_' + currentUser) || '';
                workspaceFolderChosen = localStorage.getItem('taskWorkspaceFolderChosen_' + currentUser) === '1' || !!workspaceSelectedFolder;
                workspaceCollapsedFolders = new Set(JSON.parse(localStorage.getItem('workspaceCollapsedFolders_' + currentUser) || '[]'));
                setChatMode(chatMode);
                updateProfileUI();
                document.getElementById('userInfo').style.display = 'inline';
                document.getElementById('loginBtn').style.display = 'none';
                document.getElementById('loginModal').classList.remove('show');
                activateSessionScope();
                showToast('✅ 登录成功，欢迎回来！', 'success');
            } else {
                showToast('✅ 注册成功，请登录！', 'success');
                isLoginMode = true;
                document.getElementById('loginTitle').textContent = '登录';
                document.getElementById('loginSubmitBtn').textContent = '登录';
                document.getElementById('loginSwitch').textContent = '没有账号？点此注册';
            }
        } catch (err) {
            errorEl.textContent = '网络错误: ' + err.message;
            errorEl.style.display = 'block';
        }
    }

    async function changePassword() {
        const error = document.getElementById('passwordError');
        try {
            const res = await fetch('/api/password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username: currentUser, old_password: document.getElementById('oldPassword').value, new_password: document.getElementById('newPassword').value }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || '修改失败');
            closeProfileModal('passwordModal'); document.getElementById('oldPassword').value = ''; document.getElementById('newPassword').value = ''; showToast('密码已修改', 'success');
        } catch (err) { error.textContent = err.message; error.style.display = 'block'; }
    }

    // 页面加载时检查是否已登录
    if (currentUser) {
        updateProfileUI();
        document.getElementById('userInfo').style.display = 'inline';
        document.getElementById('loginBtn').style.display = 'none';
    }

    function migrateLegacySessionStorage() {
        const legacySessions = localStorage.getItem('sessions');
        if (!legacySessions || localStorage.getItem(sessionStorageKey('sessions'))) return;
        let sessions;
        try { sessions = JSON.parse(legacySessions); } catch (error) { return; }
        if (!Array.isArray(sessions)) return;
        localStorage.setItem(sessionStorageKey('sessions'), legacySessions);
        const legacyCurrent = localStorage.getItem('currentSessionId');
        if (legacyCurrent) localStorage.setItem(sessionStorageKey('currentSessionId'), legacyCurrent);
        sessions.forEach(item => {
            const oldKey = 'chatHistory_' + item.id;
            const history = localStorage.getItem(oldKey);
            if (history) localStorage.setItem(chatHistoryKey(item.id), history);
            localStorage.removeItem(oldKey);
        });
        localStorage.removeItem('sessions');
        localStorage.removeItem('currentSessionId');
    }
    migrateLegacySessionStorage();

    let sessionId = localStorage.getItem(sessionStorageKey('currentSessionId')) || '';
    let uploadedFiles = [];
    let isLoading = false;

    const messagesEl = document.getElementById('messages');
    const queryInput = document.getElementById('queryInput');
    const sendBtn = document.getElementById('sendBtn');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    workspaceSelectedFolder = currentUser ? (localStorage.getItem('taskWorkspaceFolder_' + currentUser) || '') : '';
    workspaceFolderChosen = currentUser ? (localStorage.getItem('taskWorkspaceFolderChosen_' + currentUser) === '1' || !!workspaceSelectedFolder) : false;
    workspaceCollapsedFolders = new Set(currentUser ? JSON.parse(localStorage.getItem('workspaceCollapsedFolders_' + currentUser) || '[]') : []);
    setChatMode(chatMode);
    const sessionListEl = document.getElementById('sessionList');

    // ── 会话管理 ─────────────────────────────────────
    function getSessions() {
        let sessions = [];
        try { sessions = JSON.parse(localStorage.getItem(sessionStorageKey('sessions')) || '[]'); } catch(e){}
        if (!Array.isArray(sessions)) sessions = [];
        return sessions;
    }

    function saveSessions(sessions) {
        localStorage.setItem(sessionStorageKey('sessions'), JSON.stringify(sessions));
    }

    function genSessionTitle(firstMsg) {
        if (!firstMsg) return '新对话';
        return firstMsg.length > 16 ? firstMsg.slice(0, 16) + '...' : firstMsg;
    }

    function upsertSession(sid, title) {
        let sessions = getSessions();
        let s = sessions.find(x => x.id === sid);
        if (!s) {
            s = { id: sid, title: title || '新对话', createdAt: Date.now() };
            sessions.unshift(s);
        } else if (title) {
            s.title = title;
        }
        saveSessions(sessions);
        renderSessions();
    }

    function deleteSession(sid) {
        let sessions = getSessions().filter(x => x.id !== sid);
        saveSessions(sessions);
        localStorage.removeItem(chatHistoryKey(sid));
        if (sid === sessionId) {
            const remaining = getSessions();
            if (remaining.length > 0) {
                loadSession(remaining[0].id);
            } else {
                newChat();
            }
        }
        renderSessions();
    }

    function renderSessions() {
        return renderSessionItems(getSessions());
        const sessions = getSessions();
        if (sessions.length === 0) {
            sessionListEl.innerHTML = '<div style="color:#98a2b3; font-size:12px; padding:8px;">暂无历史会话</div>';
            return;
        }
        sessionListEl.innerHTML = sessions.map(s => `
            <div class="session-item ${s.id === sessionId ? 'active' : ''}" onclick="loadSession('${s.id}')">
                <span>${s.title}</span>
                <span class="del" onclick="event.stopPropagation(); requestConfirm('删除会话', '删除后无法恢复该会话及其本地记录。', () => deleteSession('${s.id}'));" >×</span>
            </div>
        `).join('');
    }

    function newChat() {
        sessionId = 'session_' + Date.now();
        localStorage.setItem(sessionStorageKey('currentSessionId'), sessionId);
        upsertSession(sessionId, '新对话');
        renderEmpty();
        queryInput.focus();
    }

    function loadSession(sid) {
        sessionId = sid;
        localStorage.setItem(sessionStorageKey('currentSessionId'), sessionId);
        renderEmpty();
        loadHistory();
        renderSessions();
    }

    function renderEmpty() {
        messagesEl.innerHTML = `
            <div class="empty-state" id="emptyState">
                <div class="icon">🎓</div>
                <h3>全能AI导师</h3>
                <p>内置 AI 学习知识库，开箱即用。<br>问我任何 AI 相关问题，我会结合知识库回答你。<br><br>也可以上传你的 .md 笔记来补充知识库。</p>
            </div>
        `;
    }

    // ── 加载历史会话 ─────────────────────────────────
    function loadHistory() {
        const saved = localStorage.getItem(chatHistoryKey(sessionId));
        if (saved) {
            try {
                const history = JSON.parse(saved);
                if (Array.isArray(history) && history.length > 0) {
                    const es = document.getElementById('emptyState');
                    if (es) es.remove();
                    history.forEach(msg => addMessage(msg.role, msg.content));
                }
            } catch (e) {
                console.error('加载历史失败:', e);
            }
        }
    }

    // ── 保存历史会话 ─────────────────────────────────
    function saveHistory(role, content) {
        const key = chatHistoryKey(sessionId);
        let history = [];
        const saved = localStorage.getItem(key);
        if (saved) {
            try { history = JSON.parse(saved); } catch (e) {}
        }
        history.push({ role, content });
        // 最多保留 50 条，避免 localStorage 撑爆
        if (history.length > 50) history = history.slice(-50);
        localStorage.setItem(key, JSON.stringify(history));
    }

    function activateSessionScope() {
        const sessions = getSessions();
        sessionId = localStorage.getItem(sessionStorageKey('currentSessionId')) || '';
        if (sessionId && sessions.some(item => item.id === sessionId)) loadSession(sessionId);
        else if (sessions.length) loadSession(sessions[0].id);
        else newChat();
    }

    // 页面加载时恢复历史
    if (!sessionId) {
        newChat();
    } else {
        // 确保会话存在于列表中，但不覆盖已有标题
        let sessions = getSessions();
        if (!sessions.find(x => x.id === sessionId)) {
            upsertSession(sessionId, '新对话');
        }
        loadHistory();
    }
    renderSessions();

    // ── 文件上传 ──────────────────────────────────────
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        showToast('正在处理: ' + file.name, 'success');

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.status === 'ok') {
                uploadedFiles.push({ name: file.name, id: data.file_id });
                renderFileList();
                showToast(`✅ 已补充 ${data.chunks} 个知识片段`, 'success');
                addMessage('assistant', `📚 已补充 **${file.name}**，共 **${data.chunks}** 个知识片段。现在问我问题吧！`);
            } else {
                showToast('❌ 上传失败', 'error');
            }
        } catch (err) {
            showToast('❌ 网络错误: ' + err.message, 'error');
        }

        fileInput.value = '';
    });

    // ── 发送消息 ──────────────────────────────────────
    async function sendMessage() {
        const query = queryInput.value.trim();
        if (!query || isLoading) return;
        if (chatMode === 'task' && !workspaceFolderChosen) {
            showToast('任务模式需要先选择一个文件夹', 'error');
            showWorkspace();
            return;
        }

        addMessage('user', query);
        saveHistory('user', query);
        // 只在第一条用户消息时更新标题
        const key = chatHistoryKey(sessionId);
        const saved = localStorage.getItem(key);
        const history = saved ? JSON.parse(saved) : [];
        const userMessages = history.filter(h => h.role === 'user');
        if (userMessages.length === 1) {  // 只有1条用户消息，说明是第一次提问
            upsertSession(sessionId, genSessionTitle(query));
        }
        queryInput.value = '';
        queryInput.style.height = 'auto';

        isLoading = true;
        sendBtn.disabled = true;
        const loadingId = addMessage('assistant', '');
        const stopAnswerProgress = startAnswerProgress(loadingId);

        try {
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, session_id: sessionId, username: currentUser, tutor_mode: tutorMode })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || '请求失败');
            }

            const data = await res.json();
            stopAnswerProgress();

            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) {
                const bubble = loadingMsg.querySelector('.bubble');
                if (data.error) {
                    bubble.classList.add('model-error');
                    bubble.innerHTML = `<div class="model-error-head">模型暂时不可用</div><p>${escapeText(data.message || '请稍后重试。')}</p><button type="button" onclick="selectModel('flash')">切换到本地模型</button>`;
                } else {
                    bubble.innerHTML = renderAnswerFlow(data.answer);
                }
            }
            if (!data.error) saveHistory('assistant', data.answer);
            // 立即更新统计
            if (data.tokens) {
                document.getElementById('sessionTokens').textContent = data.tokens;
            }
            await updateStats();
        } catch (err) {
            stopAnswerProgress();
            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) {
                loadingMsg.querySelector('.bubble').innerHTML = `❌ 出错了: ${err.message}`;
            }
        }

        isLoading = false;
        sendBtn.disabled = false;
        queryInput.focus();
        updateStats();
    }

    function startAnswerProgress(messageId) {
        const stages = ['正在理解你的问题', '正在整理当前上下文', '正在生成回答'];
        let index = 0;
        const render = () => {
            const bubble = document.querySelector('#' + messageId + ' .bubble');
            if (!bubble) return;
            bubble.innerHTML = `<div class="answer-progress"><div class="answer-progress-title"><span class="answer-progress-orbit"></span><span>${stages[index]}<span class="loading-dots"></span></span></div><div class="answer-progress-steps">${stages.map((_, item) => `<span class="answer-progress-step ${item === index ? 'active' : ''}"></span>`).join('')}</div></div>`;
        };
        render();
        const timer = setInterval(() => { index = Math.min(index + 1, stages.length - 1); render(); }, 1600);
        return () => clearInterval(timer);
    }

    function renderAnswerFlow(answer) {
        return `<div class="answer-tools"><button type="button" class="answer-speech" onclick="speakAnswer(this)" title="朗读回答" aria-label="朗读回答"></button></div><details class="answer-flow"><summary>回答流程摘要</summary><ol><li>读取当前问题与会话上下文</li><li>按需要结合可用资料</li><li>组织并生成回答</li></ol></details><div class="answer-content">${formatMarkdown(answer)}</div>`;
    }

    let activeSpeechButton = null;
    function speakAnswer(button) {
        if (!('speechSynthesis' in window)) { showToast('当前浏览器不支持朗读', 'error'); return; }
        if (activeSpeechButton === button) {
            speechSynthesis.cancel(); activeSpeechButton.classList.remove('speaking'); activeSpeechButton = null; return;
        }
        speechSynthesis.cancel();
        if (activeSpeechButton) activeSpeechButton.classList.remove('speaking');
        const content = button.closest('.bubble')?.querySelector('.answer-content')?.textContent?.trim();
        if (!content) return;
        const utterance = new SpeechSynthesisUtterance(content);
        utterance.lang = 'zh-CN'; utterance.rate = .98;
        activeSpeechButton = button; button.classList.add('speaking');
        utterance.onend = utterance.onerror = () => { button.classList.remove('speaking'); if (activeSpeechButton === button) activeSpeechButton = null; };
        speechSynthesis.speak(utterance);
    }

    let speechRecognition = null;
    function toggleVoiceInput() {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) { showToast('当前浏览器不支持语音输入，请使用 Chrome 或 Edge', 'error'); return; }
        const button = document.getElementById('voiceInputBtn');
        if (speechRecognition) { speechRecognition.stop(); return; }
        speechRecognition = new Recognition(); speechRecognition.lang = 'zh-CN'; speechRecognition.interimResults = true; speechRecognition.continuous = false;
        const original = queryInput.value;
        speechRecognition.onstart = () => { button.classList.add('listening'); showToast('正在聆听，请开始说话', 'success'); };
        speechRecognition.onresult = event => { let text = ''; for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript; queryInput.value = original + text; queryInput.dispatchEvent(new Event('input')); };
        speechRecognition.onend = () => { button.classList.remove('listening'); speechRecognition = null; };
        speechRecognition.onerror = () => { button.classList.remove('listening'); speechRecognition = null; showToast('语音识别未完成，请重试', 'error'); };
        speechRecognition.start();
    }

    // ── 更新统计 ────────────────────────────────────
    async function updateStats() {
        try {
            const res = await fetch('/api/session/stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            });
            const data = await res.json();
            document.getElementById('sessionCount').textContent = data.count || 0;
            document.getElementById('sessionTokens').textContent = data.tokens || 0;
            document.getElementById('sessionModel').textContent = data.model || 'Flash';
        } catch (e) {}

        // 获取全局统计
        try {
            const res = await fetch('/api/global/stats');
            const data = await res.json();
            document.getElementById('globalCount').textContent = data.total_questions || 0;
            document.getElementById('globalTokens').textContent = data.total_tokens || 0;
        } catch (e) {}

        // 如果已登录，获取用户统计
        if (currentUser) {
            try {
                const res = await fetch('/api/user/stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser })
                });
                const data = await res.json();
                document.getElementById('userStats').style.display = 'inline';
                document.getElementById('todayQueries').textContent = data.today_queries || 0;
                document.getElementById('todayTokens').textContent = data.today_tokens || 0;
                document.getElementById('totalQueries').textContent = data.total_queries || 0;
                document.getElementById('totalTokens').textContent = data.total_tokens || 0;
            } catch (e) {}
        }
    }

    // 定时更新统计
    setInterval(updateStats, 5000);
    updateStats();

    // ── 统计弹窗 ────────────────────────────────────
    async function showStats() {
        document.getElementById('statsModal').classList.add('show');
        // 会话统计
        document.getElementById('modalSessionCount').textContent = document.getElementById('sessionCount').textContent;
        document.getElementById('modalSessionTokens').textContent = document.getElementById('sessionTokens').textContent;

        // 用户统计
        if (currentUser) {
            document.getElementById('modalUserStats').style.display = 'block';
            try {
                const res = await fetch('/api/user/stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser })
                });
                const d = await res.json();
                document.getElementById('modalTodayQueries').textContent = d.today_queries || 0;
                document.getElementById('modalTodayTokens').textContent = d.today_tokens || 0;
                document.getElementById('modalTotalQueries').textContent = d.total_queries || 0;
                document.getElementById('modalTotalTokens').textContent = d.total_tokens || 0;
            } catch(e) {}
        }

        // 全局统计
        try {
            const res = await fetch('/api/stats/global');
            const d = await res.json();
            document.getElementById('modalGlobalUsers').textContent = d.user_count || 0;
            document.getElementById('modalGlobalQueries').textContent = d.total_queries || 0;
        } catch(e) {}
    }

    // ── 反馈功能 ──────────────────────────────────────
    function toggleFeedback() {
        const modal = document.getElementById('feedbackModal');
        modal.classList.toggle('show');
    }

    async function submitFeedback() {
        const input = document.getElementById('feedbackInput');
        const text = input.value.trim();
        if (!text) { showToast('请输入反馈内容', 'error'); return; }

        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text, session_id: sessionId })
            });
            showToast('✅ 感谢你的反馈！', 'success');
            input.value = '';
            toggleFeedback();
        } catch (err) {
            showToast('❌ 提交失败: ' + err.message, 'error');
        }
    }

    // ── 清除历史 ──────────────────────────────────────
    function getCurrentHistory() {
        try { return JSON.parse(localStorage.getItem(chatHistoryKey(sessionId)) || '[]'); } catch (e) { return []; }
    }

    function askTemplate(prompt) {
        queryInput.value = prompt;
        queryInput.focus();
        queryInput.style.height = Math.min(queryInput.scrollHeight, 120) + 'px';
    }

    function exportMarkdown() {
        const history = getCurrentHistory();
        if (!history.length) { showToast('当前会话没有可导出的内容', 'error'); return; }
        const session = getSessions().find(item => item.id === sessionId);
        const markdown = '# ' + (session?.title || 'AI 学习对话') + '\n\n' + history.map(item => (item.role === 'user' ? '## 我\n\n' : '## AI 导师\n\n') + item.content).join('\n\n');
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = (session?.title || 'ai-chat') + '.md'; link.click(); URL.revokeObjectURL(link.href);
        showToast('Markdown 已导出', 'success');
    }

    function exportPdf() {
        const history = getCurrentHistory();
        if (!history.length) { showToast('当前会话没有可导出的内容', 'error'); return; }
        const session = getSessions().find(item => item.id === sessionId);
        const popup = window.open('', '_blank');
        if (!popup) { showToast('浏览器拦截了打印窗口，请允许弹窗', 'error'); return; }
        const body = history.map(item => `<section><h3>${item.role === 'user' ? '我' : 'AI 导师'}</h3><p>${String(item.content).replace(/[&<>]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[char])).replace(/\n/g, '<br>')}</p></section>`).join('');
        popup.document.write(`<title>${session?.title || 'AI 学习对话'}</title><style>body{font:14px Microsoft YaHei,Arial;max-width:780px;margin:40px auto;color:#1d2129}h1{font-size:24px;border-bottom:1px solid #ddd;padding-bottom:12px}section{margin:22px 0;padding:14px 18px;background:#f6f7f9;border-radius:8px;line-height:1.8}h3{margin:0 0 8px;color:#3370ff}@media print{section{break-inside:avoid}}</style><h1>${session?.title || 'AI 学习对话'}</h1>${body}`);
        popup.document.close(); popup.focus(); setTimeout(() => popup.print(), 250);
    }

    async function shareCurrentChat() {
        let messages = [];
        try { messages = JSON.parse(localStorage.getItem(chatHistoryKey(sessionId)) || '[]'); } catch (e) {}
        if (!Array.isArray(messages) || messages.length === 0) {
            showToast('当前会话还没有可分享的内容', 'error');
            return;
        }

        const session = getSessions().find(item => item.id === sessionId);
        try {
            const res = await fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: session?.title || '分享对话', messages })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || '创建分享链接失败，请重启服务后重试');
            const url = location.origin + data.share_path;
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
            showToast('分享链接已复制', 'success');
        } catch (err) {
            showToast('分享失败：' + err.message, 'error');
        }
    }

    async function shareLearningResult(kind) {
        if (!currentUser) { showToast('请先登录，再分享学习成果', 'error'); showLogin(); return; }
        const history = getCurrentHistory();
        if (!history.length) { showToast('完成一轮对话后即可生成学习成果', 'error'); return; }
        const session = getSessions().find(item => item.id === sessionId);
        const questions = history.filter(item => item.role === 'user').map(item => item.content).slice(-3);
        const answers = history.filter(item => item.role === 'assistant').map(item => item.content).slice(-2);
        const title = session?.title || '我的学习成果';
        const content = kind === 'card'
            ? { '学习主题': title, '我正在学习': questions, '本次收获': answers.length ? answers[answers.length - 1].slice(0, 600) : '继续提问，沉淀你的学习收获。' }
            : { '本次学习总结': answers.length ? answers.join('\n\n').slice(0, 2200) : '暂无可总结的回答。', '继续练习': questions };
        try {
            const res = await fetch('/api/learning/share', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, kind, title, content }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || '创建学习成果失败');
            const url = location.origin + data.share_path;
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
            showToast('学习成果链接已复制', 'success');
        } catch (err) { showToast('分享失败：' + err.message, 'error'); }
    }

    async function toggleDailyPanel() {
        const panel = document.getElementById('dailyPanel');
        if (!panel.hidden) { panel.hidden = true; return; }
        if (!currentUser) { showToast('请先登录，再查看学习概览', 'error'); showLogin(); return; }
        panel.hidden = false;
        const root = document.getElementById('dailyPanelContent');
        root.innerHTML = '<div class="daily-empty">正在整理今日学习...</div>';
        try {
            const res = await fetch('/api/learning/daily/' + encodeURIComponent(currentUser));
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || '读取失败');
            renderDailyPanel(data);
        } catch (err) { root.innerHTML = '<div class="daily-empty">暂时无法读取学习概览</div>'; }
    }
    function renderDailyPanel(data) {
        const chips = values => values?.length ? values.map(item => `<span title="${escapeText(item)}">${escapeText(item)}</span>`).join('') : '<span class="daily-empty">暂无</span>';
        const reviewTopics = data.reviews?.map(item => item.topic) || [];
        document.getElementById('dailyPanelContent').innerHTML = `<div class="daily-metrics"><div class="daily-metric"><strong>${data.streak || 0}</strong><span>连续学习天数</span></div><div class="daily-metric"><strong>${data.today_queries || 0}</strong><span>今日提问</span></div><div class="daily-metric"><strong>${data.today_tokens || 0}</strong><span>今日 Token</span></div></div><div class="daily-section"><h4>今日目标</h4><div class="daily-goal"><input id="dailyGoalInput" value="${escapeText(data.goal || '')}" aria-label="今日学习目标"><button type="button" onclick="saveDailyGoal()">保存</button></div></div><div class="daily-section"><h4>正在学习</h4><div class="daily-chips">${chips(data.topics)}</div></div><div class="daily-section"><h4>待复习 ${data.review_count ? '(' + data.review_count + ')' : ''}</h4><div class="daily-chips">${chips(reviewTopics)}</div></div>`;
    }
    async function saveDailyGoal() {
        const goal = document.getElementById('dailyGoalInput').value.trim();
        try {
            const res = await fetch('/api/learning/daily/goal', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, goal }) });
            if (!res.ok) throw new Error('保存失败');
            showToast('今日目标已保存', 'success');
        } catch (err) { showToast('目标保存失败', 'error'); }
    }

    let activeLearningTab = 'plan';
    const activeQuizBySession = {};

    function getActiveQuiz() {
        return activeQuizBySession[sessionId] || [];
    }

    function escapeText(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    }

    function openLearning(tab = 'plan') {
        if (window.learningOrbDragged) { window.learningOrbDragged = false; return; }
        if (!currentUser) { showToast('请先登录，再保存你的学习进度', 'error'); showLogin(); return; }
        document.getElementById('learningDrawer').classList.add('show');
        document.getElementById('learningOrb').classList.add('active');
        document.getElementById('learningDrawer').setAttribute('aria-hidden', 'false');
        showLearningTab(tab);
    }

    function closeLearning() {
        document.getElementById('learningDrawer').classList.remove('show');
        document.getElementById('learningOrb').classList.remove('active');
        document.getElementById('learningDrawer').setAttribute('aria-hidden', 'true');
    }

    async function showLearningTab(tab) {
        activeLearningTab = tab;
        document.querySelectorAll('[data-learning-tab]').forEach(button => button.classList.toggle('active', button.dataset.learningTab === tab));
        const content = document.getElementById('learningContent');
        const subtitle = document.getElementById('learningSubtitle');
        if (tab === 'plan') { subtitle.textContent = '把目标拆成每天可完成的任务'; await renderLearningPlan(content); }
        if (tab === 'notes') { subtitle.textContent = '从当前对话沉淀可复习笔记'; await renderLearningNotes(content); }
        if (tab === 'quiz') { subtitle.textContent = '用主动回忆检验理解'; await renderLearningQuiz(content); }
        if (tab === 'mistakes') { subtitle.textContent = '优先回看还不够完整的回答'; await renderLearningMistakes(content); }
    }

    async function learningFetch(url, options = {}) {
        const res = await fetch(url, options);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || '请求失败');
        return data;
    }

    async function renderLearningPlan(content) {
        content.innerHTML = '<div class="learning-empty">正在读取学习路线...</div>';
        try {
            const data = await learningFetch('/api/learning/plan/' + encodeURIComponent(currentUser) + '/' + encodeURIComponent(sessionId));
            if (!data.plan.length) {
                content.innerHTML = `<div class="learning-form"><label for="learningGoal">给这段对话定个学习目标</label><textarea id="learningGoal" placeholder="例如：理解 RAG，并做一个小型问答应用"></textarea><button class="learning-primary" onclick="createLearningPlan()">生成学习路线</button></div>`;
                return;
            }
            const done = data.plan.filter(item => item.done).length;
            content.innerHTML = `<div class="learning-plan-summary"><p class="learning-plan-goal">${escapeText(data.goal)}</p><span class="learning-plan-count">已完成 ${done}/${data.plan.length}</span></div><div class="learning-progress"><span style="width:${Math.round(done / data.plan.length * 100)}%"></span></div>${data.plan.map(item => `<label class="learning-step ${item.done ? 'done' : ''}"><input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleLearningStep(${item.day})"><span><strong>第 ${item.day} 天 · ${escapeText(item.title)}</strong><p>${escapeText(item.task)}</p></span></label>`).join('')}<button class="learning-text-button" onclick="resetLearningPlan()">重新设定目标</button>`;
        } catch (err) { content.innerHTML = `<div class="learning-empty">${escapeText(err.message)}</div>`; }
    }

    async function createLearningPlan() {
        const goal = document.getElementById('learningGoal').value.trim();
        if (!goal) { showToast('先写下一个学习目标', 'error'); return; }
        try {
            await learningFetch('/api/learning/plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, session_id:sessionId, goal }) });
            showToast('学习路线已生成', 'success'); showLearningTab('plan');
        } catch (err) { showToast(err.message, 'error'); }
    }

    async function toggleLearningStep(day) {
        try {
            await learningFetch('/api/learning/plan/toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, session_id:sessionId, day }) });
            showLearningTab('plan');
        } catch (err) { showToast(err.message, 'error'); }
    }

    function resetLearningPlan() {
        document.getElementById('learningContent').innerHTML = `<div class="learning-form"><label for="learningGoal">新的学习目标</label><textarea id="learningGoal" placeholder="例如：理解 RAG，并做一个小型问答应用"></textarea><button class="learning-primary" onclick="createLearningPlan()">生成新路线</button></div>`;
    }

    async function renderLearningNotes(content) {
        content.innerHTML = '<div class="learning-empty">正在读取你的笔记...</div>';
        try {
            const data = await learningFetch('/api/learning/notes/' + encodeURIComponent(currentUser) + '/' + encodeURIComponent(sessionId));
            const makeButton = getCurrentHistory().length ? '<button class="learning-primary" onclick="createLearningNote()">整理当前对话为笔记</button>' : '';
            content.innerHTML = makeButton + (data.notes.length ? data.notes.map(note => `<article class="note-item"><strong>${escapeText(note.title)}</strong><p>${escapeText(note.content.replace(/^#.*\n?/, '').slice(0, 100))}${note.content.length > 100 ? '...' : ''}</p><button onclick="showLearningNote('${note.id}')">阅读笔记</button></article>`).join('') : '<div class="learning-empty">这段对话还没有笔记。完成一段讨论后，把重点整理下来。</div>');
            window.learningNotes = data.notes;
        } catch (err) { content.innerHTML = `<div class="learning-empty">${escapeText(err.message)}</div>`; }
    }

    async function createLearningNote() {
        const history = getCurrentHistory();
        if (!history.length) { showToast('当前对话还没有内容', 'error'); return; }
        try {
            await learningFetch('/api/learning/note', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, session_id:sessionId, messages:history }) });
            showToast('学习笔记已保存', 'success'); showLearningTab('notes');
        } catch (err) { showToast(err.message, 'error'); }
    }

    function showLearningNote(id) {
        const note = (window.learningNotes || []).find(item => item.id === id);
        if (!note) return;
        document.getElementById('learningContent').innerHTML = `<article class="note-reader">${renderMarkdown(note.content)}</article><button class="learning-text-button" onclick="showLearningTab('notes')">返回笔记列表</button>`;
    }

    function renderMarkdown(markdown) {
        const blocks = String(markdown || '').replace(/\r/g, '').split(/```/);
        return blocks.map((block, index) => {
            if (index % 2) return '<pre><code>' + escapeText(block.replace(/^[a-zA-Z0-9_-]+\n/, '')) + '</code></pre>';
            const lines = escapeText(block).split('\n');
            let html = '', inList = false;
            const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
            lines.forEach(line => {
                const heading = line.match(/^(#{1,6})\s+(.+)/);
                if (heading) { closeList(); const level = heading[1].length; html += '<h' + level + '>' + inlineMarkdown(heading[2]) + '</h' + level + '>'; }
                else if (/^[-*]\s+/.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inlineMarkdown(line.replace(/^[-*]\s+/, '')) + '</li>'; }
                else if (/^\d+[.)]\s+/.test(line)) { if (!inList) { html += '<ol>'; inList = true; } html += '<li>' + inlineMarkdown(line.replace(/^\d+[.)]\s+/, '')) + '</li>'; }
                else if (/^&gt;\s?/.test(line)) { closeList(); html += '<blockquote>' + inlineMarkdown(line.replace(/^&gt;\s?/, '')) + '</blockquote>'; }
                else if (line.trim()) { closeList(); html += '<p>' + inlineMarkdown(line) + '</p>'; }
                else { closeList(); }
            });
            closeList(); return html;
        }).join('');
    }

    function inlineMarkdown(text) {
        return text.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }

    (() => {
        const panel = document.getElementById('learningDrawer');
        const workspace = panel.closest('.chat-area');
        const orb = document.getElementById('learningOrb');
        const handle = document.getElementById('learningDragHandle');
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;
        handle.addEventListener('pointerdown', event => {
            if (event.target.closest('button') || window.innerWidth <= 800) return;
            const box = panel.getBoundingClientRect();
            const area = workspace.getBoundingClientRect();
            startX = event.clientX; startY = event.clientY; startLeft = box.left - area.left; startTop = box.top - area.top;
            handle.setPointerCapture(event.pointerId);
            panel.style.right = 'auto'; panel.style.bottom = 'auto'; panel.style.left = startLeft + 'px'; panel.style.top = startTop + 'px';
        });
        handle.addEventListener('pointermove', event => {
            if (!handle.hasPointerCapture(event.pointerId)) return;
            const maxLeft = Math.max(12, workspace.clientWidth - panel.offsetWidth - 12);
            const maxTop = Math.max(12, workspace.clientHeight - panel.offsetHeight - 12);
            panel.style.left = Math.min(maxLeft, Math.max(12, startLeft + event.clientX - startX)) + 'px';
            panel.style.top = Math.min(maxTop, Math.max(12, startTop + event.clientY - startY)) + 'px';
        });
        handle.addEventListener('pointerup', event => { if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); });

        let orbStartX = 0, orbStartY = 0, orbStartLeft = 0, orbStartTop = 0, orbMoved = false;
        orb.addEventListener('pointerdown', event => {
            const box = orb.getBoundingClientRect();
            const area = workspace.getBoundingClientRect();
            orbStartX = event.clientX; orbStartY = event.clientY; orbStartLeft = box.left - area.left; orbStartTop = box.top - area.top; orbMoved = false;
            orb.setPointerCapture(event.pointerId);
            orb.style.right = 'auto'; orb.style.bottom = 'auto'; orb.style.left = orbStartLeft + 'px'; orb.style.top = orbStartTop + 'px';
        });
        orb.addEventListener('pointermove', event => {
            if (!orb.hasPointerCapture(event.pointerId)) return;
            const deltaX = event.clientX - orbStartX, deltaY = event.clientY - orbStartY;
            if (Math.abs(deltaX) + Math.abs(deltaY) > 4) orbMoved = true;
            const maxLeft = Math.max(12, workspace.clientWidth - orb.offsetWidth - 12);
            const maxTop = Math.max(12, workspace.clientHeight - orb.offsetHeight - 12);
            orb.style.left = Math.min(maxLeft, Math.max(12, orbStartLeft + deltaX)) + 'px';
            orb.style.top = Math.min(maxTop, Math.max(12, orbStartTop + deltaY)) + 'px';
        });
        orb.addEventListener('pointerup', event => {
            if (orb.hasPointerCapture(event.pointerId)) orb.releasePointerCapture(event.pointerId);
            if (orbMoved) window.learningOrbDragged = true;
        });
    })();

    async function renderLearningQuiz(content) {
        const quiz = getActiveQuiz();
        if (!quiz.length) {
            content.innerHTML = `<div class="quiz-setup"><p>由 AI 读取本会话内容，生成 3 道贴近当前学习主题的练习。</p><label class="quiz-source-toggle"><input id="useCurrentSessionQuiz" type="checkbox" checked> 根据当前会话出题</label><button class="learning-primary" onclick="createLearningQuiz()">AI 生成练习</button></div>`;
            return;
        }
        content.innerHTML = `<div class="quiz-setup"><label class="quiz-source-toggle"><input id="useCurrentSessionQuiz" type="checkbox" checked> 根据当前会话出题</label><button class="learning-text-button" onclick="createLearningQuiz()">重新生成练习</button></div>` + quiz.map((item, index) => `<article class="quiz-item"><strong>${index + 1}. ${escapeText(item.question)}</strong><p>${escapeText(item.hint)}</p><textarea class="practice-answer" id="practiceAnswer${index}" placeholder="写下你的答案"></textarea><button class="learning-primary" onclick="submitPractice(${index})">提交回答</button><p id="practiceFeedback${index}"></p></article>`).join('');
    }

    async function createLearningQuiz() {
        const option = document.getElementById('useCurrentSessionQuiz');
        const useCurrentSession = option ? option.checked : true;
        const content = document.getElementById('learningContent');
        content.innerHTML = `<div class="quiz-generating"><div class="quiz-generating-head"><span class="answer-progress-orbit"></span><span>AI 正在生成练习<span class="loading-dots"></span></span></div><p>${useCurrentSession ? '正在读取当前会话并设计递进题目。' : '正在根据最近讨论内容设计题目。'}</p><div class="quiz-generating-track"></div></div>`;
        try {
            const data = await learningFetch('/api/learning/quiz', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, session_id:sessionId, messages:getCurrentHistory(), use_current_session:useCurrentSession }) });
            activeQuizBySession[sessionId] = data.quiz || []; showToast('AI 已生成本会话练习', 'success'); showLearningTab('quiz');
        } catch (err) { showToast(err.message, 'error'); }
    }

    async function submitPractice(index) {
        const answer = document.getElementById('practiceAnswer' + index).value.trim();
        if (!answer) { showToast('先写下你的答案', 'error'); return; }
        try {
            const item = getActiveQuiz()[index];
            const data = await learningFetch('/api/learning/attempt', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:currentUser, session_id:sessionId, question:item.question, answer }) });
            document.getElementById('practiceFeedback' + index).textContent = data.feedback;
        } catch (err) { showToast(err.message, 'error'); }
    }

    async function renderLearningMistakes(content) {
        content.innerHTML = '<div class="learning-empty">正在读取错题本...</div>';
        try {
            const data = await learningFetch('/api/learning/mistakes/' + encodeURIComponent(currentUser) + '/' + encodeURIComponent(sessionId));
            content.innerHTML = data.mistakes.length ? data.mistakes.map(item => `<article class="mistake-item"><strong>${escapeText(item.question)}</strong><p>你的回答：${escapeText(item.answer)}</p></article>`).join('') : '<div class="learning-empty">暂时没有需要回看的回答。练习时写得更完整，就能逐步清空这里。</div>';
        } catch (err) { content.innerHTML = `<div class="learning-empty">${escapeText(err.message)}</div>`; }
    }

    function renderSessionItems(sessions) {
        sessionListEl.textContent = '';
        if (!sessions.length) {
            sessionListEl.textContent = '暂无历史会话';
            return;
        }
        sessions.forEach(s => {
            const item = document.createElement('div');
            item.className = `session-item ${s.id === sessionId ? 'active' : ''}`;
            item.dataset.sessionId = s.id;
            item.onclick = () => loadSession(s.id);
            const title = document.createElement('span');
            title.className = 'session-title';
            title.textContent = s.title;
            const edit = document.createElement('button');
            edit.className = 'edit'; edit.title = '重命名'; edit.textContent = '✎';
            edit.onclick = event => { event.stopPropagation(); renameSession(s.id); };
            const del = document.createElement('button');
            del.className = 'del'; del.title = '删除会话'; del.textContent = '×';
            del.onclick = event => { event.stopPropagation(); requestConfirm('删除会话', '删除后无法恢复该会话及其本地记录。', () => deleteSession(s.id)); };
            item.append(title, edit, del); sessionListEl.appendChild(item);
        });
    }

    function renameSession(sid) {
        const session = getSessions().find(item => item.id === sid);
        const row = sessionListEl.querySelector(`[data-session-id="${sid}"]`);
        if (!session || !row || row.querySelector('.rename-input')) return;
        const input = document.createElement('input');
        input.className = 'rename-input'; input.value = session.title; input.maxLength = 40;
        row.replaceChildren(input); input.focus(); input.select();
        let finished = false;
        const finish = save => {
            if (finished) return; finished = true;
            if (save && input.value.trim()) upsertSession(sid, input.value.trim()); else renderSessions();
        };
        input.onkeydown = event => { if (event.key === 'Enter') finish(true); if (event.key === 'Escape') finish(false); };
        input.onblur = () => finish(true);
    }

    async function clearHistoryLegacy() {
        return;
        await fetch('/api/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        localStorage.removeItem(chatHistoryKey(sessionId));
        renderEmpty();
        showToast('✅ 对话已清除', 'success');
    }

    // ── UI 辅助 ──────────────────────────────────────
    async function clearHistory() {
        requestConfirm('清除当前对话', '这会移除当前会话中的全部消息记录。', async () => {
            await fetch('/api/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ session_id:sessionId, username:currentUser || 'anonymous' }) });
            localStorage.removeItem(chatHistoryKey(sessionId));
            renderEmpty();
            showToast('对话已清除', 'success');
        }, '清除');
    }

    function addMessage(role, content) {
        const es = document.getElementById('emptyState');
        if (es) es.remove();

        const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.id = id;

        const avatar = role === 'user' ? '🧑‍🎓' : '🤖';
        // 用户消息原样显示，AI 消息用 markdown 渲染
        const bubbleHtml = role === 'user' ? content : (content ? renderAnswerFlow(content) : '');
        div.innerHTML = `
            <div class="avatar">${avatar}</div>
            <div class="bubble">${bubbleHtml}</div>
        `;

        div.querySelector('.avatar').textContent = role === 'user' ? getUserAvatar() : getAiAvatar();
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return id;
    }

    function renderFileList() {
        if (uploadedFiles.length === 0) {
            fileList.innerHTML = '';
            return;
        }
        fileList.innerHTML = uploadedFiles.map(f => `
            <div class="file-item">📄 ${f.name}</div>
        `).join('');
    }

    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    // ── 自动调整输入框高度 ──────────────────────────
    queryInput.addEventListener('input', () => {
        queryInput.style.height = 'auto';
        queryInput.style.height = Math.min(queryInput.scrollHeight, 120) + 'px';
    });

    // ── 模型切换 ────────────────────────────────────
    let proApiKey = localStorage.getItem('proApiKey') || '';

    async function syncCurrentModel() {
        try {
            const res = await fetch('/api/models');
            const data = await res.json();
            const current = data.models?.find(model => model.current);
            if (current) { document.getElementById('modelSelect').value = current.id; updateModelTrigger(current.id); }
        } catch (err) {
            showToast('无法读取当前模型状态', 'error');
        }
    }
    syncCurrentModel();

    async function onModelChange(select) {
        const modelId = select.value;
        await switchModel(modelId, '');
    }

    async function switchModel(modelId, apiKey) {
        try {
            const res = await fetch('/api/models/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: modelId, pro_api_key: apiKey || '' })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                document.getElementById('modelSelect').value = data.current;
                updateModelTrigger(data.current);
                showToast({ flash:'已切换到 Free', glm:'已切换到 Flash', pro:'已切换到 Pro' }[data.current] || '模型已切换', 'success');
                updateStats();
            } else {
                showToast('❌ 切换失败', 'error');
            }
        } catch (err) {
            document.getElementById('modelSelect').value = 'flash';
            showToast('模型切换失败：' + err.message, 'error');
        }
    }

    // ── Markdown 渲染（用 marked 库，排版稳定不乱） ─────
    function formatMarkdown(text) {
        if (typeof marked !== "undefined") {
            try {
                return marked.parse(text);
            } catch (e) {
                console.error("marked 渲染失败:", e);
            }
        }
        // marked 没加载时的兜底
        return text
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/\n/g, "<br>");
    }
