let dashboardShellBuilt = false;
let projectSearchTimer = null;
let projectDetailsTimer = null;
let projectDetailsLoadedFor = null;

function buildDashboardShell() {
    const container = document.getElementById('dashboardContainer');
    if (!container || dashboardShellBuilt) return;

    container.innerHTML = `
        <section class="glass-panel operational-hub" id="projectDirectionHero">
            <div class="hub-top">
                <div>
                    <div class="eyebrow">Agenda operacional</div>
                    <h2 id="directionHeadline" class="hub-title">Sem rumo definido ainda.</h2>
                    <div id="directionSubline" class="hub-subline">O painel vai destacar a próxima entrega que move o projeto.</div>
                </div>
                <div class="hub-badges">
                    <span id="directionStateBadge" class="badge">ACTIVE</span>
                    <span id="directionHealthBadge" class="badge">STEADY</span>
                    <span id="radarStateBadge" class="badge">--</span>
                </div>
            </div>
            <div class="hub-grid">
                <div class="glass-panel hub-card">
                    <div class="panel-header">
                        <h2>Próxima ação da agenda</h2>
                    </div>
                    <div class="focus-alert" id="focusAlert">Aponte o foco atual do projeto.</div>
                    <div id="agendaGoal" class="hub-copy">O Nexus ainda vai traduzir milestones e tarefas em um destino prático.</div>
                    <div class="agenda-summary">
                        <div class="agenda-tile"><span id="agOverdue">0</span><small>Atrasadas</small></div>
                        <div class="agenda-tile"><span id="agToday">0</span><small>Hoje</small></div>
                        <div class="agenda-tile"><span id="agUpcoming">0</span><small>Futuras</small></div>
                    </div>
                    <div id="agendaPriorityList" class="action-stack"><div class="empty-state">Nenhuma tarefa priorizada ainda.</div></div>
                </div>
                <div class="glass-panel hub-card" id="projectSearchPanel">
                    <div class="panel-header">
                        <h2>Busca global</h2>
                    </div>
                    <div class="search-shell">
                        <input id="projectSearchInput" class="input-light" type="search" placeholder="Buscar tarefas, logs, comandos, arquivos e resumo" oninput="queueGlobalSearch(this.value)">
                        <button class="btn-secondary" type="button" onclick="runGlobalSearchFromInput()">Buscar</button>
                    </div>
                    <div id="searchMeta" class="search-meta">Digite para procurar no snapshot ativo.</div>
                    <div id="searchResults" class="search-results"><div class="empty-state">Os resultados aparecem aqui.</div></div>
                </div>
            </div>
            <div class="hub-footer">
                <div class="metric-rail">
                    <div class="metric-pill"><span>Geral</span><strong id="mOverall">0%</strong></div>
                    <div class="metric-pill"><span>Tarefas</span><strong id="mTasks">0%</strong></div>
                    <div class="metric-pill"><span>Marcos</span><strong id="mMilestones">0%</strong></div>
                    <div class="metric-pill"><span>Comandos</span><strong id="mCommands">0%</strong></div>
                </div>
                <div class="progress-stack">
                    <div class="progress-line"><span>Geral</span><div class="progress-track"><div class="progress-fill" id="mOverallBar"></div></div></div>
                    <div class="progress-line"><span>Tarefas</span><div class="progress-track"><div class="progress-fill" id="mTasksBar"></div></div></div>
                    <div class="progress-line"><span>Marcos</span><div class="progress-track"><div class="progress-fill" id="mMilestonesBar"></div></div></div>
                    <div class="progress-line"><span>Comandos</span><div class="progress-track"><div class="progress-fill" id="mCommandsBar"></div></div></div>
                </div>
            </div>
        </section>

        <div class="content-grid">
            <div class="panel-col" id="secondaryOperationsCol">
                <div class="glass-panel" id="taskBoardPanel">
                    <div class="panel-header"><h2>taskBoard e agenda operacional</h2></div>
                    <div id="taskBoardList" class="board-stack"><div class="empty-state">Nenhuma tarefa carregada ainda.</div></div>
                </div>
                <div class="glass-panel" id="gitPanel">
                    <div class="panel-header"><h2>Integração com Git</h2></div>
                    <div id="gitBranch" class="hub-copy">Branch: --</div>
                    <div id="gitSummary" class="search-meta">Mudanças e commits recentes aparecem aqui.</div>
                    <div class="mini-grid">
                        <div class="mini-card"><span>Arquivos alterados</span><strong id="gitChangedFiles">0</strong></div>
                        <div class="mini-card"><span>Commits recentes</span><strong id="gitRecentCommits">0</strong></div>
                        <div class="mini-card"><span>Status</span><strong id="gitStatus">--</strong></div>
                    </div>
                    <div id="gitChangesList" class="action-stack"><div class="empty-state">Nenhuma mudança detectada.</div></div>
                    <div id="gitCommitsList" class="action-stack" style="margin-top:0.85rem;"><div class="empty-state">Nenhum commit recente listado.</div></div>
                </div>
                <div class="glass-panel" id="validationPanel">
                    <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                        <h2>Validação automática</h2>
                        <button id="btnRunValidation" class="btn-secondary" type="button" onclick="runProjectValidation()">Rodar validação</button>
                    </div>
                    <div id="validationState" class="hub-copy">Estado de validação pendente.</div>
                    <div id="validationChecks" class="action-stack"><div class="empty-state">Sem verificações ainda.</div></div>
                </div>
            </div>
            <div class="panel-col">
                <div class="glass-panel radar-panel" id="projectRadarPanel">
                    <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0;">
                        <h2>Radar do Projeto</h2>
                        <div id="radarStateBadgeMirror" class="badge">--</div>
                    </div>
                    <div id="radarCopy" class="radar-copy">O Nexus vai preencher esta leitura com o que entendeu do projeto ativo.</div>
                    <div id="radarActions" class="action-bar"><div class="empty-state">Ações estratégicas aparecem aqui.</div></div>
                    <div class="radar-priority-grid">
                        <div class="radar-card radar-card-priority"><div class="radar-card-title">Risco principal</div><div id="radarMainRisk" class="radar-list-item">Nenhum risco mapeado ainda.</div></div>
                        <div class="radar-card radar-card-priority"><div class="radar-card-title">Bloqueio atual</div><div id="radarCurrentBlocker" class="radar-list-item">Nenhum bloqueio mapeado ainda.</div></div>
                        <div class="radar-card radar-card-priority"><div class="radar-card-title">Próxima entrega recomendada</div><div id="radarNextDelivery" class="radar-list-item">Nenhuma entrega recomendada ainda.</div></div>
                    </div>
                    <div class="radar-grid">
                        <div class="radar-card"><div class="radar-card-title">Próximos checkpoints</div><div id="radarChecklist" class="radar-list"><div class="radar-list-item">Nenhum checkpoint mapeado ainda.</div></div></div>
                        <div class="radar-card"><div class="radar-card-title">Saúde operacional</div><div id="radarStats" class="radar-stats"><div class="radar-stat"><div class="radar-stat-label">Tarefas abertas</div><div class="radar-stat-value">0</div></div></div></div>
                    </div>
                </div>
                <div class="glass-panel" id="projectSummarySection" style="display:none; flex-direction:column; gap:1rem;">
                    <div class="panel-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
                        <div>
                            <h2 style="display:flex; align-items:center; gap:0.5rem; font-size:1.15rem; color: var(--secondary);">
                                <span id="summaryTitle" style="font-size:1.1rem;">O que mudou hoje</span>
                            </h2>
                            <div id="summaryMeta" style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">Atualizado em: --</div>
                        </div>
                        <div id="audioPlayerContainer" style="display:flex; gap:0.75rem; align-items:center; background: rgba(0,0,0,0.3); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid var(--border);">
                            <span id="audioStatusBadge" class="badge" style="background: rgba(255,255,255,0.1); color: var(--text-muted); font-size: 0.65rem;">AGUARDANDO</span>
                            <button id="btnPlayAudio" class="btn-secondary" style="padding: 0.4rem 0.75rem; display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; border-color: rgba(6, 182, 212, 0.4); color: var(--secondary);" onclick="toggleAudio(event)" disabled>Carregando</button>
                        </div>
                    </div>
                    <div id="summaryContent" style="color:#e4e4e7; line-height:1.6; font-size:0.95rem; display:flex; flex-direction:column; gap:1rem; border-top:1px solid var(--border); padding-top:1rem;"><div style="padding:1rem; text-align:center; color:var(--text-muted); font-style:italic;">Carregando resumo do projeto...</div></div>
                    <div class="digest-strip">
                        <div class="digest-box">
                            <div class="radar-card-title">Resumo do dia</div>
                            <div id="digestSummary" class="hub-copy">Nenhum digest carregado ainda.</div>
                        </div>
                        <div class="digest-box">
                            <div class="radar-card-title">Mudanças recentes</div>
                            <div id="digestTodayList" class="action-stack"><div class="empty-state">Sem itens no digest.</div></div>
                        </div>
                    </div>
                </div>
                <div class="glass-panel project-timeline-panel" id="projectTimelinePanel">
                    <div class="panel-header"><h2>Timeline real do projeto</h2></div>
                    <div id="projectTimeline" class="timeline"><div class="empty-state">Carregando eventos da timeline...</div></div>
                </div>
            </div>
            <div class="panel-col">
                <div id="manualAssistWarning" class="alert-box manual-assist-hidden">
                    <div class="alert-icon">⚠️</div>
                    <div class="alert-content">
                        <div class="alert-title">Ação manual requerida</div>
                        <div class="alert-text" id="manualAssistText">Há jobs aguardando.</div>
                    </div>
                </div>
                <div class="glass-panel" id="dispatchPanel">
                    <div class="panel-header"><h2>Disparar comando</h2></div>
                    <form class="dispatch-form" id="dispatchForm" onsubmit="dispatchCommand(event)">
                        <div class="form-row">
                            <select id="f-source" class="input-light"><option>orquestrador</option><option>codex</option><option>antigravity</option></select>
                            <select id="f-target" class="input-light"><option>codex</option><option>antigravity</option><option>system</option></select>
                        </div>
                        <textarea id="f-text" placeholder="Descreva a tarefa ou comando..."></textarea>
                        <button class="btn-primary full-width" type="submit">Enviar comando</button>
                    </form>
                </div>
                <div class="glass-panel" id="bootstrapKitPanel">
                    <div class="panel-header"><h2>Kit de Outra Máquina</h2></div>
                    <div id="bootstrapKitMeta" class="hub-copy">Carregando prompts e documentação canônica...</div>
                    <div id="bootstrapKitList" class="bootstrap-kit-stack" style="margin-top: 1rem;">
                        <div class="empty-state">Os arquivos de bootstrap vão aparecer aqui.</div>
                    </div>
                </div>
                <div class="glass-panel" id="queuePanel">
                    <div class="panel-header"><h2>Fila global</h2></div>
                    <div class="queue-stats" id="queueStatsBox">--</div>
                </div>
                <div class="glass-panel" id="auditSection" style="display:none; border-color: rgba(16, 185, 129, 0.3);">
                    <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h2 style="color: var(--success); font-size: 1.1rem; font-weight: 600; margin: 0;">Nexus Audit</h2>
                        <div id="auditBadge" class="badge">--</div>
                    </div>
                    <div id="auditContent" style="font-size: 0.85rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem;"></div>
                </div>
            </div>
        </div>

        <section class="glass-panel workspace-rail-panel" id="filesRailPanel" style="margin-top: 1.5rem; border-color: rgba(6, 182, 212, 0.28); background: rgba(18, 18, 20, 0.75);">
            <div class="commands-rail-copy">
                <div class="panel-header" style="margin-bottom: 0;">
                    <h2 style="color: var(--secondary); font-size: 1.1rem; font-weight: 600; margin: 0;">Workspace</h2>
                    <div class="commands-rail-hint">Arquivos indexados e trechos relevantes do workspace.</div>
                </div>
                <div id="filesCountBadge" class="badge" style="background:rgba(6, 182, 212, 0.1); border:1px solid rgba(6, 182, 212, 0.2); color:var(--secondary); font-size:0.65rem;">0 arquivos</div>
            </div>
            <div id="filesSynopsis" style="font-size: 0.85rem; color: var(--text); line-height: 1.6; background: rgba(255,255,255,0.02); border-radius: 8px; padding: 1rem; border: 1px solid rgba(255,255,255,0.05);">O Nexus ainda está lendo o workspace...</div>
            <div id="filesStats" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:0.5rem;"></div>
            <div id="filesList" class="file-list-rail"><div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem; text-align: center; border: 1px dashed var(--border); border-radius: 8px;">Nenhum arquivo indexado ainda.</div></div>
        </section>

        <section class="glass-panel logs-rail-panel" id="logsRailPanel" style="margin-top: 1.5rem;">
            <div class="commands-rail-copy">
                <div class="panel-header" style="margin-bottom: 0;">
                    <h2>AI Logs e narrativa</h2>
                    <div class="commands-rail-hint">Os logs ficam nesta faixa com leitura resumida, sinais recentes e cards horizontais para abrir eventos específicos.</div>
                </div>
            </div>
            <div id="logsScopeInfo" style="font-size: 0.78rem; color: var(--text-muted);">Carregando escopo dos logs...</div>
            <div class="logs-rail-top">
                <div class="logs-summary-card">
                    <div class="auto-narrative" id="autoNarrativeBox" style="margin-bottom: 0.85rem;">Resumo automático gerado pelo Nexus aparecerá aqui...</div>
                    <div class="agent-stats" id="agentStatsBox" style="margin-bottom: 0;"></div>
                </div>
                <div id="logReaderSummary" class="logs-summary-card" style="border: 1px solid rgba(6, 182, 212, 0.18); background: rgba(6, 182, 212, 0.06);">
                    <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:center; margin-bottom:0.65rem; flex-wrap:wrap;">
                        <div style="font-size:0.76rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--secondary); font-weight:600;">Leitura automatizada dos logs</div>
                        <div id="logReaderStatus" style="font-size:0.76rem; color:var(--text-muted);">Aguardando sinais do projeto...</div>
                    </div>
                    <div id="logReaderFocus" style="font-size:0.84rem; color:var(--text); line-height:1.45; margin-bottom:0.75rem; padding:0.75rem 0.8rem; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.12);">A IA ainda não tem foco sugerido a partir dos logs.</div>
                    <div id="logReaderSignals" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:0.45rem; margin-bottom:0.75rem;"></div>
                    <div id="logReaderList" style="display:flex; flex-direction:column; gap:0.5rem;"><div style="font-size:0.84rem; color:var(--text-muted); line-height:1.45;">O painel ainda vai consolidar os sinais recentes do projeto aqui.</div></div>
                </div>
            </div>
            <div id="projectActivityRail" class="logs-activity-rail"><div style="color:var(--text-muted); font-size:0.85rem;">Nenhuma atividade recente.</div></div>
        </section>

        <section class="glass-panel commands-rail-panel" id="commandsRailPanel" style="margin-top: 1.5rem;">
            <div class="commands-rail-copy">
                <div class="panel-header" style="margin-bottom: 0;">
                    <h2>Comandos Recentes</h2>
                    <div class="commands-rail-hint">Os comandos ficam nesta trilha horizontal no rodapé do painel. Cada card mostra um resumo curto e você expande só quando quiser ver o conteúdo completo.</div>
                </div>
            </div>
            <div class="command-list" id="commandsList"></div>
        </section>
    `;
    dashboardShellBuilt = true;
}
