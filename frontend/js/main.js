async function init() {
    buildDashboardShell();
    updateRealtimeStatus(false, 'Carregando painel...');
    try {
        await refreshBootstrap();
        await hydrateBootstrapKit();
    } catch(e) {
        console.error("Failed to bootstrap UX", e);
    } finally {
        updateRealtimeStatus(true, 'Snapshot local');
        startBootstrapPolling();
        setupRealtime();
    }
}

async function refreshBootstrap() {
    const res = await fetch(`${API_BASE}/ui/bootstrap`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    handleSnapshot(data);
}

async function hydrateBootstrapKit(force = false) {
    if (globalState.bootstrapKit && !force) {
        renderBootstrapKit();
        return;
    }

    const result = await fetchJsonMaybe(`${API_BASE}/ui/bootstrap-kit`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
    });

    if (!result.ok) {
        renderBootstrapKit();
        return;
    }

    globalState.bootstrapKit = result.data || { items: [] };
    renderBootstrapKit();
}

function cleanupLiveTransport() {
    liveTransportSeq += 1;
    currentWatchedProjectId = null;
    if(wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }
    if(liveSocket) {
        try { liveSocket.close(); } catch(_) {}
        liveSocket = null;
    }
    if(liveFallbackSse) {
        try { liveFallbackSse.close(); } catch(_) {}
        liveFallbackSse = null;
    }
    stopBootstrapPolling();
}

function updateRealtimeStatus(connected, label) {
    const connDiv = document.getElementById('connStatus');
    const connText = document.getElementById('connText');
    if(!connDiv || !connText) return;

    if(connected) {
        connDiv.classList.add('connected');
    } else {
        connDiv.classList.remove('connected');
    }
    connText.textContent = label;
}

function stopBootstrapPolling() {
    if(bootstrapPollTimer) {
        clearInterval(bootstrapPollTimer);
        bootstrapPollTimer = null;
    }
}

function startBootstrapPolling() {
    if(bootstrapPollTimer) return;
    bootstrapPollTimer = setInterval(async () => {
        try {
            await refreshBootstrap();
            updateRealtimeStatus(true, 'Fallback local');
        } catch(err) {
            console.error('Falha no fallback de sincronizacao do painel.', err);
            updateRealtimeStatus(false, 'Conectando...');
        }
    }, 5000);
}

function sendRealtime(message) {
    if(liveSocket && liveSocket.readyState === WebSocket.OPEN) {
        liveSocket.send(JSON.stringify(message));
    }
}

function notifyRealtimeProjectWatch() {
    const nextProjectId = globalState.activeProject?.project?.id || null;
    if(currentWatchedProjectId === nextProjectId) {
        return;
    }
    currentWatchedProjectId = nextProjectId;
    sendRealtime({
        type: 'project.watch',
        projectId: nextProjectId
    });
}

function setupRealtime() {
    cleanupLiveTransport();
    const transportSeq = liveTransportSeq;
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${location.host}/ui/ws`;

    try {
        liveSocket = new WebSocket(wsUrl);
    } catch(err) {
        console.error('Falha ao abrir websocket do Nexus, usando SSE.', err);
        setupSSEFallback();
        return;
    }

    liveSocket.onopen = () => {
        if(transportSeq !== liveTransportSeq) return;
        stopBootstrapPolling();
        updateRealtimeStatus(true, 'Tempo real');
        notifyRealtimeProjectWatch();
        sendRealtime({ type: 'snapshot.request' });
        sendRealtime({
            type: 'antigravity.sample',
            projectId: globalState.activeProject?.project?.id || null
        });
    };

    liveSocket.onmessage = (event) => {
        if(transportSeq !== liveTransportSeq) return;
        try {
            const message = JSON.parse(event.data);
            if(message.type === 'snapshot' && message.data) {
                handleSnapshot(message.data);
            }
        } catch(err) {
            console.error(err);
        }
    };

    liveSocket.onerror = () => {
        if(transportSeq !== liveTransportSeq) return;
        updateRealtimeStatus(false, 'Reconectando...');
        startBootstrapPolling();
    };

    liveSocket.onclose = () => {
        if(transportSeq !== liveTransportSeq) return;
        updateRealtimeStatus(false, 'Fallback SSE');
        startBootstrapPolling();
        setupSSEFallback();
    };
}

function setupSSEFallback() {
    const transportSeq = liveTransportSeq;
    if(liveFallbackSse) {
        try { liveFallbackSse.close(); } catch(_) {}
    }
    liveFallbackSse = new EventSource(`${API_BASE}/ui/events`);

    liveFallbackSse.onopen = () => {
        if(transportSeq !== liveTransportSeq) return;
        stopBootstrapPolling();
        updateRealtimeStatus(true, 'Sincronizado');
    };

    liveFallbackSse.addEventListener('snapshot', (e) => {
        if(transportSeq !== liveTransportSeq) return;
        try {
            const data = JSON.parse(e.data);
            handleSnapshot(data);
        } catch(err) {
            console.error(err);
        }
    });

    liveFallbackSse.onerror = () => {
        if(transportSeq !== liveTransportSeq) return;
        startBootstrapPolling();
        updateRealtimeStatus(false, 'Conectando...');
        if(!wsReconnectTimer) {
            wsReconnectTimer = setTimeout(() => {
                wsReconnectTimer = null;
                setupRealtime();
            }, 3000);
        }
    };
}

function runRenderStep(label, fn) {
    try {
        fn();
    } catch(error) {
        console.error(`Falha ao renderizar ${label}`, error);
    }
}

function handleSnapshot(data) {
    buildDashboardShell();
    if(data.projects) globalState.projects = data.projects.items || data.projects;
    if(data.activeProject) globalState.activeProject = data.activeProject;
    if(data.stats) globalState.stats = data.stats;
    if(data.activity) globalState.activity = data.activity;

    if(data.preferences) globalState.uiPreferences = data.preferences;
    if(data.themePresets) globalState.themePresets = data.themePresets;
    runRenderStep('applyUiPreferences', () => applyUiPreferences(getUiPreferences()));

    runRenderStep('sidebar', () => renderSidebar());
    runRenderStep('activeProject', () => renderActiveProject());
    runRenderStep('queueStats', () => renderQueueStats(data.stats));
    if(data.manualAssist) {
        runRenderStep('manualAssist', () => renderManualAssist(data.manualAssist));
    }
    runRenderStep('audit', () => renderAudit(data.audit));
    runRenderStep('bootstrapKit', () => renderBootstrapKit());
    Promise.resolve(hydrateProjectDetails(globalState.activeProject?.project?.id)).catch((error) => {
        console.error('Falha ao hidratar detalhes do projeto', error);
        projectDetailsLoadedFor = null;
    });
    runRenderStep('notifyRealtimeProjectWatch', () => notifyRealtimeProjectWatch());
}
