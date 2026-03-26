function renderSidebar() {
    const list = document.getElementById('projectsList');
    const items = Array.isArray(globalState.projects) ? globalState.projects : [];
    if(!items.length) {
        list.innerHTML = '<div style="padding:1rem; color:var(--text-muted); font-size:0.85rem">Nenhum projeto encontrado.</div>';
        return;
    }

    const activeId = globalState.activeProject?.project?.id;

    list.innerHTML = items.map(item => {
        const project = item.project || item;
        const settings = item.settings || {};
        const isActive = project.id === activeId;
        const color = settings.colorToken || 'var(--text-muted)';
        
        return `
            <div class="project-item ${isActive ? 'active' : ''}" onclick="switchProject('${project.id}')">
                <div class="project-icon" style="background: ${color}22; color: ${color}; border: 1px solid ${color}44;">
                    ${safeHtml(settings.icon ? settings.icon.substring(0,1).toUpperCase() : project.name.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    <div style="font-size: 0.9rem; font-weight: 600;">${safeHtml(project.name)}</div>
                    <div style="font-size: 0.75rem; opacity: 0.7;">Estado: ${safeHtml(project.state)}</div>
                </div>
            </div>
        `;
    }).join('');
}

async function switchProject(projectId) {
    if(globalState.activeProject?.project?.id === projectId) return;
    
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    try {
        await fetch(`${API_BASE}/projects/active`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ projectId })
        });
        // Sincronia passiva via SSE Snapshot 
    } catch(e) {
        console.error("Erro ao trocar projeto", e);
    }
}

function createNewProject() {
    projectModalMode = 'create';
    openNewProjectModal();
}

function openNewProjectModal() {
    document.getElementById('newProjectOverlay').style.display = 'block';
    document.getElementById('newProjectModal').style.display = 'flex';
    document.getElementById('projectModalTitle').textContent = 'Importar workspace';
    document.getElementById('projectModalDescription').textContent = 'Atribua diretamente a pasta raiz de um projeto que voc\u00EA possui. O Nexus far\u00E1 o indexamento e inferir\u00E1 a stack de in\u00EDcio.';
    document.getElementById('projectModalSubmit').textContent = 'Registrar';
    document.getElementById('inpProjectRoot').value = '';
    const nameInput = document.getElementById('inpProjectName');
    nameInput.value = '';
    delete nameInput.dataset.touchedByUser;
    document.getElementById('inpProjectRoot').focus();
}

function openLinkProjectModal() {
    const snap = globalState.activeProject;
    if(!snap?.project) return;
    projectModalMode = 'link';
    document.getElementById('newProjectOverlay').style.display = 'block';
    document.getElementById('newProjectModal').style.display = 'flex';
    document.getElementById('projectModalTitle').textContent = 'Ligar pasta ao projeto';
    document.getElementById('projectModalDescription').textContent = `Conecte uma pasta real ao projeto "${textOrFallback(snap.project.name)}" para o Nexus ler os arquivos, entender a estrutura e atualizar o painel.`;
    document.getElementById('projectModalSubmit').textContent = 'Ligar Pasta';
    document.getElementById('inpProjectRoot').value = snap.settings?.projectRoot || '';
    const nameInput = document.getElementById('inpProjectName');
    nameInput.value = snap.project.name || '';
    delete nameInput.dataset.touchedByUser;
    document.getElementById('inpProjectRoot').focus();
}

function closeNewProjectModal() {
    document.getElementById('newProjectOverlay').style.display = 'none';
    document.getElementById('newProjectModal').style.display = 'none';
}

function suggestProjectName() {
    const root = document.getElementById('inpProjectRoot').value.trim();
    if(root) {
        const parts = root.split(/[/\\]/).filter(Boolean);
        const suggestion = parts.length ? parts[parts.length-1] : '';
        const nameInput = document.getElementById('inpProjectName');
        if(!nameInput.dataset.touchedByUser) {
            nameInput.value = suggestion;
        }
    }
}
document.getElementById('inpProjectName').addEventListener('input', (e) => e.target.dataset.touchedByUser = 'true');

