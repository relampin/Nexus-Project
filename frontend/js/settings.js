let uiPreferencesDraft = null;

function getUiPreferences() {
    return globalState.uiPreferences || { themePreset: 'default', panelMode: 'full' };
}

function getThemePresets() {
    return globalState.themePresets || [
        { id: 'default', label: 'Nexus Original', colors: { bg: '#060B10', surface: '#0C131C', primary: '#3B82F6', secondary: '#06b6d4' } }
    ];
}

function resolveThemePreset(id) {
    return getThemePresets().find(p => p.id === id) || getThemePresets()[0];
}

function applyUiPreferences(prefs) {
    if (!prefs) return;
    const theme = resolveThemePreset(prefs.themePreset);
    if (theme && theme.colors) {
        document.documentElement.style.setProperty('--bg', theme.colors.bg || '#060B10');
        document.documentElement.style.setProperty('--surface', theme.colors.surface || '#0C131C');
        document.documentElement.style.setProperty('--primary', theme.colors.primary || '#3B82F6');
        document.documentElement.style.setProperty('--secondary', theme.colors.secondary || '#06b6d4');
    }
    if (prefs.panelMode === 'simplified') {
        document.body.classList.add('panel-mode-simplified');
    } else {
        document.body.classList.remove('panel-mode-simplified');
    }
}

function openSettingsModal() {
    uiPreferencesDraft = { ...getUiPreferences() };
    renderSettingsModal();
    document.getElementById('settingsOverlay').style.display = 'block';
    document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settingsOverlay').style.display = 'none';
    document.getElementById('settingsModal').style.display = 'none';
    uiPreferencesDraft = null;
    applyUiPreferences(getUiPreferences());
}

function updateSettingsDraft(patch) {
    uiPreferencesDraft = {
        ...(uiPreferencesDraft || getUiPreferences()),
        ...(patch || {})
    };
    renderSettingsModal(true);
}

function renderSettingsModal(previewOnly = false) {
    const modal = document.getElementById('settingsModal');
    const summary = document.getElementById('settingsSummary');
    const themeGrid = document.getElementById('settingsThemeGrid');
    const modeGrid = document.getElementById('settingsModeGrid');
    if (!modal || !summary || !themeGrid || !modeGrid) return;

    const prefs = uiPreferencesDraft || getUiPreferences();
    const themePresets = getThemePresets();
    const selectedTheme = resolveThemePreset(prefs.themePreset);
    const modeCopy = prefs.panelMode === 'simplified'
        ? 'O modo simplificado corta ruído visual e deixa o foco em agenda, radar e resumo.'
        : 'O modo completo preserva o painel operacional inteiro, com trilhos, logs, Git, validação e comandos.';

    themeGrid.innerHTML = themePresets.map((preset) => `
        <button type="button" class="settings-option${preset.id === prefs.themePreset ? ' active' : ''}" onclick="updateSettingsDraft({ themePreset: '${String(preset.id).replace(/'/g, '&#39;')}' })">
            <div class="theme-preview">
                <span class="theme-chip" style="background:${safeHtml(preset.colors?.bg || '#000')};"></span>
                <span class="theme-chip" style="background:${safeHtml(preset.colors?.surface || '#111')};"></span>
                <span class="theme-chip" style="background:${safeHtml(preset.colors?.primary || '#333')};"></span>
                <span class="theme-chip" style="background:${safeHtml(preset.colors?.secondary || '#666')};"></span>
            </div>
            <div class="settings-option-title">${safeHtml(textOrFallback(preset.label, 'Tema'))}</div>
            <div class="settings-option-copy">${safeHtml(textOrFallback(preset.description, 'Sem descrição.'))}</div>
        </button>
    `).join('');

    modeGrid.innerHTML = [
        {
            id: 'full',
            title: 'Painel completo',
            copy: 'Mantém o Nexus exatamente no formato operacional atual, com todos os paineis e trilhos.'
        },
        {
            id: 'simplified',
            title: 'Painel simplificado',
            copy: 'Enxuga a leitura, reduz painéis avançados e deixa a agenda, o radar e o resumo mais claros.'
        }
    ].map(option => `
        <button type="button" class="settings-option${option.id === prefs.panelMode ? ' active' : ''}" onclick="updateSettingsDraft({ panelMode: '${option.id}' })">
            <div class="settings-option-title">${safeHtml(option.title)}</div>
            <div class="settings-option-copy">${safeHtml(option.copy)}</div>
        </button>
    `).join('');

    summary.innerHTML = `
        <strong style="color:var(--text);">Prévia atual:</strong><br>
        Tema <strong style="color:var(--secondary);">${safeHtml(textOrFallback(selectedTheme?.label, 'Nexus Original'))}</strong>
        com <strong style="color:var(--secondary);">${prefs.panelMode === 'simplified' ? 'painel simplificado' : 'painel completo'}</strong>.
        <div style="margin-top: 0.35rem;">${safeHtml(modeCopy)}</div>
    `;

    if (previewOnly) {
        applyUiPreferences(prefs);
    }
}

async function saveUiPreferences() {
    const saveBtn = document.getElementById('settingsSaveBtn');
    const nextPreferences = uiPreferencesDraft || getUiPreferences();

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Salvando...';
        }

        const result = await fetchJsonMaybe(`${API_BASE}/ui/preferences`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                themePreset: nextPreferences.themePreset,
                panelMode: nextPreferences.panelMode
            })
        });

        if (!result.ok) {
            throw new Error('preferences update failed');
        }

        globalState.uiPreferences = result.data?.preferences || nextPreferences;
        globalState.themePresets = result.data?.themePresets || globalState.themePresets;
        applyUiPreferences(globalState.uiPreferences);
        closeSettingsModal();
    } catch (error) {
        console.error(error);
        alert('Nao consegui salvar as configuracoes do painel agora.');
        applyUiPreferences(getUiPreferences());
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar preferências';
        }
    }
}
