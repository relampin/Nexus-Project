function getProjectActiveId() {
    return globalState.activeProject?.project?.id || null;
}

async function fetchJsonMaybe(url, options = {}) {
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        let data = null;
        if (text) {
            try { data = JSON.parse(text); } catch(_) { data = text; }
        }
        if (!res.ok) {
            return { ok: false, status: res.status, data };
        }
        return { ok: true, status: res.status, data };
    } catch (error) {
        return { ok: false, error };
    }
}

function maybeFetchText(value, fallback = '') {
    return textOrFallback(value, fallback);
}

function normalizeTaskList(tasks) {
    return toArray(tasks)
        .map((task, index) => ({
            ...task,
            __index: index,
            __title: maybeFetchText(task?.title || task?.name || task?.summary, 'Tarefa sem título'),
            __status: textOrFallback(task?.status, 'pending').toLowerCase(),
            __priority: textOrFallback(task?.priority, 'medium').toLowerCase()
        }))
        .filter(task => task.__title);
}

function normalizeTimelineEntries(entries) {
    return toArray(entries).map((entry, index) => ({
        ...entry,
        __index: index,
        __title: maybeFetchText(entry?.title || entry?.summary || entry?.message, 'Evento sem título'),
        __details: maybeFetchText(entry?.details || entry?.detail || entry?.message || entry?.summary || entry?.title, 'Sem detalhes'),
        __kind: textOrFallback(entry?.kind || entry?.type || entry?.status, 'info').toLowerCase()
    }));
}

async function hydrateProjectDetails(projectId) {
    if (!projectId) return;
    if (projectDetailsLoadedFor === projectId) return;
    projectDetailsLoadedFor = projectId;

    const endpoints = [
        ['radar', `/projects/${projectId}/radar`],
        ['timeline', `/projects/${projectId}/timeline`],
        ['git', `/projects/${projectId}/git`],
        ['validation', `/projects/${projectId}/validation`],
        ['digest', `/projects/${projectId}/digest/daily`],
        ['tasks', `/projects/${projectId}/tasks`]
    ];

    const results = await Promise.allSettled(endpoints.map(([, url]) => fetchJsonMaybe(`${API_BASE}${url}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
    })));
    const next = { ...(globalState.activeProject || {}) };
    let hasLoadedData = false;

    results.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value?.ok) return;
        hasLoadedData = true;
        const key = endpoints[index][0];
        const data = result.value.data;
        if (key === 'tasks') {
            if (data?.agendaOperational) next.agendaOperational = data.agendaOperational;
            if (data?.agenda) next.agenda = data.agenda;
            if (data?.taskBoard) next.taskBoard = data.taskBoard;
            if (data?.tasks) next.tasks = data.tasks;
        } else {
            next[key] = data;
        }
    });

    globalState.activeProject = next;
    renderActiveProject();
    if (!hasLoadedData) {
        projectDetailsLoadedFor = null;
    }
}

async function triggerRadarAction(actionId) {
    const projectId = getProjectActiveId();
    if (!projectId || !actionId) return;

    const action = toArray(globalState.activeProject?.radar?.actions).find(item => String(item.id) === String(actionId));
    if (action?.label && action.actionUrl) {
        window.open(action.actionUrl, '_blank', 'noopener,noreferrer');
        return;
    }

    try {
        const result = await fetchJsonMaybe(`${API_BASE}/projects/${projectId}/radar/actions/${encodeURIComponent(actionId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!result.ok) throw new Error('radar action failed');
        projectDetailsLoadedFor = null;
        await refreshBootstrap();
    } catch (error) {
        console.error(error);
        alert('Não consegui executar essa ação do radar agora.');
    }
}

async function runProjectValidation() {
    const projectId = getProjectActiveId();
    if (!projectId) return;
    const btn = document.getElementById('btnRunValidation');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Validando...';
    }

    try {
        const result = await fetchJsonMaybe(`${API_BASE}/projects/${projectId}/validation/run`, { method: 'POST' });
        if (!result.ok) throw new Error('validation run failed');
        projectDetailsLoadedFor = null;
        await refreshBootstrap();
    } catch (error) {
        console.error(error);
        alert('Falha ao disparar a validação automática.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Rodar validação';
        }
    }
}

async function searchProject(q) {
    const projectId = getProjectActiveId();
    const meta = document.getElementById('searchMeta');
    const results = document.getElementById('searchResults');
    const query = textOrFallback(q).trim();

    if (!results || !meta) return;
    if (!projectId) {
        results.innerHTML = '<div class="empty-state">Selecione um projeto para pesquisar.</div>';
        return;
    }
    if (!query) {
        results.innerHTML = '<div class="empty-state">Digite um termo para buscar tarefas, logs, comandos, arquivos ou resumo.</div>';
        meta.textContent = 'Digite para procurar no snapshot ativo.';
        return;
    }

    meta.textContent = `Pesquisando por "${query}"...`;
    results.innerHTML = '<div class="empty-state">Buscando...</div>';

    const result = await fetchJsonMaybe(`${API_BASE}/projects/${projectId}/search?q=${encodeURIComponent(query)}`);
    if (!result.ok) {
        results.innerHTML = '<div class="empty-state">A busca global não respondeu agora.</div>';
        meta.textContent = 'Busca indisponível temporariamente.';
        return;
    }

    const data = result.data || {};
    const items = toArray(data.results || data.items || data.matches || data.data);
    meta.textContent = `${items.length} resultado(s) para "${query}".`;
    results.innerHTML = items.length ? items.slice(0, 8).map((item) => {
        const title = textOrFallback(item.title || item.name || item.label || item.path || item.summary, 'Resultado');
        const kind = textOrFallback(item.kind || item.type || item.scope || 'item').toUpperCase();
        const excerpt = textOrFallback(item.excerpt || item.summary || item.details || item.description || '');
        const actionText = textOrFallback(item.actionText || 'Abrir');
        const actionId = item.commandId || item.id || item.path || '';
        const safeAction = String(actionId).replace(/'/g, '&#39;');
        const openHandler = item.openUrl
            ? `window.open('${String(item.openUrl).replace(/'/g, '&#39;')}', '_blank', 'noopener,noreferrer')`
            : (item.commandId ? `openCommandDrawer('${safeAction}')` : (item.path ? `openFilePreview('${encodeURIComponent(String(item.path))}')` : ''));

        return `
            <div class="search-item">
                <div class="search-title">${safeHtml(title)}</div>
                <div class="search-meta-row"><span>${safeHtml(kind)}</span>${item.scope ? `<span>${safeHtml(textOrFallback(item.scope).toUpperCase())}</span>` : ''}</div>
                <div style="margin-top:0.5rem; color:var(--text-muted); line-height:1.5;">${safeHtml(excerpt || 'Sem trecho adicional.')}</div>
                ${openHandler ? `<div class="task-actions"><button class="btn-secondary" type="button" onclick="${openHandler}">${safeHtml(actionText)}</button></div>` : ''}
            </div>
        `;
    }).join('') : '<div class="empty-state">Nenhum resultado encontrado para esta busca.</div>';
}

function queueGlobalSearch(value) {
    clearTimeout(projectSearchTimer);
    projectSearchTimer = setTimeout(() => searchProject(value), 250);
}

function runGlobalSearchFromInput() {
    const input = document.getElementById('projectSearchInput');
    if (input) searchProject(input.value);
}
