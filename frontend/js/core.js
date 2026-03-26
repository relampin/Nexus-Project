const API_BASE = '';
let liveSocket;
let liveFallbackSse;
let wsReconnectTimer;
let bootstrapPollTimer;
let liveTransportSeq = 0;
let globalState = {
    projects: [],
    activeProject: null,
    stats: {},
    activity: [],
    bootstrapKit: null,
    commandExpansion: {},
    fileExpansion: {},
    logExpansion: {}
};
let projectModalMode = 'create';
let currentAudio = null;
let currentSummaryAudioUrl = null;
let targetAudioProjectId = null;
let currentWatchedProjectId = null;

const DISPLAY_REPAIRS = [
    [/nexus:auto-discovery\s*/gi, ''],
    [/navega(?:��o|\?\?o)/gi, 'navegação'],
    [/integra(?:��o|\?\?o)/gi, 'integração'],
    [/valida(?:��o|\?\?o)/gi, 'validação'],
    [/restaura(?:��o|\?\?o)/gi, 'restauração'],
    [/descri(?:��o|\?\?o)/gi, 'descrição'],
    [/verifica(?:��o|\?\?o)/gi, 'verificação'],
    [/conclus(?:��o|\?\?o)/gi, 'conclusão'],
    [/execu(?:��o|\?\?o)/gi, 'execução'],
    [/observa(?:��o|\?\?o)/gi, 'observação'],
    [/documenta(?:��o|\?\?o)/gi, 'documentação'],
    [/hist(?:�rico|\?rico)/gi, 'histórico'],
    [/pend(?:�ncias|\?ncias)/gi, 'pendências'],
    [/t(?:�cnica|\?cnica)/gi, 'técnica'],
    [/pr(?:�ximo|\?ximo)/gi, 'próximo'],
    [/autom(?:�tico|\?tico)/gi, 'automático'],
    [/pr(?:�pria|\?pria)/gi, 'própria'],
    [/in(?:�cio|\?cio)/gi, 'início'],
    [/(?:�rea|\?rea)/gi, 'área'],
    [/n�o|n\?o/gi, 'não'],
    [/h\?/gi, 'há'],
    [/autom\?tico/gi, 'automático'],
    [/instru\?\?o/gi, 'instrução'],
    [/\?udio/gi, 'áudio'],
    [/A��o|A\?\?o/g, 'Ação'],
    [/a��o|a\?\?o/g, 'ação'],
    [/aten��o|aten\?\?o/gi, 'atenção'],
    [/\u00C3\u00A1/g, 'á'],
    [/\u00C3\u00A2/g, 'â'],
    [/\u00C3\u00A3/g, 'ã'],
    [/\u00C3\u00A9/g, 'é'],
    [/\u00C3\u00AA/g, 'ê'],
    [/\u00C3\u00AD/g, 'í'],
    [/\u00C3\u00B3/g, 'ó'],
    [/\u00C3\u00B4/g, 'ô'],
    [/\u00C3\u00BA/g, 'ú'],
    [/\u00C3\u00A7/g, 'ç'],
    [/\u00FFFD+/g, ''],
];

function normalizeDisplayText(value) {
    let text = value == null ? '' : String(value);

    if (/[ÃÂâï�]/.test(text)) {
        try {
            const repaired = decodeURIComponent(escape(text));
            const originalArtifacts = (text.match(/[ÃÂâï�]/g) || []).length;
            const repairedArtifacts = (repaired.match(/[ÃÂâï�]/g) || []).length;
            if (repairedArtifacts <= originalArtifacts) {
                text = repaired;
            }
        } catch(_) {}
    }

    for (const [pattern, replacement] of DISPLAY_REPAIRS) {
        text = text.replace(pattern, replacement);
    }

    return text.trim();
}

function repairVisibleText(root = document.body) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const changed = [];
    let node;

    while ((node = walker.nextNode())) {
        const nextValue = normalizeDisplayText(node.nodeValue);
        if (nextValue !== node.nodeValue) {
            changed.push([node, nextValue]);
        }
    }

    changed.forEach(([target, value]) => {
        target.nodeValue = value;
    });

    root.querySelectorAll?.('[title],[placeholder]').forEach((element) => {
        if (element.hasAttribute('title')) {
            element.setAttribute('title', normalizeDisplayText(element.getAttribute('title')));
        }
        if (element.hasAttribute('placeholder')) {
            element.setAttribute('placeholder', normalizeDisplayText(element.getAttribute('placeholder')));
        }
    });
}

function textOrFallback(value, fallback = '') {
    const normalized = normalizeDisplayText(value);
    return normalized || fallback;
}