async function submitNewProject() {
    const rootVal = document.getElementById('inpProjectRoot').value.trim();
    const nameVal = document.getElementById('inpProjectName').value.trim();
    if(projectModalMode === 'link') {
        if(!rootVal) { alert("Informe o caminho da pasta para ligar ao projeto."); return; }
        if(!globalState.activeProject?.project?.id) { alert("N\u00E3o encontrei o projeto ativo para ligar a pasta."); return; }

        closeNewProjectModal();
        try {
            const response = await fetch(`${API_BASE}/projects/${globalState.activeProject.project.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    name: nameVal || globalState.activeProject.project.name,
                    settings: {
                        projectRoot: rootVal
                    }
                })
            });
            if(!response.ok) throw new Error('link failed');
            await refreshBootstrap();
        } catch(e) {
            alert("Erro ao ligar a pasta neste projeto");
        }
        return;
    }

    if(!nameVal) { alert("Informe pelo menos um nome (obrigatório)."); return; }
    
    closeNewProjectModal();
    try {
        const response = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: nameVal,
                state: 'active',
                settings: {
                    colorToken: '#06b6d4',
                    projectRoot: rootVal || undefined
                }
            })
        });
        if(!response.ok) throw new Error('create failed');
        await refreshBootstrap();
    } catch(e) {
        alert("Erro ao criar/importar projeto");
    }
}

async function rescanActiveProject() {
    if(!globalState.activeProject || !globalState.activeProject.project) return;
    const btn = document.getElementById('btnRescan');
    try {
        if(btn) { btn.disabled = true; btn.textContent = 'Indexando...'; }
        await fetch(`${API_BASE}/projects/${globalState.activeProject.project.id}/rescan`, { method: 'POST' });
        if(btn) { btn.disabled = false; btn.textContent = 'Reindexar Workspace'; }
        await refreshBootstrap();
    } catch(e) {
        console.error("Rescan falhou", e);
        if(btn) { btn.disabled = false; btn.textContent = 'Falha - Tentar Novamente'; }
    }
}

async function deleteActiveProject() {
    const snap = globalState.activeProject;
    if(!snap?.project?.id) return;
    const confirmed = window.confirm(`Excluir o projeto "${snap.project.name}" do painel Nexus?`);
    if(!confirmed) return;

    const btn = document.getElementById('btnDeleteProject');
    try {
        btn.disabled = true;
        btn.textContent = 'Excluindo...';
        const response = await fetch(`${API_BASE}/projects/${snap.project.id}`, { method: 'DELETE' });
        if(!response.ok) throw new Error('delete failed');
        await refreshBootstrap();
    } catch(e) {
        console.error("Falha ao excluir projeto", e);
        alert("Não consegui excluir esse projeto agora.");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Excluir Projeto';
    }
}

function renderActiveProject() {
    const snap = globalState.activeProject;
    if(!snap || !snap.project) return;

    // Header Titles & Badges
    document.getElementById('activeProjectName').textContent = snap.project.name;
    const badges = [];
    if(snap.project.state) badges.push(`<div class="badge badge-state-${snap.project.state}">${snap.project.state}</div>`);
    if(snap.dashboard?.status?.health) badges.push(`<div class="badge badge-health-${snap.dashboard.status.health}">${snap.dashboard.status.health}</div>`);
    document.getElementById('activeProjectBadges').innerHTML = badges.join('');

    // Workspace Metadata
    const wsInfo = document.getElementById('workspaceInfo');
    const btnRescan = document.getElementById('btnRescan');
    const btnLinkProjectRoot = document.getElementById('btnLinkProjectRoot');
    const settings = snap.settings || {};
    
    if(settings.projectRoot) {
        wsInfo.style.display = 'flex';
        document.getElementById('wsPath').textContent = `Pasta: ${textOrFallback(settings.projectRoot)}`;
        document.getElementById('wsStack').textContent = textOrFallback(settings.stackHint, 'Stack genérica');
        document.getElementById('wsIndexed').textContent = settings.lastIndexedAt ? `Indexado: ${new Date(settings.lastIndexedAt).toLocaleTimeString()}` : 'Indexando...';
        btnRescan.style.display = 'inline-block';
        btnLinkProjectRoot.style.display = 'none';
    } else {
        wsInfo.style.display = 'none';
        btnRescan.style.display = 'none';
        btnLinkProjectRoot.style.display = 'inline-block';
    }

    // Metrics
    const prog = snap.dashboard?.progress || {};
    document.getElementById('mOverall').textContent = (prog.overallPct || 0) + '%';
    document.getElementById('mOverallBar').style.width = (prog.overallPct || 0) + '%';
    
    document.getElementById('mTasks').textContent = (prog.tasksPct || 0) + '%';
    document.getElementById('mTasksBar').style.width = (prog.tasksPct || 0) + '%';
    
    document.getElementById('mMilestones').textContent = (prog.milestonesPct || 0) + '%';
    document.getElementById('mMilestonesBar').style.width = (prog.milestonesPct || 0) + '%';
    
    document.getElementById('mCommands').textContent = (prog.commandsPct || 0) + '%';
    document.getElementById('mCommandsBar').style.width = (prog.commandsPct || 0) + '%';

    // Direction + Agenda Focus
    const openMilestones = (Array.isArray(snap.milestones) ? snap.milestones : []).filter(item => item.status !== 'completed');
    const actionableTasks = (Array.isArray(snap.tasks) ? snap.tasks : [])
        .filter(item => item.status !== 'completed')
        .sort((left, right) => {
            const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
            const leftRank = priorityRank[left.priority] ?? 9;
            const rightRank = priorityRank[right.priority] ?? 9;
            if(leftRank !== rightRank) return leftRank - rightRank;
            const leftDue = left.dueDate ? Date.parse(left.dueDate) : Number.POSITIVE_INFINITY;
            const rightDue = right.dueDate ? Date.parse(right.dueDate) : Number.POSITIVE_INFINITY;
            return leftDue - rightDue;
        });
    const topTask = actionableTasks[0];
    const topMilestone = openMilestones[0];
    const directionHeadline = topMilestone?.title || topTask?.title || snap.project.description || 'Projeto sem destino definido ainda.';
    const directionSubline = topMilestone?.description || snap.project.description || 'Conecte milestones e tarefas para o Nexus mostrar um caminho mais claro.';
    document.getElementById('directionHeadline').textContent = directionHeadline;
    document.getElementById('directionSubline').textContent = directionSubline;
    document.getElementById('directionObjective').textContent = snap.dashboard?.status?.nextFocus || topTask?.title || 'Nenhum objetivo imediato mapeado.';
    document.getElementById('directionMilestone').textContent = topMilestone?.title || 'Nenhum milestone em aberto.';
    document.getElementById('directionNextTask').textContent = textOrFallback(topTask?.title, 'Nenhuma próxima entrega definida.');
    document.getElementById('directionStateBadge').textContent = (snap.project.state || 'active').toUpperCase();
    document.getElementById('directionStateBadge').className = `badge badge-state-${snap.project.state || 'active'}`;
    document.getElementById('directionHealthBadge').textContent = (snap.dashboard?.status?.health || 'steady').toUpperCase();
    document.getElementById('directionHealthBadge').className = `badge badge-health-${snap.dashboard?.status?.health || 'steady'}`;

    document.getElementById('focusAlert').innerHTML = `<strong>Foco Atual:</strong> ${snap.dashboard?.status?.nextFocus || 'Nenhum foco definido'}`;
    document.getElementById('agendaGoal').textContent = topMilestone?.description || topMilestone?.title || snap.project.description || 'O projeto ainda precisa de milestones e tarefas mais claras para o painel apontar um destino concreto.';
    const agendaC = snap.dashboard?.agendaCounts || {};
    document.getElementById('agOverdue').textContent = agendaC.overdue || 0;
    document.getElementById('agToday').textContent = agendaC.today || 0;
    document.getElementById('agUpcoming').textContent = agendaC.upcoming || 0;
    document.getElementById('agendaPriorityList').innerHTML = actionableTasks.slice(0, 4).map(task => {
        const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Sem prazo';
        const sendLabel = task.status === 'in_progress' ? 'Reenviar para o agente' : 'Enviar para o agente';
        return `
            <div style="padding:0.85rem 0.95rem; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03);">
                <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start;">
                    <div style="font-size:0.9rem; color:var(--text); line-height:1.45;">${safeHtml(task.title || 'Tarefa sem título')}</div>
                    <span class="badge" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); color:var(--text-muted);">${(task.priority || 'medium').toUpperCase()}</span>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.45rem;">Prazo: ${dueLabel}</div>
                ${task.description ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.45rem; line-height:1.45;">${safeHtml(task.description)}</div>` : ''}
                <div style="display:flex; justify-content:flex-end; margin-top:0.75rem;">
                    <button class="btn-secondary" style="padding:0.45rem 0.75rem; font-size:0.78rem; border-color:rgba(6, 182, 212, 0.35); color:var(--secondary);" onclick="dispatchAgendaTask('${task.id}', this)">${sendLabel}</button>
                </div>
            </div>
        `;
    }).join('') || '<div style="color:var(--text-muted); font-size:0.85rem; padding:0.9rem; border:1px dashed var(--border); border-radius:8px;">Nenhuma tarefa priorizada ainda.</div>';
    document.getElementById('milestoneRoadmapList').innerHTML = openMilestones.slice(0, 4).map(item => `
        <div style="padding:0.85rem 0.95rem; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03);">
            <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start;">
                <div style="font-size:0.9rem; color:var(--text); line-height:1.45;">${safeHtml(item.title || 'Marco sem título')}</div>
                <span class="badge badge-state-${item.status || 'pending'}">${(item.status || 'pending').toUpperCase()}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.45rem;">${safeHtml(item.description || 'Sem detalhe adicional para este marco.')}</div>
        </div>
    `).join('') || '<div style="color:var(--text-muted); font-size:0.85rem; padding:0.9rem; border:1px dashed var(--border); border-radius:8px;">Nenhum milestone pendente no momento.</div>';

    // AI Logs
    const logs = snap.dashboard?.logs || {};
    const report = snap.report || {};
    document.getElementById('autoNarrativeBox').textContent = logs.autoNarrative || report.autoNarrative || 'Nenhum resumo auto-gerado no momento.';
    const projectLogs = Array.isArray(snap.logs) ? snap.logs : [];
    const globalActivity = Array.isArray(globalState.activity) ? globalState.activity : [];
    const scopeInfo = projectLogs.length > 0
        ? `Mostrando os logs do projeto ativo <strong>${safeHtml(snap.project.name)}</strong>. A atividade global recente do Nexus também aparece abaixo para não esconder trabalho feito em outros projetos.`
        : `O projeto ativo <strong>${safeHtml(snap.project.name)}</strong> ainda tem pouco histórico próprio. Por isso o painel também mostra a atividade global recente do Nexus.`;
    document.getElementById('logsScopeInfo').innerHTML = scopeInfo;
    
    const mergedAgentSummary = report.agentSummary || logs.agentSummary || {};
    const agStats = Object.entries(mergedAgentSummary).map(([k, v]) => `<div style="padding:0.25rem 0.5rem; background:rgba(255,255,255,0.05); border-radius:4px;">${k.toUpperCase()}: <strong style="color:var(--primary);">${v}</strong></div>`).join('');
    document.getElementById('agentStatsBox').innerHTML = agStats || '<div style="padding:0.25rem 0.5rem; background:rgba(255,255,255,0.05); border-radius:4px; color:var(--text-muted);">Sem agentes suficientes no radar.</div>';

    const latestEntries = Array.isArray(report.latestEntries) ? report.latestEntries : [];
    const logReaderStatus = document.getElementById('logReaderStatus');
    const logReaderFocus = document.getElementById('logReaderFocus');
    const logReaderSignals = document.getElementById('logReaderSignals');
    const logReaderList = document.getElementById('logReaderList');
    const totalSignals = Number(report.total || projectLogs.length || 0);
    const warningCount = projectLogs.filter(entry => entry.status === 'warning').length;
    const errorCount = projectLogs.filter(entry => entry.status === 'error').length;
    const successCount = projectLogs.filter(entry => entry.status === 'success').length;
    const latestWarning = projectLogs.find(entry => entry.status === 'warning' || entry.status === 'error');
    const recommendedFocus = latestWarning?.summary
        || snap.dashboard?.status?.nextFocus
        || latestEntries[0]
        || 'Sem foco recomendado no momento.';
    logReaderStatus.textContent = totalSignals > 0
        ? `${totalSignals} sinal${totalSignals === 1 ? '' : 's'} consolidados para leitura futura por IA`
        : 'Sem sinais suficientes ainda';
    logReaderFocus.innerHTML = `<strong style="color:var(--secondary);">Foco sugerido pela trilha de logs:</strong> ${recommendedFocus}`;
    logReaderSignals.innerHTML = [
        { label: 'Alertas', value: warningCount + errorCount, color: 'var(--warning)' },
        { label: 'Erros', value: errorCount, color: 'var(--danger)' },
        { label: 'Sucessos', value: successCount, color: 'var(--success)' },
        { label: 'Agentes', value: Object.values(mergedAgentSummary).filter(Boolean).length, color: 'var(--secondary)' }
    ].map(item => `
        <div style="padding:0.55rem 0.65rem; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.16);">
            <div style="font-size:0.68rem; letter-spacing:0.06em; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.2rem;">${item.label}</div>
            <div style="font-size:1.05rem; font-family:var(--font-mono); color:${item.color};">${item.value}</div>
        </div>
    `).join('');
    logReaderList.innerHTML = latestEntries.length
        ? latestEntries.slice(0, 4).map((entry, index) => `
            <div style="display:flex; gap:0.7rem; align-items:flex-start; padding:0.7rem 0.8rem; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.16);">
                <div style="min-width:1.35rem; height:1.35rem; display:flex; align-items:center; justify-content:center; border-radius:999px; background:rgba(139, 92, 246, 0.16); color:var(--primary); font-size:0.75rem; font-weight:700;">${index + 1}</div>
                <div style="font-size:0.84rem; color:var(--text); line-height:1.45;">${entry}</div>
            </div>
        `).join('')
        : '<div style="font-size:0.84rem; color:var(--text-muted); line-height:1.45;">O resumo estruturado dos logs ainda não tem entradas suficientes para virar leitura automatizada.</div>';

    const timelineEntries = [
        ...projectLogs.slice(0, 6).map(entry => ({ ...entry, __scope: 'Projeto ativo' })),
        ...globalActivity.slice(0, 6).map(entry => ({
            agent: entry.agent || 'system',
            status: 'info',
            timestamp: entry.timestamp,
            summary: entry.message || 'Sem detalhe',
            details: entry.message || 'Sem detalhe',
            __scope: 'Atividade global do Nexus'
        }))
    ];
    syncLogExpansionState(timelineEntries);
    document.getElementById('projectTimeline').innerHTML = timelineEntries.map((entry, index) => {
        const key = getLogEntryKey(entry, index);
        const encodedKey = encodeURIComponent(key);
        const expanded = Boolean(globalState.logExpansion?.[key]);
        const agent = textOrFallback(entry.agent, 'system').toLowerCase();
        const subtitle = `${textOrFallback(entry.__scope, 'Projeto')} • ${textOrFallback(entry.timestamp && entry.timestamp !== 'Telegram' ? new Date(entry.timestamp).toLocaleString() : entry.timestamp, '--')}`;
        const summary = textOrFallback(entry.summary || entry.message, 'Sem resumo');
        const detail = textOrFallback(entry.details || entry.message || entry.summary, summary);
        return `
            <div class="log-card${expanded ? ' expanded' : ''}" data-log-key="${encodedKey}">
                <button type="button" class="log-card-header" onclick="toggleLogExpand('${encodedKey}')">
                    <div class="log-card-main">
                        <span class="log-chevron">▶</span>
                        <div class="log-card-summary">
                            <div class="log-title-row">
                                <span class="agent-badge bdg-${agent}">${safeHtml(textOrFallback(entry.agent, 'system').toUpperCase())}</span>
                                <span class="log-title">${safeHtml(summary)}</span>
                            </div>
                            <div class="log-subtitle">${safeHtml(subtitle)}</div>
                            <div class="log-snippet">${safeHtml(getLogSnippet(entry))}</div>
                        </div>
                    </div>
                    <div class="log-card-actions">
                        <span class="${getLogStatusBadgeClass(entry.status)}">${safeHtml(textOrFallback(entry.status, 'info'))}</span>
                    </div>
                </button>
                <div class="log-card-details">
                    <div class="log-detail-meta">
                        <span>${safeHtml(textOrFallback(entry.__scope, 'Projeto'))}</span>
                        <span>${safeHtml(textOrFallback(entry.timestamp && entry.timestamp !== 'Telegram' ? new Date(entry.timestamp).toLocaleString() : entry.timestamp, '--'))}</span>
                        <span>${safeHtml(textOrFallback(entry.agent, 'system'))}</span>
                    </div>
                    <div class="log-detail-text">${safeHtml(detail)}</div>
                </div>
            </div>
        `;
    }).join('') || '<div style="color:var(--text-muted);font-size:0.85rem;">Nenhuma atividade recente.</div>';

    // Commands List
    const cmds = snap.commands || [];
    document.getElementById('commandsList').innerHTML = cmds.map(c => `
        <div class="cmd-item" onclick="openCommandDrawer('${c.id}')">
            <div class="cmd-text">${safeHtml(c.payload?.text || 'Sem instrução clara')}</div>
            <div class="cmd-meta">
                <span class="badge" style="background:var(--bg); border:1px solid var(--border); color:var(--text-muted);">${safeHtml(c.target)}</span>
                <span class="${formatStatusBadgeClass(c.status)}">${safeHtml(c.status)}</span>
            </div>
        </div>
    `).join('') || '<div style="color:var(--text-muted); font-size:0.85rem;">Lista vazia.</div>';

    renderCommandsList(cmds);
    renderFilesPanel(snap);
    renderFilesRail(snap);
    renderProjectRadar(snap);

    // Render Project Summary
    renderProjectSummary(snap);
}

function renderProjectSummary(snap) {
    const summary = snap.summary;
    const narrator = snap.narrator;
    const personality = snap.personality;
    const audio = snap.audio || (summary && summary.audio);
    
    const sec = document.getElementById('projectSummarySection');
    const title = document.getElementById('summaryTitle');
    const meta = document.getElementById('summaryMeta');
    const content = document.getElementById('summaryContent');
    const badge = document.getElementById('audioStatusBadge');
    const btn = document.getElementById('btnPlayAudio');

    if(!summary && !narrator) {
        sec.style.display = 'none';
        return;
    }
    
    sec.style.display = 'flex';
    targetAudioProjectId = snap.project.id;
    
    if (title) {
        title.textContent = summary?.title || 'Resumo do Projeto';
    }
    if(summary && summary.lastUpdated) {
        meta.textContent = 'Atualizado em: ' + new Date(summary.lastUpdated).toLocaleString();
    }
    
    let html = '';
    
    if(personality && personality.mode) {
        let pColor = 'var(--secondary)';
        let pIcon = '✨';
        if(personality.mode.toLowerCase() === 'sarcastic') {
            pColor = 'var(--warning)'; pIcon = '😏';
            sec.style.borderColor = 'rgba(245, 158, 11, 0.4)'; 
        } else if(personality.mode.toLowerCase() === 'formal') {
            pColor = 'var(--text-muted)'; pIcon = '👔';
            sec.style.borderColor = 'rgba(161, 161, 170, 0.3)';
        } else {
            sec.style.borderColor = 'rgba(6, 182, 212, 0.3)';
        }
        
        let intensityBar = '';
        if(personality.intensity) {
             const intensityMap = { low: 34, medium: 68, high: 100 };
             const pct = intensityMap[String(personality.intensity).toLowerCase()] || 50;
             intensityBar = `<div style="width: 40px; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; display: inline-block; vertical-align: middle; margin-left: 6px;" title="Intensidade: ${personality.intensity}"><div style="height: 100%; width: ${pct}%; background: ${pColor};"></div></div>`;
        }
        
        html += `<div style="font-size: 0.75rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 1px; color: ${pColor}; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.4rem; background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid ${pColor}33;">
            ${pIcon} Modo da IA: ${safeHtml(personality.mode)} ${intensityBar}
        </div>`;
    }
    
    if(narrator && narrator.messages && narrator.messages.length > 0) {
        html += `<div style="margin-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; background: rgba(0,0,0,0.25); padding: 1.25rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.03); box-shadow: inset 0 2px 10px rgba(0,0,0,0.2);">`;
        narrator.messages.forEach(msg => {
             const text = typeof msg === 'string'
                ? msg
                : (msg && typeof msg.text === 'string' ? msg.text : '');
             if(text) {
                html += `<p style="line-height: 1.7; color: var(--text); font-size: 0.98rem; font-weight: 300; letter-spacing: 0.3px;">${safeHtml(text).replace(/\n/g, '<br/>')}</p>`;
             }
        });
        html += `</div>`;
    } else if(summary && summary.text) {
        html += `<div style="margin-bottom: 0.5rem;">${safeHtml(summary.text || '').replace(/\n/g, '<br/>')}</div>`;
    }
    
    if(summary && summary.highlights && summary.highlights.length > 0) {
        html += `<div style="background: rgba(6, 182, 212, 0.1); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--secondary); margin-bottom: 1rem;">
            <ul style="list-style-position: inside; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem;">
                ${summary.highlights.map(h => `<li style="font-weight: 500; color: var(--text);">${safeHtml(h)}</li>`).join('')}
            </ul>
        </div>`;
    }
    
    if(summary && summary.sections && summary.sections.length > 0) {
        html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">`;
        summary.sections.forEach(s => {
            html += `<div style="background: rgba(24, 24, 27, 0.8); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 1.25rem; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <h4 style="color: var(--secondary); margin-bottom: 0.85rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">${safeHtml(s.title)}</h4>
                <ul style="list-style-position: inside; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; color: #a1a1aa; font-size: 0.88rem; line-height: 1.5;">
                    ${(s.items || []).map(i => `<li>${safeHtml(i)}</li>`).join('')}
                </ul>
            </div>`;
        });
        html += `</div>`;
    }
    
    if(audio && audio.error) {
        html += `<div style="margin-top: 0.75rem; padding: 0.85rem 1rem; border-radius: 8px; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); color: var(--text-muted); font-size: 0.84rem; line-height: 1.5;">
            O resumo continua disponível para leitura. O áudio encontrou um problema no provedor atual e o Nexus vai tentar regenerar quando você pedir novamente.
        </div>`;
    }
    content.innerHTML = html;
    
    if(audio) {
        currentSummaryAudioUrl = audio.audioUrl || audio.url || summary?.audio?.audioUrl || summary?.audioUrl || null;
        const s = audio.status || 'idle';
        if(s === 'playing') {
             badge.textContent = "PLAYING"; badge.className = "badge badge-state-active";
             btn.textContent = "Pausar"; btn.disabled = false; btn.className = "btn-primary";
        } else if(s === 'paused') {
             badge.textContent = "PAUSED"; badge.className = "badge badge-health-steady";
             btn.textContent = "Continuar"; btn.disabled = false; btn.className = "btn-primary";
        } else if(s === 'generating') {
             badge.textContent = "GERANDO"; badge.className = "badge badge-health-risky";
             btn.textContent = "Aguarde"; btn.disabled = true; btn.className = "btn-secondary";
        } else if(s === 'failed') {
             badge.textContent = "AUDIO INDISPONIVEL"; badge.className = "badge badge-health-risky";
             btn.textContent = "Erro (gerar novamente?)"; btn.disabled = false; btn.className = "btn-secondary";
        } else {
             badge.textContent = "READY"; badge.className = "badge badge-health-steady";
             btn.textContent = "Ouvir resumo"; btn.disabled = false; btn.className = "btn-primary";
        }
    } else if(summary?.audio?.audioUrl || summary?.audioUrl) {
         currentSummaryAudioUrl = summary?.audio?.audioUrl || summary?.audioUrl || null;
         badge.textContent = "READY"; badge.className = "badge badge-health-steady";
         btn.textContent = "Ouvir resumo"; btn.disabled = false; btn.className = "btn-primary";
    } else {
        currentSummaryAudioUrl = null;
        badge.textContent = "IDLE"; badge.className = "badge badge-health-risky";
        btn.textContent = "Gerar \u00E1udio"; btn.disabled = false; btn.className = "btn-primary";
    }
}

async function syncAudioStatus(statusStr) {
    if(!targetAudioProjectId) return;
    try {
        await fetch(`${API_BASE}/projects/${targetAudioProjectId}/summary/audio/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: statusStr })
        });
    } catch(e) { console.error("Falha ao sync de audio:", e); }
}

async function toggleAudio(e) {
    if(e) e.preventDefault();
    const btn = document.getElementById('btnPlayAudio');
    const badge = document.getElementById('audioStatusBadge');
    
    if(!currentSummaryAudioUrl || btn.innerHTML.includes("Gerar") || btn.innerHTML.includes("Erro")) {
        btn.textContent = "Solicitando...";
        btn.disabled = true;
        badge.textContent = "GENERATING";
        try {
            await fetch(`${API_BASE}/projects/${targetAudioProjectId}/summary/audio`, { method: 'POST' });
        } catch(ex) {
            console.error(ex);
            btn.textContent = "Falha interna";
            btn.disabled = false;
        }
        return;
    }

    if(!currentAudio && currentSummaryAudioUrl) {
        btn.textContent = "Bufferizando...";
        btn.disabled = true;
        badge.textContent = "LOADING";
        
        currentAudio = new Audio(API_BASE + currentSummaryAudioUrl);
        
        currentAudio.onplay = () => {
            btn.textContent = "Pausar"; btn.disabled = false; btn.className = "btn-primary";
            badge.textContent = "PLAYING"; badge.className = "badge badge-state-active";
            syncAudioStatus("playing");
        };
        
        currentAudio.onpause = () => {
            btn.textContent = "Continuar"; btn.disabled = false;
            badge.textContent = "PAUSED"; badge.className = "badge badge-health-steady";
            syncAudioStatus("paused");
        };
        
        currentAudio.onended = () => {
            btn.textContent = "Ouvir resumo";
            badge.textContent = "READY"; badge.className = "badge badge-health-steady";
            syncAudioStatus("ready");
            currentAudio = null;
        };
        
        currentAudio.onerror = () => {
            btn.textContent = "Falha ao reproduzir"; btn.disabled = false;
            badge.textContent = "ERROR"; badge.className = "badge badge-health-risky";
            syncAudioStatus("failed");
            currentAudio = null;
        };
        
        currentAudio.play().catch(err => {
            console.error(err);
            btn.textContent = "Tentar novamente"; btn.disabled = false;
        });
    } else if (currentAudio) {
        if(currentAudio.paused) {
            currentAudio.play();
        } else {
            currentAudio.pause();
        }
    }
}

function renderQueueStats(stats) {
    if(!stats) return;
    document.getElementById('queueStatsBox').innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; font-family:var(--font-mono); font-size:0.85rem;">
            <div style="background:var(--bg); padding:0.5rem; border-radius:4px; border:1px solid var(--border);">Total: <span style="color:var(--text);font-weight:700;">${stats.total}</span></div>
            <div style="background:var(--bg); padding:0.5rem; border-radius:4px; border:1px solid var(--border);">Pendentes: <span style="color:var(--warning);font-weight:700;">${stats.pending}</span></div>
            <div style="background:var(--bg); padding:0.5rem; border-radius:4px; border:1px solid var(--border);">Aguardando: <span style="color:#a855f7;font-weight:700;">${stats.awaitingExternal}</span></div>
            <div style="background:var(--bg); padding:0.5rem; border-radius:4px; border:1px solid var(--border);">Falhas: <span style="color:var(--danger);font-weight:700;">${stats.failed}</span></div>
        </div>
    `;
}

function renderManualAssist(manual) {
    const box = document.getElementById('manualAssistWarning');
    const text = document.getElementById('manualAssistText');
    const acts = manual?.antigravity || [];
    if(acts.length > 0) {
        box.classList.remove('manual-assist-hidden');
        text.innerHTML = `<strong>${acts.length} job(s)</strong> aguardando verificação do Antigravity IDE.`;
    } else {
        box.classList.add('manual-assist-hidden');
    }
}

function renderFilesPanel(snap) {
    const files = snap.files;
    const synopsis = document.getElementById('filesSynopsis');
    const stats = document.getElementById('filesStats');
    const list = document.getElementById('filesList');
    const badge = document.getElementById('filesCountBadge');

    if(!files) {
        synopsis.textContent = 'O Nexus ainda não recebeu dados de arquivos para este projeto.';
        stats.innerHTML = '';
        list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem; text-align: center; border: 1px dashed var(--border); border-radius: 8px;">Nenhum arquivo indexado ainda.</div>';
        badge.textContent = '0 arquivos';
        return;
    }

    badge.textContent = `${files.totals?.files || 0} indexados`;
    synopsis.innerHTML = safeHtml(files.synopsis || 'O workspace foi conectado, mas ainda n?o houve leitura suficiente para resumir o projeto.').replace(/\n/g, '<br/>');
    
    stats.innerHTML = `
        <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:6px; padding:0.75rem; text-align: center; display: flex; flex-direction: column; gap: 0.25rem;">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">Textos</span>
            <strong style="color:var(--text); font-size: 1.1rem; font-family: var(--font-mono);">${files.totals?.textFiles || 0}</strong>
        </div>
        <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:6px; padding:0.75rem; text-align: center; display: flex; flex-direction: column; gap: 0.25rem;">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">Pastas</span>
            <strong style="color:var(--text); font-size: 1.1rem; font-family: var(--font-mono);">${files.totals?.directories || 0}</strong>
        </div>
        <div style="background:rgba(6, 182, 212, 0.05); border:1px solid rgba(6, 182, 212, 0.2); border-radius:6px; padding:0.75rem; text-align: center; display: flex; flex-direction: column; gap: 0.25rem;">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--secondary); letter-spacing: 0.5px;">Chaves</span>
            <strong style="color:var(--secondary); font-size: 1.1rem; font-family: var(--font-mono);">${files.totals?.keyFiles || 0}</strong>
        </div>
        <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:6px; padding:0.75rem; text-align: center; display: flex; flex-direction: column; gap: 0.25rem;">
            <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">Omitidos</span>
            <strong style="color:rgba(255,255,255,0.4); font-size: 1.1rem; font-family: var(--font-mono);">${files.totals?.omittedFiles || 0}</strong>
        </div>
    `;

    const entries = Array.isArray(files.entries) ? files.entries.slice(0, 10) : [];
    list.innerHTML = entries.map(file => `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); padding: 0.85rem; border-radius: 8px; cursor: pointer; transition: 0.2s; display: flex; flex-direction: column; gap: 0.5rem;" onmouseover="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(6, 182, 212, 0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'; this.style.borderColor='var(--border)'" onclick="openFilePreview('${encodeURIComponent(file.path)}')">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                <div style="font-family: var(--font-mono); font-size: 0.85rem; color: ${file.isKeyFile ? 'var(--secondary)' : 'var(--text)'}; word-break: break-all; font-weight: 600;">${safeHtml(file.path)}</div>
                <div style="display: flex; gap: 0.4rem; flex-shrink: 0;">
                    <span class="badge" style="background:var(--bg); border:1px solid var(--border); color:var(--text-muted); font-size: 0.6rem;">${safeHtml(file.category.toUpperCase())}</span>
                    ${file.isKeyFile ? `<span class="badge" style="background:rgba(6, 182, 212, 0.12); color:var(--secondary); border:1px solid rgba(6, 182, 212, 0.3); font-size: 0.6rem;">🔥 KEY</span>` : `<span class="badge" style="background:rgba(255,255,255,0.04); color:var(--text-muted); border:1px solid var(--border); font-size: 0.6rem;">${safeHtml(file.extension ? file.extension.toUpperCase() : 'DOC')}</span>`}
                </div>
            </div>
            ${file.preview ? `<div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; padding: 0.5rem; background: rgba(0,0,0,0.4); border-radius: 4px; border-left: 2px solid ${file.isKeyFile ? 'var(--secondary)' : '#555'}; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${safeHtml(file.preview)}</div>` : ''}
        </div>
    `).join('') || '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem; text-align: center; border: 1px dashed var(--border); border-radius: 8px;">Nenhum detalhamento individual retornado.</div>';
}

function renderFilesRail(snap) {
    const files = snap?.files;
    const list = document.getElementById('filesList');
    const workspaceTitle = document.querySelector('.workspace-rail-panel h2');

    if (workspaceTitle) {
        workspaceTitle.innerHTML = '<span aria-hidden="true">&#128193;</span> Mapa do Workspace';
    }

    if (!files || !list) {
        return;
    }

    const entries = Array.isArray(files.entries) ? files.entries.slice(0, 10) : [];
    syncFileExpansionState(entries);

    if (!entries.length) {
        list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem; text-align: center; border: 1px dashed var(--border); border-radius: 8px;">Nenhum detalhamento individual retornado.</div>';
        return;
    }

    list.innerHTML = entries.map(file => {
        const encodedPath = getFileKey(file);
        const expanded = Boolean(globalState.fileExpansion?.[encodedPath]);
        const preview = textOrFallback(file.preview);

        return `
            <div class="file-item${expanded ? ' expanded' : ''}" data-file-key="${encodedPath}">
                <button type="button" class="file-header" onclick="toggleFileExpand('${encodedPath}')">
                    <div class="file-main">
                        <span class="file-chevron">▶</span>
                        <div class="file-summary">
                            <div class="file-path" style="color:${file.isKeyFile ? 'var(--secondary)' : 'var(--text)'};">${safeHtml(file.path)}</div>
                            <div class="file-snippet">${safeHtml(getFileSnippet(file))}</div>
                        </div>
                    </div>
                    <div class="file-actions">
                        <span class="badge" style="background:var(--bg); border:1px solid var(--border); color:var(--text-muted); font-size: 0.6rem;">${safeHtml(textOrFallback(file.category, 'arquivo').toUpperCase())}</span>
                        ${file.isKeyFile ? `<span class="badge" style="background:rgba(6, 182, 212, 0.12); color:var(--secondary); border:1px solid rgba(6, 182, 212, 0.3); font-size: 0.6rem;">KEY</span>` : `<span class="badge" style="background:rgba(255,255,255,0.04); color:var(--text-muted); border:1px solid var(--border); font-size: 0.6rem;">${safeHtml(textOrFallback(file.extension ? file.extension.toUpperCase() : 'DOC'))}</span>`}
                    </div>
                </button>
                <div class="file-details">
                    <div class="file-preview">${preview ? safeHtml(preview) : 'Sem preview textual disponível para este arquivo.'}</div>
                    <div class="file-detail-footer">
                        <button type="button" class="file-open-btn" onclick="openFilePreview('${encodedPath}')">Abrir preview completo</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderProjectRadar(snap) {
    const copy = document.getElementById('radarCopy');
    const checklist = document.getElementById('radarChecklist');
    const stats = document.getElementById('radarStats');
    const badge = document.getElementById('radarStateBadge');
    const badgeMirror = document.getElementById('radarStateBadgeMirror');
    const mainRisk = document.getElementById('radarMainRisk');
    const currentBlocker = document.getElementById('radarCurrentBlocker');
    const nextDelivery = document.getElementById('radarNextDelivery');
    const actions = document.getElementById('radarActions');

    if (!copy || !checklist || !stats || !badge || !mainRisk || !currentBlocker || !nextDelivery || !actions || !snap?.project) {
        return;
    }

    const tasks = Array.isArray(snap.tasks) ? snap.tasks.filter(item => item.status !== 'completed') : [];
    const inProgressTasks = tasks.filter(item => item.status === 'in_progress');
    const milestones = Array.isArray(snap.milestones) ? snap.milestones.filter(item => item.status !== 'completed') : [];
    const logs = Array.isArray(snap.logs) ? snap.logs : [];
    const narratorMessages = Array.isArray(snap.narrator?.messages)
        ? snap.narrator.messages.map(item => typeof item === 'string' ? item : item?.text).filter(Boolean)
        : [];
    const summaryText = textOrFallback(narratorMessages[0] || snap.summary?.text || snap.project.description);
    const nextFocus = textOrFallback(snap.dashboard?.status?.nextFocus, 'Sem foco imediato mapeado.');
    const overallPct = Number(snap.dashboard?.progress?.overallPct || 0);
    const queue = snap.dashboard?.queue || {};
    const agendaCounts = snap.dashboard?.agendaCounts || {};
    const recentWarnings = logs.filter(entry => entry.status === 'warning' || entry.status === 'error').length;
    const failedCommands = Number(queue.failed || 0);
    const latestWarning = logs.find(entry => entry.status === 'warning' || entry.status === 'error');
    const topTask = tasks[0];
    const topMilestone = milestones[0];

    let riskText = 'Nenhum risco principal no radar. O projeto esta respirando sem drama imediato.';
    if (failedCommands > 0) {
        riskText = `${failedCommands} falha(s) ainda aparecem no historico operacional. Vale revisar antes que isso vire bagunca de novo.`;
    } else if (recentWarnings > 0 && latestWarning?.summary) {
        riskText = latestWarning.summary;
    } else if (agendaCounts.today > 0 && topTask?.title) {
        riskText = `Existe entrega para hoje puxando a prioridade: ${textOrFallback(topTask.title)}.`;
    } else if (overallPct < 40) {
        riskText = 'O projeto ainda esta em fase inicial e pode perder direcao se as proximas etapas nao ficarem claras.';
    }

    let blockerText = 'Nenhum bloqueio explicito no momento. O caminho esta relativamente livre.';
    if (Number(queue.awaitingExternal || 0) > 0) {
        blockerText = `Ainda ha ${queue.awaitingExternal} item(ns) aguardando validacao externa.`;
    } else if (inProgressTasks[0]?.title) {
        blockerText = `O fluxo atual esta concentrado em: ${textOrFallback(inProgressTasks[0].title)}.`;
    } else if (latestWarning?.details || latestWarning?.summary) {
        blockerText = textOrFallback(latestWarning.details || latestWarning.summary);
    }

    const recommendedDelivery = textOrFallback(
        topTask?.title || topMilestone?.title || nextFocus,
        'Sem proxima entrega recomendada no momento.'
    );

    copy.textContent = `${summaryText} Próximo foco: ${nextFocus}`;

    mainRisk.textContent = riskText;
    currentBlocker.textContent = blockerText;
    nextDelivery.textContent = recommendedDelivery;

    const checkpoints = [
        ...tasks.slice(0, 2).map(task => `Tarefa: ${textOrFallback(task.title, 'Sem título')}`),
        ...milestones.slice(0, 1).map(item => `Marco: ${textOrFallback(item.title, 'Sem título')}`),
    ].slice(0, 3);

    checklist.innerHTML = checkpoints.length
        ? checkpoints.map(item => `<div class="radar-list-item">${safeHtml(item)}</div>`).join('')
        : '<div class="radar-list-item">Nenhum checkpoint aberto agora. O painel está surpreendentemente em ordem.</div>';

    const radarStats = [
        { label: 'Progresso geral', value: `${overallPct}%` },
        { label: 'Tarefas abertas', value: String(tasks.length) },
        { label: 'Aguardando agente', value: String(queue.awaitingExternal || 0) },
        { label: 'Alertas recentes', value: String(recentWarnings || agendaCounts.overdue || 0) },
    ];

    stats.innerHTML = radarStats.map(item => `
        <div class="radar-stat">
            <div class="radar-stat-label">${safeHtml(item.label)}</div>
            <div class="radar-stat-value">${safeHtml(item.value)}</div>
        </div>
    `).join('');

    const radarActions = Array.isArray(snap.radar?.actions) ? snap.radar.actions : [];
    actions.innerHTML = radarActions.length
        ? radarActions.map((action) => {
            const variantClass = action.variant === 'primary' ? 'btn-primary' : 'btn-secondary';
            const label = textOrFallback(action.label, 'Executar ação');
            const description = textOrFallback(action.description, label);
            const actionId = String(action.id || '').replace(/'/g, '&#39;');
            return `<button class="${variantClass}" type="button" title="${safeHtml(description)}" onclick="triggerRadarAction('${actionId}')">${safeHtml(label)}</button>`;
        }).join('')
        : '<div class="empty-state">Nenhuma ação estratégica disponível agora.</div>';

    const health = textOrFallback(snap.dashboard?.status?.health, 'steady');
    badge.textContent = health.toUpperCase();
    badge.className = `badge ${health === 'attention' ? 'badge-health-risky' : 'badge-health-steady'}`;
    if (badgeMirror) {
        badgeMirror.textContent = badge.textContent;
        badgeMirror.className = badge.className;
    }
}

async function dispatchCommand(e) {
    e.preventDefault();
    const payload = {
        source: document.getElementById('f-source').value,
        target: document.getElementById('f-target').value,
        kind: 'task',
        payload: { text: document.getElementById('f-text').value }
    };
    try {
        const res = await fetch(`${API_BASE}/ui/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if(res.ok) document.getElementById('f-text').value = '';
    } catch(e) { alert("Falha ao criar dispatcher."); }
}

async function dispatchAgendaTask(taskId, button) {
    const snap = globalState.activeProject;
    if(!snap?.project?.id || !taskId) return;

    const originalLabel = button ? button.textContent : '';
    if(button) {
        button.disabled = true;
        button.textContent = 'Enviando...';
    }

    try {
        const response = await fetch(`${API_BASE}/projects/${snap.project.id}/tasks/${taskId}/send-to-agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if(!response.ok) throw new Error(data?.error || 'dispatch failed');

        await refreshBootstrap();
        if(data?.id) {
            openCommandDrawer(data.id);
        }
    } catch(error) {
        console.error(error);
        alert('Não consegui enviar essa pendência para o agente agora.');
        if(button) {
            button.disabled = false;
            button.textContent = originalLabel || 'Enviar para o agente';
        }
        return;
    }

    if(button) {
        button.disabled = false;
        button.textContent = 'Enviado';
    }
}

function openDrawerShell(html) {
    const drawer = document.getElementById('detailsDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const content = document.getElementById('drawerContent');
    content.innerHTML = html;
    repairVisibleText(content);
    overlay.classList.add('open');
    drawer.classList.add('open');
}

async function copyToClipboard(text, fallbackLabel = 'conteudo') {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch(error) {
        console.error(`Falha ao copiar ${fallbackLabel}.`, error);
        return false;
    }
}

function renderBootstrapKit() {
    const meta = document.getElementById('bootstrapKitMeta');
    const list = document.getElementById('bootstrapKitList');
    const kit = globalState.bootstrapKit;

    if (!meta || !list) return;

    if (!kit || !Array.isArray(kit.items) || !kit.items.length) {
        meta.textContent = 'Os prompts-base e a documentacao canonica ficam disponiveis aqui para replicar o Nexus em outra maquina.';
        list.innerHTML = '<div class="empty-state">Nenhum arquivo de bootstrap encontrado.</div>';
        return;
    }

    meta.textContent = 'Copie os prompts-base e a documentacao canonica direto do painel. Isso acelera a subida do Nexus em outra maquina sem depender da conversa.';
    list.innerHTML = kit.items.map((item) => `
        <div class="bootstrap-kit-item">
            <div class="bootstrap-kit-copy">
                <div style="font-weight:600; color:var(--text); margin-bottom:0.2rem;">${safeHtml(item.title)}</div>
                <div class="bootstrap-kit-path">${safeHtml(item.relativePath || '')}</div>
            </div>
            <button class="btn-secondary" type="button" onclick="openBootstrapKitItem('${String(item.id).replace(/'/g, '&#39;')}')">Abrir</button>
            <button class="btn-secondary" type="button" onclick="copyBootstrapKitItem('${String(item.id).replace(/'/g, '&#39;')}')">Copiar</button>
        </div>
    `).join('');
}

function getBootstrapKitItem(itemId) {
    return (globalState.bootstrapKit?.items || []).find((item) => String(item.id) === String(itemId));
}

async function copyBootstrapKitItem(itemId) {
    const item = getBootstrapKitItem(itemId);
    if (!item?.content) {
        alert('Nao encontrei esse arquivo para copiar.');
        return;
    }

    const copied = await copyToClipboard(item.content, item.title);
    if (!copied) {
        alert('Nao consegui copiar esse conteudo agora.');
    }
}

function openBootstrapKitItem(itemId) {
    const item = getBootstrapKitItem(itemId);
    if (!item?.content) {
        openDrawerShell('<p style="color:var(--danger);">Nao encontrei esse arquivo no bootstrap kit.</p>');
        return;
    }

    openDrawerShell(`
        <div style="margin-bottom:1.25rem;">
            <h3 style="color:var(--text); font-size:1.05rem;">${safeHtml(item.title)}</h3>
            <div style="margin-top:0.35rem; font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${safeHtml(item.relativePath || '')}</div>
        </div>
        <pre>${escapeHtml(item.content)}</pre>
    `);
}

async function openDrawer(id) {
    const drawer = document.getElementById('detailsDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const content = document.getElementById('drawerContent');
    content.innerHTML = '<p>Carregando...</p>';
    overlay.classList.add('open');
    drawer.classList.add('open');

    try {
        const res = await fetch(`${API_BASE}/ui/commands/${id}`);
        const data = await res.json();
        content.innerHTML = `
            <div style="margin-bottom:1.5rem;">
                <h3 style="color:var(--text); font-size:1.1rem;">Roteiro: ${data.source.toUpperCase()} ➔ ${data.target.toUpperCase()}</h3>
                <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">ID: ${data.id}</div>
                <div class="badge badge-state-active" style="display:inline-block; margin-top:1rem;">${data.status}</div>
            </div>
            <h4 style="color:var(--primary); font-size:0.85rem; text-transform:uppercase; margin-bottom:0.5rem; letter-spacing:1px;">Instrução Payload</h4>
            <pre>${data.payload?.text || JSON.stringify(data.payload, null, 2)}</pre>
            ${data.result ? `<h4 style="color:var(--success); font-size:0.85rem; text-transform:uppercase; margin-top:2rem; margin-bottom:0.5rem; letter-spacing:1px;">Resultado</h4><pre>${JSON.stringify(data.result, null, 2)}</pre>` : ''}
        `;
    } catch(e) {
        content.innerHTML = '<p style="color:var(--danger);">Falha de leitura do log interno.</p>';
    }
}

async function openCommandDrawer(id) {
    openDrawerShell('<p>Carregando...</p>');

    try {
        const res = await fetch(`${API_BASE}/ui/commands/${id}`);
        const data = await res.json();
        openDrawerShell(`
            <div style="margin-bottom:1.5rem;">
                <h3 style="color:var(--text); font-size:1.1rem;">Roteiro: ${data.source.toUpperCase()} -> ${data.target.toUpperCase()}</h3>
                <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">ID: ${data.id}</div>
                <div class="badge badge-state-active" style="display:inline-block; margin-top:1rem;">${data.status}</div>
            </div>
            <h4 style="color:var(--primary); font-size:0.85rem; text-transform:uppercase; margin-bottom:0.5rem; letter-spacing:1px;">Instrução Payload</h4>
            <pre>${escapeHtml(data.payload?.text || JSON.stringify(data.payload, null, 2))}</pre>
            ${data.result ? `<h4 style="color:var(--success); font-size:0.85rem; text-transform:uppercase; margin-top:2rem; margin-bottom:0.5rem; letter-spacing:1px;">Resultado</h4><pre>${escapeHtml(JSON.stringify(data.result, null, 2))}</pre>` : ''}
        `);
    } catch(e) {
        openDrawerShell('<p style="color:var(--danger);">Falha de leitura do log interno.</p>');
    }
}

async function openFilePreview(encodedPath) {
    const snap = globalState.activeProject;
    if(!snap?.project?.id) return;

    openDrawerShell('<p>Carregando arquivo...</p>');
    try {
        const path = decodeURIComponent(encodedPath);
        const res = await fetch(`${API_BASE}/projects/${snap.project.id}/files/content?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        if(!res.ok) throw new Error(data?.error || 'read failed');

        openDrawerShell(`
            <div style="margin-bottom:1.5rem;">
                <h3 style="color:var(--text); font-size:1.1rem;">Arquivo do Projeto</h3>
                <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">${data.path}</div>
                <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
                    <div class="badge badge-health-steady">${data.lineCount} linhas</div>
                    <div class="badge" style="background:rgba(255,255,255,0.08); color:var(--text-muted); border:1px solid var(--border);">${data.size} bytes</div>
                    ${data.truncated ? '<div class="badge badge-health-risky">preview truncado</div>' : ''}
                </div>
            </div>
            <pre>${escapeHtml(data.content || '')}</pre>
        `);
    } catch(e) {
        openDrawerShell('<p style="color:var(--danger);">Não consegui abrir esse arquivo agora.</p>');
    }
}

function escapeHtml(value) {
    return normalizeDisplayText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderAudit(audit) {
    const sec = document.getElementById('auditSection');
    const badge = document.getElementById('auditBadge');
    const content = document.getElementById('auditContent');
    if(!audit) { sec.style.display = 'none'; return; }
    
    sec.style.display = 'block';
    badge.textContent = (audit.status || 'OK').toUpperCase();
    
    if(audit.status === 'ok') {
        badge.className = 'badge badge-health-steady';
        sec.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else {
        badge.className = 'badge badge-health-risky';
        sec.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    }
    
    let html = `<div style="font-family:var(--font-mono); font-size: 0.8rem; color: var(--text); margin-bottom: 0.25rem;">Achados: <strong>${audit.findingsCount || 0}</strong></div>`;
    
    if(audit.highlights && audit.highlights.length > 0) {
        html += `<ul style="list-style-position: inside; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem;">`;
        audit.highlights.forEach(h => {
             html += `<li>${h}</li>`;
        });
        html += `</ul>`;
    } else {
        html += `<div>Nenhuma anomalia crítica detectada nos arquivos protegidos.</div>`;
    }
    
    content.innerHTML = html;
}

function renderProjectRadar(snap) {
    const copy = document.getElementById('radarCopy');
    const checklist = document.getElementById('radarChecklist');
    const stats = document.getElementById('radarStats');
    const badge = document.getElementById('radarStateBadge');
    const badgeMirror = document.getElementById('radarStateBadgeMirror');
    const mainRisk = document.getElementById('radarMainRisk');
    const currentBlocker = document.getElementById('radarCurrentBlocker');
    const nextDelivery = document.getElementById('radarNextDelivery');
    const actions = document.getElementById('radarActions');
    if (!copy || !checklist || !stats || !badge || !mainRisk || !currentBlocker || !nextDelivery || !actions || !snap?.project) return;

    const radar = snap.radar || {};
    const tasks = toArray(snap.tasks).filter(item => item.status !== 'completed');
    const logs = toArray(snap.logs);
    const queue = snap.dashboard?.queue || {};
    const agendaCounts = snap.dashboard?.agendaCounts || {};
    const overallPct = Number(snap.dashboard?.progress?.overallPct || 0);
    const health = textOrFallback(snap.dashboard?.status?.health, 'steady');
    const headline = textOrFallback(radar.headline, `Radar estrategico de ${snap.project.name}`);
    const narratorLead = toArray(snap.narrator?.messages).map(item => typeof item === 'string' ? item : item?.text).filter(Boolean)[0];

    copy.textContent = `${headline}. ${textOrFallback(narratorLead || snap.project.description, 'Sem leitura complementar do projeto no momento.')}`;
    mainRisk.textContent = textOrFallback(radar.risk, 'Nenhum risco principal mapeado agora.');
    currentBlocker.textContent = textOrFallback(radar.blocker, 'Nenhum bloqueio importante no momento.');
    nextDelivery.textContent = textOrFallback(radar.nextDelivery, snap.dashboard?.status?.nextFocus || 'Sem proxima entrega recomendada.');

    const checkpoints = toArray(radar.checkpoints);
    checklist.innerHTML = checkpoints.length
        ? checkpoints.map(item => `<div class="radar-list-item">${safeHtml(textOrFallback(item, 'Checkpoint'))}</div>`).join('')
        : '<div class="radar-list-item">Nenhum checkpoint aberto agora. O projeto esta relativamente bem organizado.</div>';

    const radarStats = [
        { label: 'Progresso geral', value: `${overallPct}%` },
        { label: 'Tarefas abertas', value: String(tasks.length) },
        { label: 'Aguardando agente', value: String(queue.awaitingExternal || 0) },
        { label: 'Alertas recentes', value: String(logs.filter(entry => entry.status === 'warning' || entry.status === 'error').length || agendaCounts.overdue || 0) }
    ];

    stats.innerHTML = radarStats.map(item => `
        <div class="radar-stat">
            <div class="radar-stat-label">${safeHtml(item.label)}</div>
            <div class="radar-stat-value">${safeHtml(item.value)}</div>
        </div>
    `).join('');

    const badgeClass = `badge ${health === 'attention' ? 'badge-health-risky' : 'badge-health-steady'}`;
    badge.textContent = health.toUpperCase();
    badge.className = badgeClass;
    if (badgeMirror) {
        badgeMirror.textContent = badge.textContent;
        badgeMirror.className = badge.className;
    }

    const radarActions = toArray(radar.actions);
    actions.innerHTML = radarActions.length
        ? radarActions.map(action => `
            <button class="${action.variant === 'primary' ? 'btn-primary' : 'btn-secondary'}" type="button" onclick="triggerRadarAction('${String(action.id).replace(/'/g, '&#39;')}')">
                ${safeHtml(textOrFallback(action.label, 'Executar acao'))}
            </button>
        `).join('')
        : '<div class="empty-state">Sem acoes recomendadas pelo radar agora.</div>';
}

function renderTaskBoardPanel(snap) {
    const list = document.getElementById('taskBoardList');
    if (!list) return;

    const lanes = toArray(snap.taskBoard?.lanes);
    if (!lanes.length) {
        list.innerHTML = '<div class="empty-state">Sem lanes operacionais carregadas ainda.</div>';
        return;
    }

    list.innerHTML = lanes.map(lane => `
        <div class="glass-panel" style="padding:1rem; border-color:rgba(255,255,255,0.08);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; margin-bottom:0.75rem;">
                <div class="radar-card-title">${safeHtml(textOrFallback(lane.label, 'Lane'))}</div>
                <span class="badge" style="background:rgba(255,255,255,0.06); border:1px solid var(--border); color:var(--text);">${safeHtml(String(lane.count || 0))}</span>
            </div>
            <div class="action-stack">
                ${toArray(lane.items).slice(0, 4).map(item => `
                    <div style="padding:0.8rem; border-radius:10px; border:1px solid rgba(255,255,255,0.07); background:rgba(0,0,0,0.2);">
                        <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start;">
                            <div style="font-size:0.9rem; color:var(--text); line-height:1.45; font-weight:600;">${safeHtml(textOrFallback(item.title, 'Tarefa sem titulo'))}</div>
                            <span class="badge" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-muted);">${safeHtml(textOrFallback(item.priority, 'medium').toUpperCase())}</span>
                        </div>
                        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.45rem;">
                            <span class="badge" style="background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.25); color:var(--secondary);">${safeHtml(textOrFallback(item.status, 'pending').toUpperCase())}</span>
                            ${item.linkedCommandStatus ? `<span class="${formatStatusBadgeClass(item.linkedCommandStatus)}">${safeHtml(formatCommandStatusText(item.linkedCommandStatus))}</span>` : ''}
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.45rem; line-height:1.45;">
                            ${item.linkedResultSummary ? safeHtml(item.linkedResultSummary) : (item.dueDate ? `Prazo: ${safeHtml(new Date(item.dueDate).toLocaleDateString())}` : 'Sem resultado vinculado ainda.')}
                        </div>
                        <div class="task-actions">
                            <button class="btn-secondary" type="button" onclick="dispatchAgendaTask('${String(item.taskId).replace(/'/g, '&#39;')}', this)">Enviar para o agente</button>
                            ${item.linkedCommandId ? `<button class="btn-secondary" type="button" onclick="openCommandDrawer('${String(item.linkedCommandId).replace(/'/g, '&#39;')}')">Ver job</button>` : ''}
                        </div>
                    </div>
                `).join('') || '<div class="empty-state">Nenhum item nesta lane.</div>'}
            </div>
        </div>
    `).join('');
}

function renderGitPanel(snap) {
    const branch = document.getElementById('gitBranch');
    const summary = document.getElementById('gitSummary');
    const changedFiles = document.getElementById('gitChangedFiles');
    const recentCommits = document.getElementById('gitRecentCommits');
    const status = document.getElementById('gitStatus');
    const changesList = document.getElementById('gitChangesList');
    const commitsList = document.getElementById('gitCommitsList');
    if (!branch || !summary || !changedFiles || !recentCommits || !status || !changesList || !commitsList) return;

    const git = snap.git || {};
    branch.textContent = git.branch ? `Branch: ${git.branch}` : 'Branch: --';
    summary.textContent = textOrFallback(git.summary, 'Sem leitura de Git disponivel no momento.');
    changedFiles.textContent = String(toArray(git.changedFiles).length);
    recentCommits.textContent = String(toArray(git.recentCommits).length);
    status.textContent = git.available ? (git.clean ? 'LIMPO' : 'LOCAL') : 'OFF';

    changesList.innerHTML = toArray(git.changedFiles).slice(0, 5).map(item => `
        <div style="padding:0.7rem 0.8rem; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.16);">
            <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:center;">
                <div style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text); word-break:break-word;">${safeHtml(textOrFallback(item.path, 'arquivo'))}</div>
                <span class="badge" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-muted);">${safeHtml(textOrFallback(item.status, 'modified').toUpperCase())}</span>
            </div>
        </div>
    `).join('') || '<div class="empty-state">Nenhuma mudanca local detectada.</div>';

    commitsList.innerHTML = toArray(git.recentCommits).slice(0, 4).map(item => `
        <div style="padding:0.7rem 0.8rem; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.16);">
            <div style="font-size:0.88rem; color:var(--text); line-height:1.45;">${safeHtml(textOrFallback(item.summary, '(sem resumo)'))}</div>
            <div style="font-size:0.76rem; color:var(--text-muted); margin-top:0.35rem; font-family:var(--font-mono);">${safeHtml(textOrFallback(item.author, 'autor'))} • ${safeHtml(textOrFallback(item.hash, '').slice(0, 7))}</div>
        </div>
    `).join('') || '<div class="empty-state">Nenhum commit recente listado.</div>';
}

function renderValidationPanel(snap) {
    const state = document.getElementById('validationState');
    const checks = document.getElementById('validationChecks');
    if (!state || !checks) return;

    const validation = snap.validation || {};
    state.textContent = textOrFallback(validation.summary, 'Estado de validacao pendente.');
    checks.innerHTML = toArray(validation.steps).map(step => `
        <div style="padding:0.8rem; border-radius:10px; border:1px solid rgba(255,255,255,0.07); background:rgba(0,0,0,0.2);">
            <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start;">
                <div style="font-size:0.9rem; color:var(--text); font-weight:600;">${safeHtml(textOrFallback(step.label, 'Passo'))}</div>
                <span class="${formatStatusBadgeClass(step.status === 'passed' ? 'completed' : step.status === 'failed' ? 'failed' : step.status === 'pending' ? 'processing' : 'awaiting_external')}">${safeHtml(textOrFallback(step.status, 'skipped').toUpperCase())}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.45; margin-top:0.45rem;">${safeHtml(textOrFallback(step.summary, 'Sem resumo do passo.'))}</div>
        </div>
    `).join('') || '<div class="empty-state">Sem verificacoes ainda.</div>';
}

function renderDigestPanel(snap) {
    const summary = document.getElementById('digestSummary');
    const list = document.getElementById('digestTodayList');
    if (!summary || !list) return;

    const digest = snap.digest || {};
    summary.textContent = textOrFallback(digest.summary, 'Nenhum digest carregado ainda.');
    const items = [
        ...toArray(digest.wins).map(item => ({ kind: 'win', text: item })),
        ...toArray(digest.risks).map(item => ({ kind: 'risk', text: item })),
        ...toArray(digest.nextSteps).map(item => ({ kind: 'next', text: item }))
    ];

    list.innerHTML = items.length ? items.slice(0, 6).map(item => `
        <div style="padding:0.7rem 0.8rem; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.16);">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.25rem;">${safeHtml(item.kind)}</div>
            <div style="font-size:0.84rem; color:var(--text); line-height:1.45;">${safeHtml(textOrFallback(item.text, 'Sem detalhe.'))}</div>
        </div>
    `).join('') : '<div class="empty-state">Sem itens no digest.</div>';
}

function renderTimelinePanel(snap) {
    const timeline = document.querySelector('#projectTimelinePanel #projectTimeline');
    if (!timeline) return;

    const items = normalizeTimelineEntries(snap.timeline?.items || snap.timeline);
    timeline.innerHTML = items.length ? items.slice(0, 14).map(item => `
        <div class="timeline-item">
            <div class="time">${safeHtml(item.timestamp ? new Date(item.timestamp).toLocaleString() : '--')}</div>
            <div class="msg"><strong style="color:var(--text);">${safeHtml(item.__title)}</strong><br>${safeHtml(item.__details)}</div>
        </div>
    `).join('') : '<div class="empty-state">Sem eventos suficientes na timeline ainda.</div>';
}

function renderActiveProject() {
    const snap = globalState.activeProject;
    if(!snap || !snap.project) return;

    document.getElementById('activeProjectName').textContent = snap.project.name;
    const badges = [];
    if(snap.project.state) badges.push(`<div class="badge badge-state-${snap.project.state}">${safeHtml(String(snap.project.state).toUpperCase())}</div>`);
    if(snap.dashboard?.status?.health) badges.push(`<div class="badge badge-health-${snap.dashboard.status.health}">${safeHtml(String(snap.dashboard.status.health).toUpperCase())}</div>`);
    if(snap.profile?.label) badges.push(`<div class="badge" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--text-muted);">${safeHtml(snap.profile.label)}</div>`);
    document.getElementById('activeProjectBadges').innerHTML = badges.join('');

    const wsInfo = document.getElementById('workspaceInfo');
    const btnRescan = document.getElementById('btnRescan');
    const btnLinkProjectRoot = document.getElementById('btnLinkProjectRoot');
    const settings = snap.settings || {};
    if(settings.projectRoot) {
        wsInfo.style.display = 'flex';
        document.getElementById('wsPath').textContent = `Pasta: ${textOrFallback(settings.projectRoot)}`;
        document.getElementById('wsStack').textContent = textOrFallback(settings.stackHint, snap.profile?.label || 'Stack generica');
        document.getElementById('wsIndexed').textContent = settings.lastIndexedAt ? `Indexado: ${new Date(settings.lastIndexedAt).toLocaleTimeString()}` : 'Indexando...';
        btnRescan.style.display = 'inline-block';
        btnLinkProjectRoot.style.display = 'none';
    } else {
        wsInfo.style.display = 'none';
        btnRescan.style.display = 'none';
        btnLinkProjectRoot.style.display = 'inline-block';
    }

    const prog = snap.dashboard?.progress || {};
    document.getElementById('mOverall').textContent = `${prog.overallPct || 0}%`;
    document.getElementById('mOverallBar').style.width = `${prog.overallPct || 0}%`;
    document.getElementById('mTasks').textContent = `${prog.tasksPct || 0}%`;
    document.getElementById('mTasksBar').style.width = `${prog.tasksPct || 0}%`;
    document.getElementById('mMilestones').textContent = `${prog.milestonesPct || 0}%`;
    document.getElementById('mMilestonesBar').style.width = `${prog.milestonesPct || 0}%`;
    document.getElementById('mCommands').textContent = `${prog.commandsPct || 0}%`;
    document.getElementById('mCommandsBar').style.width = `${prog.commandsPct || 0}%`;

    const agendaOperational = snap.agendaOperational || {};
    const immediateTask = toArray(agendaOperational.immediate)[0];
    const milestone = toArray(snap.milestones).find(item => item.status !== 'completed');
    document.getElementById('directionHeadline').textContent = textOrFallback(immediateTask?.title || snap.radar?.nextDelivery || snap.dashboard?.status?.nextFocus, 'Sem rumo definido ainda.');
    document.getElementById('directionSubline').textContent = textOrFallback(snap.profile?.description || milestone?.description || snap.project.description, 'O painel vai destacar a proxima entrega que move o projeto.');
    document.getElementById('directionStateBadge').textContent = String(snap.project.state || 'active').toUpperCase();
    document.getElementById('directionStateBadge').className = `badge badge-state-${snap.project.state || 'active'}`;
    document.getElementById('directionHealthBadge').textContent = String(snap.dashboard?.status?.health || 'steady').toUpperCase();
    document.getElementById('directionHealthBadge').className = `badge badge-health-${snap.dashboard?.status?.health || 'steady'}`;
    document.getElementById('focusAlert').innerHTML = `<strong>Foco Atual:</strong> ${safeHtml(textOrFallback(snap.radar?.nextDelivery || snap.dashboard?.status?.nextFocus, 'Nenhum foco definido'))}`;
    document.getElementById('agendaGoal').textContent = textOrFallback(snap.radar?.blocker || milestone?.description || snap.project.description, 'O Nexus ainda vai traduzir milestones e tarefas em um destino pratico.');
    const agendaC = snap.dashboard?.agendaCounts || {};
    document.getElementById('agOverdue').textContent = agendaC.overdue || 0;
    document.getElementById('agToday').textContent = agendaC.today || 0;
    document.getElementById('agUpcoming').textContent = agendaC.upcoming || 0;
    document.getElementById('agendaPriorityList').innerHTML = toArray(agendaOperational.immediate).slice(0, 4).map(task => {
        const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Sem prazo';
        return `
            <div style="padding:0.85rem 0.95rem; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.03);">
                <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start;">
                    <div style="font-size:0.9rem; color:var(--text); line-height:1.45;">${safeHtml(textOrFallback(task.title, 'Tarefa sem titulo'))}</div>
                    <span class="badge" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); color:var(--text-muted);">${safeHtml(textOrFallback(task.priority, 'medium').toUpperCase())}</span>
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.45rem;">Prazo: ${dueLabel}</div>
                ${task.description ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.45rem; line-height:1.45;">${safeHtml(task.description)}</div>` : ''}
                <div style="display:flex; justify-content:flex-end; margin-top:0.75rem;">
                    <button class="btn-secondary" style="padding:0.45rem 0.75rem; font-size:0.78rem; border-color:rgba(6, 182, 212, 0.35); color:var(--secondary);" onclick="dispatchAgendaTask('${String(task.id).replace(/'/g, '&#39;')}', this)">Enviar para o agente</button>
                </div>
            </div>
        `;
    }).join('') || '<div class="empty-state">Nenhuma tarefa priorizada ainda.</div>';

    renderTaskBoardPanel(snap);
    renderGitPanel(snap);
    renderValidationPanel(snap);
    renderProjectRadar(snap);
    renderDigestPanel(snap);
    renderProjectSummary(snap);
    renderTimelinePanel(snap);
    renderFilesPanel(snap);
    renderFilesRail(snap);
    renderCommandsList(snap.commands || []);
}

function closeDrawer() {
    document.getElementById('detailsDrawer').classList.remove('open');
    document.getElementById('drawerOverlay').classList.remove('open');
}
