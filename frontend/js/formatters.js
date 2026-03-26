function safeHtml(value) {
    return escapeHtml(textOrFallback(value));
}

function formatStatusBadgeClass(status) {
    if (status === 'awaiting_external') return 'badge badge-health-risky';
    if (status === 'completed') return 'badge badge-state-active';
    if (status === 'failed') return 'badge badge-health-risky';
    return 'badge badge-health-steady';
}

function clipText(value, maxLength = 160) {
    const text = textOrFallback(value);
    if (text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

function formatCommandStatusText(status) {
    const labels = {
        pending: 'Pendente',
        processing: 'Processando',
        awaiting_external: 'Aguardando agente',
        completed: 'Concluído',
        failed: 'Falhou'
    };
    return labels[String(status || '').toLowerCase()] || textOrFallback(status, 'Desconhecido');
}

function formatCommandRoute(command) {
    return `${textOrFallback(command?.source, 'system')} -> ${textOrFallback(command?.target, 'agent')}`;
}

function getCommandText(command) {
    return textOrFallback(command?.payload?.text, 'Sem instrução clara.');
}

function getCommandTitle(command) {
    const metaTitle = textOrFallback(command?.meta?.taskTitle);
    if (metaTitle) return metaTitle;

    const firstMeaningfulLine = getCommandText(command)
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(line => line && !/^contexto\b/i.test(line));

    return clipText(firstMeaningfulLine || 'Sem instrução clara.', 90);
}

function getCommandSnippet(command) {
    const rawLines = getCommandText(command)
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const cleaned = rawLines.filter(line => line !== getCommandTitle(command));
    return clipText(cleaned.join(' '), 180) || 'Clique na seta para ver o conteúdo completo.';
}

function syncCommandExpansionState(commands) {
    const current = globalState.commandExpansion || {};
    const next = {};

    (Array.isArray(commands) ? commands : []).forEach(command => {
        if (current[command.id]) {
            next[command.id] = true;
        }
    });

    globalState.commandExpansion = next;
}

function renderCommandsList(commands) {
    const list = document.getElementById('commandsList');
    const items = Array.isArray(commands) ? commands : [];

    syncCommandExpansionState(items);

    if (!items.length) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">Lista vazia.</div>';
        return;
    }

    list.innerHTML = items.map(command => {
        const expanded = Boolean(globalState.commandExpansion?.[command.id]);
        const route = formatCommandRoute(command).toUpperCase();
        const title = getCommandTitle(command);
        const snippet = getCommandSnippet(command);
        const updatedAt = command.updatedAt ? new Date(command.updatedAt).toLocaleString() : '--';
        const detailText = safeHtml(getCommandText(command)).replace(/\n/g, '<br/>');

        return `
            <div class="cmd-item${expanded ? ' expanded' : ''}" data-command-id="${command.id}">
                <button type="button" class="cmd-header" onclick="toggleCommandExpand('${command.id}')">
                    <div class="cmd-main">
                        <span class="cmd-chevron">▶</span>
                        <div class="cmd-summary">
                            <div class="cmd-title-row">
                                <span class="cmd-title">${safeHtml(title)}</span>
                                <span class="cmd-route">${safeHtml(route)}</span>
                            </div>
                            <div class="cmd-snippet">${safeHtml(snippet)}</div>
                        </div>
                    </div>
                    <div class="cmd-actions">
                        <span class="badge" style="background:var(--bg); border:1px solid var(--border); color:var(--text-muted);">${safeHtml(textOrFallback(command.target, 'agent'))}</span>
                        <span class="${formatStatusBadgeClass(command.status)}">${safeHtml(formatCommandStatusText(command.status))}</span>
                    </div>
                </button>
                <div class="cmd-details">
                    <div class="cmd-detail-meta">
                        <span>${safeHtml(updatedAt)}</span>
                        <span>${safeHtml(textOrFallback(command.kind, 'task')).toUpperCase()}</span>
                        <span>${safeHtml(route)}</span>
                    </div>
                    <div class="cmd-detail-text">${detailText}</div>
                    <div class="cmd-detail-footer">
                        <button type="button" class="cmd-open-btn" onclick="openCommandDrawer('${command.id}')">Abrir detalhes</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleCommandExpand(commandId) {
    globalState.commandExpansion = {
        ...(globalState.commandExpansion || {}),
        [commandId]: !globalState.commandExpansion?.[commandId]
    };

    const item = document.querySelector(`.cmd-item[data-command-id="${commandId}"]`);
    if (item) {
        item.classList.toggle('expanded', Boolean(globalState.commandExpansion[commandId]));
    }
}

function getFileKey(file) {
    return encodeURIComponent(file?.path || '');
}

function getFileSnippet(file) {
    const preview = textOrFallback(file?.preview);
    if (preview) {
        return clipText(preview.replace(/\s+/g, ' '), 180);
    }

    const category = textOrFallback(file?.category, 'arquivo');
    const extension = textOrFallback(file?.extension || 'sem extensão');
    return `Arquivo da categoria ${category} (${extension}). Expanda para ver mais ou abra no drawer.`;
}

function syncFileExpansionState(files) {
    const current = globalState.fileExpansion || {};
    const next = {};

    (Array.isArray(files) ? files : []).forEach(file => {
        const key = getFileKey(file);
        if (current[key]) {
            next[key] = true;
        }
    });

    globalState.fileExpansion = next;
}

function toggleFileExpand(encodedPath) {
    globalState.fileExpansion = {
        ...(globalState.fileExpansion || {}),
        [encodedPath]: !globalState.fileExpansion?.[encodedPath]
    };

    const item = document.querySelector(`.file-item[data-file-key="${encodedPath}"]`);
    if (item) {
        item.classList.toggle('expanded', Boolean(globalState.fileExpansion[encodedPath]));
    }
}

function getLogEntryKey(entry, index) {
    return `${textOrFallback(entry?.timestamp, 'sem-data')}::${textOrFallback(entry?.agent, 'system')}::${index}`;
}

function getLogStatusBadgeClass(status) {
    if (status === 'success') return 'badge badge-state-active';
    if (status === 'warning' || status === 'error') return 'badge badge-health-risky';
    return 'badge badge-health-steady';
}

function getLogSnippet(entry) {
    const detail = textOrFallback(entry?.details || entry?.message || entry?.summary);
    return clipText(detail || 'Clique na seta para ver mais contexto deste evento.', 180);
}

function syncLogExpansionState(entries) {
    const current = globalState.logExpansion || {};
    const next = {};

    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
        const key = encodeURIComponent(getLogEntryKey(entry, index));
        if (current[key]) {
            next[key] = true;
        }
    });

    globalState.logExpansion = next;
}

function toggleLogExpand(encodedKey) {
    globalState.logExpansion = {
        ...(globalState.logExpansion || {}),
        [encodedKey]: !globalState.logExpansion?.[encodedKey]
    };

    const item = document.querySelector(`.log-card[data-log-key="${encodedKey}"]`);
    if (item) {
        item.classList.toggle('expanded', Boolean(globalState.logExpansion[encodedKey]));
    }
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.items)) return value.items;
    if (value && Array.isArray(value.entries)) return value.entries;
    return [];
}
