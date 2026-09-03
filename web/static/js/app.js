// 관심종목 정렬용 상태 변수
let watchlistCache = [];
let watchlistSortKey = '';
let watchlistSortAsc = true;
let watchlistInherited = false;
let watchlistPolicy = null;
let holdingsCache = [];
let holdingsSortKey = 'value';
let holdingsSortAsc = false;
let holdingStrategyFilter = 'all';
let holdingPnlFilter = 'all';
let activeStrategyAuditId = '';
let schedulerPollInterval = null;
let aiStrategyCatalog = [];
let strategyPreviewResultsCache = [];
let strategyPreviewCatalogCache = [];
const strategyAnalysisSortState = new Map();
let aiStrategyDraftSelection = null;
let aiStrategySelectionDirty = false;
let aiStrategyCategoryFilter = '';

const legacyFormatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0
    }).format(Number(value || 0));
};

const legacyFormatPercent = (value) => {
    const numeric = Number(value || 0);
    const sign = numeric > 0 ? '+' : '';
    return `${sign}${numeric.toFixed(2)}%`;
};

const legacyFormatNumber = (value, digits = 0) => {
    const numeric = Number(value || 0);
    return numeric.toLocaleString(undefined, { maximumFractionDigits: digits });
};

const legacyEscapeHtml = (value) => {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
};

// Presentation primitives are owned by dashboard-formatters.js. The local
// implementations remain as a rollout fallback for stale cached pages.
const formatCurrency = window.HanstockDashboardFormatters?.formatCurrency || legacyFormatCurrency;
const formatPercent = window.HanstockDashboardFormatters?.formatPercent || legacyFormatPercent;
const formatNumber = window.HanstockDashboardFormatters?.formatNumber || legacyFormatNumber;
const escapeHtml = window.HanstockDashboardFormatters?.escapeHtml || legacyEscapeHtml;

const ACTION_LABELS = {
    buy: '매수',
    sell: '매도',
    hold: '보유',
};

const STATUS_LABELS = {
    pending: '승인대기',
    executed: '처리완료',
    failed: '실패',
    rejected: '거절',
    broker_unknown: '증권사 확인 필요',
    expired: '거래일 만료',
};

const toKorAction = (value) => {
    const key = String(value || 'hold').toLowerCase();
    return ACTION_LABELS[key] || value || '-';
};

const toKorStatus = (value) => {
    const key = String(value || '').toLowerCase();
    return STATUS_LABELS[key] || value || '-';
};

const ORDER_STATUS_LABELS = {
    submitted: 'Submitted',
    open: 'Open',
    partial: 'Partial',
    filled: 'Filled',
    simulated: 'Simulated',
    failed: 'Failed',
    broker_unknown: '증권사 확인 필요',
};

const orderStatusLabel = (value) => {
    const key = String(value || '').toLowerCase();
    return ORDER_STATUS_LABELS[key] || value || '-';
};

const translateReason = (value) => {
    const replacements = [
        ['stop loss', '손절 기준 도달'],
        ['take profit', '익절 기준 도달'],
        ['large profit split sell', '큰 수익 분할매도'],
        ['MACD bearish take profit', 'MACD 약세 익절'],
        ['split buy', '분할매수'],
        ['multi-strategy buy', '복합 전략 매수'],
        ['golden cross buy', '골든크로스 매수'],
        ['AI allocation target', 'AI 목표비중'],
        ['Portfolio optimizer target', '포트폴리오 목표비중'],
    ];
    let text = String(value || '-');
    replacements.forEach(([from, to]) => {
        text = text.replaceAll(from, to);
    });
    text = text.replace(/\bscore\b/g, '점수');
    text = text.replace(/\bvol\b/g, '변동성');
    return text;
};

const SKIP_REASON_LABELS = {
    'category filtered': '카테고리 제외',
    'daily loss halt blocks buy orders only': '일손실 한도 초과로 신규 매수 차단',
    'buying cash unavailable': '매수가능현금 없음',
    'capital exposure limit reached': '운용자본 한도 초과',
    'buy order exceeds buying cash': '주문금액이 매수가능현금 초과',
    'sell order pending or holding is not orderable': '매도대기/주문불가 보유',
};

const schedulerSkipReasonLabel = (row = {}) => {
    const raw = String(row.skip_reason || '').trim();
    if (raw) {
        return SKIP_REASON_LABELS[raw] || translateReason(raw);
    }
    const qty = Number(row.qty || row.signal_qty || 0);
    if (row.action === 'hold') return '유지(Hold)';
    if (qty === 0) return '주문수량 0';
    return '주문 조건 미충족';
};

const schedulerDecisionLabel = (decision, row = {}) => {
    if (decision === 'skip' && row.action === 'hold' && !row.skip_reason) return '보유 유지';
    if (decision === 'skip') return `보류: ${schedulerSkipReasonLabel(row)}`;
    return toKorDecision(decision);
};

const schedulerReasonText = (row = {}) => {
    let cleanReason = row.reason || '스케쥴 분석 결과';
    if (cleanReason.startsWith('[')) {
        const closingIdx = cleanReason.indexOf(']');
        if (closingIdx !== -1) {
            cleanReason = cleanReason.substring(closingIdx + 1).trim();
        }
    }
    if ((row.decision || (row.approval_id ? 'approved' : 'skip')) !== 'skip') {
        return translateReason(cleanReason);
    }
    if (row.action === 'hold' && !row.skip_reason) {
        return `[전략 판단: 보유 유지] ${translateReason(cleanReason)}`;
    }
    return `[보류 원인: ${schedulerSkipReasonLabel(row)}] ${translateReason(cleanReason)}`;
};

const strategyReasonLabel = (reason) => {
    const text = String(reason || '').trim();
    if (!text) {
        return '데이터 부족';
    }

    const mappings = [
        ['RSI recovery', '과매도 구간에서 반등 신호가 확인됐습니다.'],
        ['RSI pullback', '단기 조정 뒤 재진입을 검토할 수 있는 구간입니다.'],
        ['MACD bullish cross', 'MACD 골든크로스가 나와 상승 전환 가능성이 있습니다.'],
        ['MACD positive', 'MACD 흐름이 플러스라 단기 모멘텀이 유지되고 있습니다.'],
        ['Bollinger rebound', '볼린저 하단 반등이 나와 기술적 되돌림 가능성이 있습니다.'],
        ['near lower band', '주가가 볼린저 하단 부근이라 반등 관찰 구간입니다.'],
        ['trend pullback', '상승 추세 안에서 눌림목이 나온 모습입니다.'],
        ['long trend pullback', '중기 상승 추세 안에서 조정이 진행 중입니다.'],
        ['20-day breakout with volume', '거래량을 동반한 20일 돌파가 나왔습니다.'],
        ['volume spike', '거래량이 평소보다 강하게 증가했습니다.'],
        ['SMA20>SMA60', '단기 이동평균이 중기선 위에 있어 추세가 우호적입니다.']
    ];

    for (const [needle, label] of mappings) {
        if (text.includes(needle)) {
            return label;
        }
    }
    return translateReason(text);
};

const aiActionGuide = (action, name) => {
    if (action === 'buy') {
        return `${name} 비중을 조금 더 실어도 된다는 판단입니다.`;
    }
    if (action === 'sell') {
        return `${name} 비중이 현재 조건 대비 다소 크므로 줄이는 편이 낫다는 판단입니다.`;
    }
    return `${name}은 지금은 비중을 크게 바꾸지 않고 유지하는 편이 낫다는 판단입니다.`;
};

const aiDecisionLabel = (action) => {
    if (action === 'buy') {
        return '비중 확대';
    }
    if (action === 'sell') {
        return '비중 축소';
    }
    return '비중 유지';
};

const aiModelStatusLabel = (status) => {
    const key = String(status || '').toLowerCase();
    const labels = {
        ready: '모델 적용',
        low_confidence: '신뢰도 낮음',
        fallback: '룰 기반',
        disabled: 'AI 꺼짐',
        queued: '룰 우선',
    };
    return labels[key] || status || '-';
};

const aiModelStatusKind = (status) => {
    const key = String(status || '').toLowerCase();
    if (key === 'ready') return 'buy';
    if (key === 'low_confidence' || key === 'fallback') return 'warn';
    if (key === 'queued') return 'hold';
    return 'hold';
};

const strategyStatusLabel = (status) => {
    const labels = {
        draft: '초안',
        verified: '검증완료',
        backtested: '백테스트완료',
        paper_running: '모의운영중',
        paper_passed: '모의운영통과',
        approved: '승인완료',
        review_required: '검토필요',
        retired: '사용중지',
    };
    return labels[String(status || '').toLowerCase()] || status || '-';
};

const strategyStatusKind = (status) => {
    const key = String(status || '').toLowerCase();
    if (key === 'approved' || key === 'paper_passed' || key === 'backtested') return 'buy';
    if (key === 'draft' || key === 'paper_running' || key === 'review_required') return 'warn';
    if (key === 'retired') return 'sell';
    return 'hold';
};

function strategyDisplayName(strategy) {
    return strategy?.display_name || strategy?.name || strategy?.id || '-';
}

function strategyOperationLabel(operation) {
    if (operation?.label) return operation.label;
    if (operation?.ready) {
        if (operation.mode === 'live') return '실전운영 가능';
        if (operation.mode === 'dry_run') return '모의주문 가능';
        return '데모운영 가능';
    }
    if (operation?.mode === 'inactive') return '선택 안됨';
    return '승인/검증 필요';
}

function buildCandidateStrategyMarkup(row) {
    return window.HanstockDashboardCandidateStrategy.render({
        escapeHtml,
        formatNumber,
        pill,
        aiModelStatusLabel,
        aiModelStatusKind,
    }, row);
}

function buildAiModalMarkup(payload) {
    return window.HanstockDashboardAiDetailModal.render({
        escapeHtml,
        formatNumber,
        formatCurrency,
        aiActionGuide,
        aiDecisionLabel,
        strategyReasonLabel,
    }, payload);
}

const legacySetTableMessage = (selector, colspan, message) => {
    const tbody = document.querySelector(selector);
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">${escapeHtml(message)}</td></tr>`;
    }
};

const legacySetStatus = (message, ok = false) => {
    const banner = document.getElementById('status-banner');
    if (banner) {
        banner.hidden = false;
        banner.className = `status-banner ${ok ? 'ok' : ''}`;
        banner.textContent = message;
    }
};

const legacySetButtonBusy = (id, busy) => {
    const button = typeof id === 'string' ? document.getElementById(id) : id;
    if (button) {
        button.disabled = busy;
    }
};

const legacySetElementText = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
    return element;
};

const setTableMessage = window.HanstockDashboardUi?.setTableMessage || legacySetTableMessage;
const setStatus = window.HanstockDashboardUi?.setStatus || legacySetStatus;
const setButtonBusy = window.HanstockDashboardUi?.setButtonBusy || legacySetButtonBusy;
const setElementText = window.HanstockDashboardUi?.setElementText || legacySetElementText;

async function legacyFetchJson(url, timeoutMs = 60000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const requestUrl = new URL(url, window.location.origin);
        requestUrl.searchParams.set('_ts', Date.now().toString());
        const response = await fetch(requestUrl.toString(), {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || `요청 실패: ${response.status}`);
        }
        return data;
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`요청 시간 초과: ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function legacyPostJson(url, payload = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || `요청 실패: ${response.status}`);
    }
    return data;
}

async function legacyDeleteJson(url) {
    const response = await fetch(url, {
        method: 'DELETE'
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || `요청 실패: ${response.status}`);
    }
    return data;
}

// HTTP calls are owned by dashboard-api.js. Keep legacy implementations above
// temporarily so older cached pages can still be diagnosed during rollout.
const fetchJson = window.HanstockDashboardApi?.fetchJson || legacyFetchJson;
const postJson = window.HanstockDashboardApi?.postJson || legacyPostJson;
const deleteJson = window.HanstockDashboardApi?.deleteJson || legacyDeleteJson;

function legacyPill(value, kind = 'hold') {
    return `<span class="pill pill-${kind}">${escapeHtml(value)}</span>`;
}

const pill = window.HanstockDashboardUi?.pill || legacyPill;

function setAiModalOpen(open) {
    const modal = document.getElementById('aiModal');
    if (!modal) {
        return;
    }
    modal.style.display = open ? 'block' : 'none';
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function setNoCandidatesModalOpen(open) {
    const modal = document.getElementById('noCandidatesModal');
    if (!modal) return;
    modal.style.display = open ? 'block' : 'none';
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function setPerformanceDetailPanelOpen(open) {
    const panel = document.getElementById('performance-detail-panel');
    if (!panel) return;
    panel.style.display = open ? 'block' : 'none';
}

function renderPerformanceDetailPanel(item) {
    return window.HanstockDashboardPerformanceDetail.render({
        escapeHtml,
        formatCurrency,
        formatPercent,
        toKorAction,
        translateReason,
        setOpen: setPerformanceDetailPanelOpen,
    }, item);
}

function buildScanErrorModalMarkup(errorMsg) {
    return window.HanstockDashboardCandidateMessages.scanError({ escapeHtml }, errorMsg);
}

function buildNoCandidatesModalMarkup(data) {
    return window.HanstockDashboardCandidateMessages.noCandidates({
        escapeHtml,
        strategyReasonLabel,
        formatNumber,
        pill,
    }, data);
}

let portfolioChartInstance = null;
let periodicChartInstance = null;
let periodicActiveTab = 'daily';
let periodicDataCache = null;
let latestConfig = null;

function strategySettingGroups(config) {
    return window.HanstockDashboardStrategySettingsSchema.groups(config);
}

function strategySettingFields(config) {
    return strategySettingGroups(config).flatMap((group) => group.fields);
}

function renderStrategySettingsForm(config) {
    return window.HanstockDashboardStrategySettingsScreen.render({
        groups: strategySettingGroups,
        escapeHtml,
    }, config);
}

function renderAiStrategySummary(config) {
    return window.HanstockDashboardAiStrategySummary.render({
        setText: setElementText,
        formatNumber,
        escapeHtml,
    }, config);
}

async function saveStrategySettings(event) {
    return window.HanstockDashboardStrategySettingsSave.handle({
        setButtonBusy,
        postJson,
        setStatus,
        renderConfig,
        renderBalance,
    }, event);
}

function renderPortfolioChart(labels, data, colors) {
    return window.HanstockDashboardPortfolioChart.render({
        getChart: () => portfolioChartInstance,
        setChart: (value) => { portfolioChartInstance = value; },
        escapeHtml,
        formatNumber,
    }, labels, data, colors);
}


async function renderRuntime() {
    return window.HanstockDashboardRuntimeScreen.render({
        fetchJson,
        pill,
        setText: (id, value) => setElementText(id, value),
        setHtml: (id, value) => { const element = document.getElementById(id); if (element) element.innerHTML = value; },
        labels: {
            real: '\uc2e4\uc804', demo: '\ubaa8\uc758', on: '\ucc28\ub2e8 ON', off: '\ucc28\ub2e8 OFF', enabled: '\uac00\ub2a5', blocked: '\ucc28\ub2e8',
            liveEnabled: '\uc2e4\uc8fc\ubb38 \uac00\ub2a5', liveBlocked: '\uc2e4\uc8fc\ubb38 \ucc28\ub2e8', disable: '\ub044\uae30', enable: '\ucf1c\uae30', calls: '\uac74',
            demoOrder: '\ubaa8\uc758\uc8fc\ubb38 \uac00\ub2a5', autoApproval: '\uc790\ub3d9\uc2b9\uc778', manualApproval: '\uc218\ub3d9\uc2b9\uc778',
            syncBlocked: '\ub3d9\uae30\ud654 \ubd88\uac00', sync: '\uc99d\uad8c \uae30\ub85d \ub3d9\uae30\ud654', syncBlockedTitle: '\ubaa8\uc758 \uc2e4\ud589(DRY_RUN) \uc911\uc5d0\ub294 \uc99d\uad8c \ub4f1\uacc4\uc88c \ub3d9\uae30\ud654\ub97c \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.',
        },
    });
}

async function toggleRuntimeOrderMode(buttonId, key, label) {
    const button = document.getElementById(buttonId);
    const nextEnabled = !(button?.dataset.enabled === 'true');
    setButtonBusy(buttonId, true);
    try {
        const result = await postJson('/api/runtime/order-mode', { key, enabled: nextEnabled });
        const stateText = nextEnabled ? '켰습니다' : '껐습니다';
        const details = `주문차단=${result.dry_run ? 'ON' : 'OFF'}, 최종 주문전송=${result.order_submission_enabled ? '가능' : '차단'}, 실전주문=${result.real_orders_enabled ? '가능' : '차단'}`;
        setStatus(`${label}을 ${stateText}. ${details}`, true);
        await Promise.all([renderRuntime(), renderConfig()]);
    } catch (err) {
        setStatus(`${label} 전환 실패: ${err.message}`);
    } finally {
        setButtonBusy(buttonId, false);
    }
}

async function toggleAutoApproval() {
    const button = document.getElementById('btn-auto-approval');
    const nextEnabled = !(button?.dataset.enabled === 'true');
    setButtonBusy('btn-auto-approval', true);
    try {
        const result = await postJson('/api/auto-approval', { enabled: nextEnabled });
        const processedCount = Number(result.processed_count || 0);
        const suffix = result.enabled && processedCount > 0 ? ` 대기 주문 ${processedCount}건을 처리했습니다.` : '';
        setStatus(`자동승인을 ${result.enabled ? '켰습니다' : '껐습니다'}.${suffix}`, true);
        await Promise.all([renderRuntime(), renderApprovals(), renderTrades(), renderBalance()]);
    } catch (err) {
        setStatus(`자동승인 전환 실패: ${err.message}`);
    } finally {
        setButtonBusy('btn-auto-approval', false);
    }
}


async function renderConfig() {
    return window.HanstockDashboardConfigScreen.render({
        fetchJson,
        setLatestConfig: (config) => { latestConfig = config; },
        setText: (id, value) => setElementText(id, value),
        renderSummary: renderAiStrategySummary,
        renderForm: renderStrategySettingsForm,
        saveSettings: saveStrategySettings,
    });
}


function renderRisk(balance) {
    return window.HanstockDashboardRiskScreen.render(balance, {
        config: latestConfig,
        formatCurrency,
        formatNumber,
        setText: (id, value) => setElementText(id, value),
        labels: { used: '\uc0ac\uc6a9', normal: '\uc815\uc0c1' },
    });
}


function renderHoldingAccountSummary(balance, displayTotal, realizedPnl = 0) {
    return window.HanstockDashboardHoldingSummaryScreen.render(balance, displayTotal, realizedPnl, {
        escapeHtml,
        formatCurrency,
        formatNumber,
        labels: {
            stale: '\ucd5c\uadfc \uce90\uc2dc \uacc4\uc88c\uc815\ubcf4', current: '\ud604\uc7ac \uacc4\uc88c\uc815\ubcf4', total: '\ucd1d \ud3c9\uac00\uae08\uc561', stock: '\uc8fc\uc2dd \ud3c9\uac00', cash: '\ud604\uae08', ratio: '\ube44\uc911', orderable: '\uc8fc\ubb38\uac00\ub2a5', pnl: '\ud3c9\uac00\uc190\uc775', realized: '\uc2e4\ud604\uc190\uc775', holdings: '\ubcf4\uc720\uc885\ubaa9', items: '\uac1c', sortHint: '\ubaa9\ub85d \ud5e4\ub354 \ud074\ub9ad \uc2dc \uc815\ub82c',
        },
    });
}

function holdingSortValue(holding, key) {
    if (key === 'name') {
        return `${holding.name || ''} ${holding.symbol || ''}`.toLowerCase();
    }
    if (key === 'symbol') {
        return String(holding.symbol || '').toLowerCase();
    }
    if (key === 'pnl_status') {
        return String(holding.pnl_status || '').toLowerCase();
    }
    if (key === 'strategy') {
        return (holding.strategy_allocations || [])
            .map((item) => item.strategy_name || item.strategy_id || '')
            .join(' ')
            .toLowerCase();
    }
    return Number(holding[key] || 0);
}

function sortedHoldings() {
    const rows = holdingsCache.filter((holding) => {
        const pnlStatus = holding.pnl_status
            || (Number(holding.pnl || 0) < 0 ? 'loss' : (Number(holding.pnl || 0) > 0 ? 'profit' : 'flat'));
        const strategyIds = (holding.strategy_allocations || []).map((item) => String(item.strategy_id || ''));
        const matchesStrategy = holdingStrategyFilter === 'all'
            || strategyIds.includes(holdingStrategyFilter)
            || (holdingStrategyFilter === 'unattributed' && strategyIds.length === 0);
        return matchesStrategy && (holdingPnlFilter === 'all' || pnlStatus === holdingPnlFilter);
    });
    rows.sort((a, b) => {
        const av = holdingSortValue(a, holdingsSortKey);
        const bv = holdingSortValue(b, holdingsSortKey);
        if (typeof av === 'string' || typeof bv === 'string') {
            return holdingsSortAsc
                ? String(av).localeCompare(String(bv), 'ko-KR')
                : String(bv).localeCompare(String(av), 'ko-KR');
        }
        return holdingsSortAsc ? av - bv : bv - av;
    });
    return rows;
}

function updateHoldingSortHeaders() {
    const headers = document.querySelectorAll('#table-holdings thead th');
    const headerMap = [
        { key: 'name', title: '종목' },
        { key: 'qty', title: '수량' },
        { key: 'price', title: '현재가' },
        { key: 'value', title: '평가금액' },
        { key: 'hanstock_weight', title: '한스톡 비중' },
        { key: 'rt', title: '수익률' },
        { key: 'pnl', title: '평가손익' },
        { key: 'pnl_status', title: '손익 상태' },
        { key: 'strategy', title: '귀속 전략' },
        { key: '', title: '매도' },
    ];
    headerMap.forEach((item, index) => {
        const th = headers[index];
        if (!th) {
            return;
        }
        th.dataset.sort = item.key;
        th.style.cursor = item.key ? 'pointer' : 'default';
        th.style.userSelect = 'none';
        th.title = item.key ? `${item.title} 기준 정렬` : '';
        const icon = holdingsSortKey === item.key ? (holdingsSortAsc ? ' ▲' : ' ▼') : '';
        th.innerHTML = `${escapeHtml(item.title)}<span class="sort-icon">${icon}</span>`;
    });
}

function holdingPnlStatus(holding) {
    if (holding.pnl_status) {
        return holding.pnl_status;
    }
    const pnl = Number(holding.pnl || 0);
    return pnl < 0 ? 'loss' : (pnl > 0 ? 'profit' : 'flat');
}


function renderHoldingStrategySummary(balance) {
    holdingStrategyFilter = window.HanstockDashboardHoldingStrategySummaryScreen.render(balance, holdingStrategyFilter, {
        setText: (id, value) => setElementText(id, value),
        setTableMessage,
        escapeHtml,
        formatNumber,
        formatCurrency,
        formatPercent,
        pnlStatus: holdingPnlStatus,
        sellAll: (button) => sellAllStrategyAttribution(button),
        labels: { items: '\uac1c', strategy: '\uc804\ub7b5', separator: '\u00b7', unattributed: '\uadc0\uc18d \ubbf8\ud655\uc778', empty: '\uc804\ub7b5\ubcc4 \uadc0\uc18d \uc815\ubcf4\uac00 \uc5c6\uc2b5\ub2c8\ub2e4', loss: '\uc190\uc2e4', profit: '\uc218\uc775', flat: '\ubcf4\ud569', sellAll: '\uc804\ub7c9 \ub9e4\ub3c4', all: '\uc804\uccb4 \uc804\ub7b5', lossTitle: '\uc190\uc2e4 \uc885\ubaa9 \uc6b0\uc120 \ud655\uc778', noLoss: '\ud604\uc7ac \uc190\uc2e4 \ubcf4\uc720\uc885\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4', },
    });
}


function renderHoldingRows() {
    return window.HanstockDashboardHoldingsScreen.render(sortedHoldings(), latestConfig, {
        setTableMessage,
        updateHeaders: updateHoldingSortHeaders,
        pnlStatus: holdingPnlStatus,
        createApproval: (button) => createApprovalFromButton(button),
        sellAttribution: (button) => sellHoldingStrategyAttribution(button),
        escapeHtml,
        formatCurrency,
        formatNumber,
        formatPercent,
        labels: {
            empty: '\ubcf4\uc720 \uc885\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4', loss: '\uc190\uc2e4', profit: '\uc218\uc775', flat: '\ubcf4\ud569', sellable: '\ub9e4\ub3c4\uac00\ub2a5', pending: '\ub9e4\ub3c4 \uc9c4\ud589 \uc911', items: '\uc8fc', exceeded: '\ud55c\ub3c4 \ucd08\uacfc', sell: '\ub9e4\ub3c4', unattributed: '\uadc0\uc18d \ubbf8\ud655\uc778', sellAll: '\uc804\ub7c9',
        },
    });
}

function bindHoldingSortHeaders() {
    document.querySelectorAll('#table-holdings thead th').forEach((th) => {
        if (th.dataset.holdingSortBound === 'true') {
            return;
        }
        th.dataset.holdingSortBound = 'true';
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (!key) {
                return;
            }
            if (holdingsSortKey === key) {
                holdingsSortAsc = !holdingsSortAsc;
            } else {
                holdingsSortKey = key;
                holdingsSortAsc = key === 'name' || key === 'symbol';
            }
            renderHoldingRows();
        });
    });
    updateHoldingSortHeaders();
}

async function renderBalance() {
    try {
        const [balance, perf] = await Promise.all([
            fetchJson('/api/balance', 30000),
            fetchJson('/api/performance').catch(() => ({ realized_pnl: 0 }))
        ]);
        const holdingValue = (balance.holdings || []).reduce((sum, holding) => {
            return sum + Number(holding.value || (Number(holding.qty || 0) * Number(holding.price || 0)));
        }, 0);
        const displayTotal = holdingValue > 0 && Number(balance.total_eval || 0) < Math.max(Number(balance.cash || 0), holdingValue)
            ? Number(balance.cash || 0) + holdingValue
            : Number(balance.total_eval || 0);

        const principal = Number(latestConfig?.account_initial_capital || latestConfig?.total_capital || 0);
        const accountPnl = displayTotal - principal;
        const accountReturnRate = principal > 0 ? (accountPnl / principal) * 100 : 0;
        const evalPnl = Number(balance.pnl || 0);
        const evalCost = Math.max(0, Number(balance.stock_eval || holdingValue || 0) - evalPnl);
        const returnRate = evalCost > 0 ? (evalPnl / evalCost) * 100 : 0;
        const realizedPnl = Number(perf.realized_pnl || 0);

        renderTotalPnlBreakdown({
            principal,
            displayTotal,
            accountPnl,
            realizedPnl,
            evalPnl,
            recordStartedAt: perf.record_started_at || '',
            holdings: balance.holdings || []
        });

        setElementText('val-total', formatCurrency(displayTotal));
        setElementText('val-principal', formatCurrency(principal));
        const accountPnlEl = setElementText('val-account-pnl', formatCurrency(accountPnl));
        if (accountPnlEl) {
            accountPnlEl.className = `value ${accountPnl >= 0 ? 'text-success' : 'text-danger'}`;
        }
        const accountReturnEl = setElementText('val-account-return', formatPercent(accountReturnRate));
        if (accountReturnEl) {
            accountReturnEl.className = `value ${accountReturnRate >= 0 ? 'text-success' : 'text-danger'}`;
        }
        setElementText('val-cash', formatCurrency(balance.cash));
        setElementText('val-realized', formatCurrency(realizedPnl));
        const realizedEl = document.getElementById('val-realized');
        if (realizedEl) {
            realizedEl.className = `value ${realizedPnl >= 0 ? 'text-success' : 'text-danger'}`;
        }
        const returnEl = setElementText('val-return', formatPercent(returnRate));
        if (returnEl) {
            returnEl.className = `value ${returnRate >= 0 ? 'text-success' : 'text-danger'}`;
        }

        const pnlEl = document.getElementById('val-pnl');
        pnlEl.textContent = formatCurrency(evalPnl);
        pnlEl.className = `value ${evalPnl >= 0 ? 'text-success' : 'text-danger'}`;

        const chartLabels = ['현금'];
        const chartData = [balance.cash];
        const chartColors = ['rgba(148, 163, 184, 0.7)'];
        const colors = [
            'rgba(59, 130, 246, 0.7)',
            'rgba(16, 185, 129, 0.7)',
            'rgba(139, 92, 246, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(236, 72, 153, 0.7)',
            'rgba(14, 165, 233, 0.7)'
        ];

        balance.holdings.forEach((holding, idx) => {
            chartLabels.push(holding.name || holding.symbol);
            chartData.push(holding.value || holding.qty * holding.price);
            chartColors.push(colors[idx % colors.length]);
        });
        const hanstockCapital = Number(latestConfig?.total_capital || displayTotal || 0);
        holdingsCache = (balance.holdings || []).map((holding) => ({
            ...holding,
            hanstock_weight: hanstockCapital > 0
                ? Number(holding.value || (Number(holding.qty || 0) * Number(holding.price || 0))) / hanstockCapital
                : 0,
        }));
        renderHoldingAccountSummary(balance, displayTotal, realizedPnl);
        renderHoldingStrategySummary(balance);
        bindHoldingSortHeaders();
        renderHoldingRows();
        window.HanstockDashboardHoldingsScreen.renderBrokerResponse(balance.broker_response, {
            setTableMessage,
            escapeHtml,
            labels: { noRaw: '나무 잔고조회 원본 응답이 없습니다.' },
        });

        renderPortfolioChart(chartLabels, chartData, chartColors);
        renderRisk(balance);
        document.getElementById('last-updated').textContent = `마지막 갱신 ${new Date().toLocaleTimeString('ko-KR')}`;
        if (balance._cache?.stale) {
            setStatus(`나무 계좌 API가 일시 실패해 최근 정상 데이터(${balance._cache.cached_at || '저장됨'})를 표시합니다.`);
        } else {
            setStatus('대시보드 연결 완료. 계좌 정보를 불러왔습니다.', true);
        }
    } catch (err) {
        console.error('Failed to fetch balance data', err);
        setElementText('val-total', '불러오기 실패');
        setElementText('val-principal', '불러오기 실패');
        setElementText('val-account-pnl', '불러오기 실패');
        setElementText('val-account-return', '-');
        setElementText('val-cash', '불러오기 실패');
        setElementText('val-pnl', '불러오기 실패');
        setElementText('val-return', '-');
        setStatus(`계좌 API 오류: ${err.message}`);
        setTableMessage('#table-holdings tbody', 10, err.message);
        setTableMessage('#table-holding-strategies tbody', 7, err.message);
        setTableMessage('#table-holding-broker-response tbody', 4, err.message);
    }
}

function renderTotalPnlBreakdown({ principal, displayTotal, accountPnl, realizedPnl, evalPnl, recordStartedAt, holdings }) {
    const panel = document.getElementById('total-pnl-breakdown');
    const tbody = document.querySelector('#table-total-pnl-breakdown tbody');
    const card = document.getElementById('total-pnl-card');
    const closeButton = document.getElementById('btn-close-total-pnl');
    if (!panel || !tbody || !card) {
        return;
    }

    const otherChange = accountPnl - realizedPnl - evalPnl;
    const rows = [
        ['계좌 전체', '초기자산 대비 총손익', accountPnl, `${formatCurrency(principal)} → ${formatCurrency(displayTotal)}`],
        ['확정 손익', '기록 이후 실현손익', realizedPnl, `${recordStartedAt ? recordStartedAt.slice(0, 10) + '부터 ' : ''}나무 체결기록으로 계산`],
        ['보유 손익', '현재 평가손익', evalPnl, '현재 보유 종목의 증권사 평가손익 합계'],
        ['기준 조정', '기록 시작 이전·미집계 누적손익', otherChange, '과거 매입원가 누락분과 수수료·세금·입출금 포함 가능'],
    ];
    (holdings || []).forEach((holding) => {
        rows.push([
            '보유 종목',
            `${holding.name || holding.symbol || '-'} (${holding.symbol || '-'})`,
            Number(holding.pnl || 0),
            `평가금 ${formatCurrency(holding.value || 0)} · 수익률 ${formatPercent(holding.rt || 0)}`,
        ]);
    });

    tbody.innerHTML = rows.map(([category, item, amount, description]) => {
        const value = Number(amount || 0);
        const valueClass = value > 0 ? 'text-success' : (value < 0 ? 'text-danger' : '');
        return `
            <tr>
                <td>${escapeHtml(category)}</td>
                <td>${escapeHtml(item)}</td>
                <td class="${valueClass}">${value > 0 ? '+' : ''}${formatCurrency(value)}</td>
                <td>${escapeHtml(description)}</td>
            </tr>
        `;
    }).join('');

    const setExpanded = (expanded) => {
        panel.hidden = !expanded;
        card.setAttribute('aria-expanded', String(expanded));
        if (expanded) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };
    if (card.dataset.breakdownBound !== 'true') {
        card.dataset.breakdownBound = 'true';
        card.addEventListener('click', () => setExpanded(panel.hidden));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setExpanded(panel.hidden);
            }
        });
        closeButton?.addEventListener('click', () => setExpanded(false));
    }
}

async function renderOptimizer() {
    return window.HanstockDashboardOptimizerScreen.render({
        setButtonBusy,
        setTableMessage,
        fetchJson,
        escapeHtml,
        formatNumber,
        pill,
        toKorAction,
        bindQueueButtons,
    });
}

async function syncStrategiesToDropdown() {
    try {
        const data = await fetchJson('/api/ai-strategies');
        const select = document.getElementById('select-ai-ranker');
        if (!select) return;

        select.innerHTML = '';
        const strategies = (data.strategies || []).filter(
            (strategy) => strategy.status !== 'retired' && !ISOLATED_STRATEGY_IDS.has(String(strategy.id || ''))
        );
        const uniqueStrategies = [];

        if (strategies.length === 0) {
            const opt = document.createElement('option');
            opt.value = 'rule_only_default';
            opt.textContent = '⚙️ 기본 기술 룰베이스 랭커';
            select.appendChild(opt);
        } else {
            // Group by strategy name to avoid duplicates in the dropdown
            const grouped = {};
            strategies.forEach((strategy) => {
                const name = strategy.name;
                if (!grouped[name]) {
                    grouped[name] = [];
                }
                grouped[name].push(strategy);
            });

            Object.keys(grouped).forEach((name) => {
                const group = grouped[name];
                // Sort to pick the best representative: selected first, then highest version, then alphabetical/id descending
                group.sort((a, b) => {
                    if (a.selected && !b.selected) return -1;
                    if (!a.selected && b.selected) return 1;
                    const aVer = a.strategy_version || 1;
                    const bVer = b.strategy_version || 1;
                    if (aVer !== bVer) return bVer - aVer;
                    return b.id.localeCompare(a.id);
                });
                uniqueStrategies.push(group[0]);
            });

            // Sort uniqueStrategies so selected is first, then name alphabetical
            uniqueStrategies.sort((a, b) => {
                if (a.selected && !b.selected) return -1;
                if (!a.selected && b.selected) return 1;
                return a.name.localeCompare(b.name);
            });

            uniqueStrategies.forEach((strategy) => {
                const opt = document.createElement('option');
                opt.value = strategy.id;
                opt.textContent = `${strategy.selected ? '* ' : ''}${strategy.name} · ${strategyStatusLabel(strategy.status)} · v${strategy.strategy_version || 1}`;
                select.appendChild(opt);
            });
        }

        const active = uniqueStrategies.find((strategy) => strategy.selected);
        if (active) {
            select.value = active.id;
            localStorage.setItem('hanstock_ai_ranker', active.id);
        } else if (strategies.length > 0) {
            const sharedOption = document.createElement('option');
            sharedOption.value = '';
            sharedOption.textContent = '공용 관심종목 (선택된 전략 없음)';
            select.insertBefore(sharedOption, select.firstChild);
            select.value = '';
            localStorage.removeItem('hanstock_ai_ranker');
        } else if (select.options.length > 0) {
            select.value = select.options[0].value;
            localStorage.setItem('hanstock_ai_ranker', select.value);
        }
    } catch (err) {
        console.error('Failed to sync strategies to dropdown:', err);
    }
}

async function renderStrategyContext() {
    return window.HanstockDashboardStrategyContext.render({
        fetchJson,
        withActiveStrategy,
        setCycle: (value) => { activeAnalysisCycle = value; },
        setText: setElementText,
        formatNumber,
        strategyStatusLabel,
    });
}

const STRATEGY_AUDIT_MODULE = window.HanstockDashboardStrategyAudit;
const strategyOperationText = STRATEGY_AUDIT_MODULE.operationText;
const strategyOperationKind = STRATEGY_AUDIT_MODULE.operationKind;
const summarizeCounts = STRATEGY_AUDIT_MODULE.summarizeCounts;
const eventPayloadSummary = STRATEGY_AUDIT_MODULE.eventPayloadSummary;

async function renderStrategyAudit(strategyId) {
    return window.HanstockDashboardStrategyAuditScreen.render(strategyId, {
        getActiveId: () => activeStrategyAuditId,
        setActiveId: (value) => { activeStrategyAuditId = value; },
        getStrategyCatalog: () => aiStrategyCatalog,
        fetchJson,
        setElementText,
        setTableMessage,
        setStatus,
        formatNumber,
        summarizeCounts,
        escapeHtml,
        eventPayloadSummary,
    });
}


async function patchStrategyJson(id, payload) {
    const response = await fetch(`/api/ai-strategies/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `전략 저장 실패: ${response.status}`);
    return data;
}

function strategyProfileValue(strategy, key, fallback = '') {
    const profile = strategy?.profile || {};
    if (Object.prototype.hasOwnProperty.call(profile, key)) return profile[key];
    return fallback;
}

function strategyRiskValue(strategy, key, fallback = '') {
    const risk = strategy?.profile?.risk || {};
    return Object.prototype.hasOwnProperty.call(risk, key) ? risk[key] : fallback;
}

const MARKET_REGIME_EDITOR_OPTIONS = [
    ['bull', '강한 상승장', 100],
    ['bull_pullback', '상승 중 조정', 80],
    ['sideways_low_vol', '안정적인 횡보장', 60],
    ['sideways_high_vol', '변동성 큰 횡보장', 40],
    ['bear_rally', '하락 중 반등', 30],
    ['bear', '하락장', 0],
    ['crash', '급락장', 0],
];

function ensureStrategyRegimeEditor(form) {
    const container = form?.querySelector('#strategy-regime-options');
    if (!container || container.childElementCount) return;
    container.innerHTML = MARKET_REGIME_EDITOR_OPTIONS.map(([key, label, defaultPct]) => `
        <div class="strategy-regime-option">
            <label class="check-field">
                <input type="checkbox" name="regime_enabled_${key}" value="${key}" ${defaultPct === 0 ? 'disabled' : ''}>
                <span><strong>${label}</strong><small>${key}${defaultPct === 0 ? ' · 신규매수 차단' : ''}</small></span>
            </label>
            <label class="strategy-regime-percent">
                <span>최대</span>
                <input type="number" name="regime_max_${key}" min="0" max="${defaultPct}" step="5" value="${defaultPct}">
                <span>%</span>
            </label>
        </div>
    `).join('');
}

function fillStrategyDetail(strategy) {
    const form = document.getElementById('form-edit-ai-strategy');
    if (!form || !strategy) return;
    const profile = structuredClone(strategy.profile || {});
    ensureStrategyRegimeEditor(form);
    const setValue = (name, value) => {
        const field = form.elements.namedItem(name);
        if (field) field.value = value == null ? '' : value;
    };
    setValue('strategy_id', strategy.id);
    setValue('name', strategy.name || strategyDisplayName(strategy));
    setValue('description', strategy.description || '');
    const modelField = form.elements.namedItem('model');
    const strategyModel = strategy.model || 'none';
    if (modelField && !Array.from(modelField.options).some((option) => option.value === strategyModel)) {
        modelField.add(new Option(strategyModel, strategyModel));
    }
    setValue('model', strategyModel);
    setValue('ai_weight', strategyProfileValue(strategy, 'ai_weight', strategy.weight || 0));
    setValue('strategy_type', strategyProfileValue(strategy, 'strategy_type', 'custom'));
    setValue('risk_level', strategyProfileValue(strategy, 'risk_level', 'balanced'));
    setValue('min_rule_score_for_ai', strategyProfileValue(strategy, 'min_rule_score_for_ai', 2));
    setValue('min_ai_confidence', strategyProfileValue(strategy, 'min_ai_confidence', 0.6));
    setValue('max_risk_per_trade_pct', strategyRiskValue(strategy, 'max_risk_per_trade_pct', 0.5));
    setValue('max_total_open_risk_pct', strategyRiskValue(strategy, 'max_total_open_risk_pct', 2));
    setValue('max_strategy_exposure_pct', strategyRiskValue(strategy, 'max_strategy_exposure_pct', 30));
    setValue('min_cash_reserve_pct', strategyRiskValue(strategy, 'min_cash_reserve_pct', 20));
    setValue('max_daily_ai_orders', strategyRiskValue(strategy, 'max_daily_ai_orders', 3));
    const configuredRegimes = strategyProfileValue(strategy, 'market_regime_filter', []) || [];
    const legacyRegimeAliases = {
        neutral: ['sideways_low_vol', 'sideways_high_vol'],
        low_volatility: ['bull', 'bull_pullback', 'sideways_low_vol'],
        high_volatility: ['sideways_high_vol'],
        bullish: ['bull', 'bull_pullback'],
        bearish: ['bear', 'crash'],
        sideways: ['sideways_low_vol', 'sideways_high_vol'],
    };
    const allowedRegimes = new Set(configuredRegimes.flatMap((key) => legacyRegimeAliases[key] || [key]));
    const regimeCaps = strategyProfileValue(strategy, 'market_regime_max_pct', {}) || {};
    MARKET_REGIME_EDITOR_OPTIONS.forEach(([key, _label, defaultPct]) => {
        form.elements.namedItem(`regime_enabled_${key}`).checked = defaultPct > 0 && allowedRegimes.has(key);
        setValue(`regime_max_${key}`, regimeCaps[key] ?? defaultPct);
    });
    setValue('profile_json', JSON.stringify(profile, null, 2));
    form.elements.namedItem('allow_candidate_promotion').checked =
        Boolean(strategyProfileValue(strategy, 'allow_candidate_promotion', false));
    setElementText('ai-strategy-detail-title', strategyDisplayName(strategy));
    setElementText('ai-strategy-detail-help', strategy.description || '전략의 진입 기준과 위험 한도를 수정합니다.');
    setElementText('ai-strategy-detail-version', `v${strategy.strategy_version || 1}`);
}

function bindStrategyDetailForm() {
    const form = document.getElementById('form-edit-ai-strategy');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = form.elements.namedItem('strategy_id').value;
        const submit = form.querySelector('button[type="submit"]');
        setButtonBusy(submit, true);
        try {
            let profile;
            try {
                profile = JSON.parse(form.elements.namedItem('profile_json').value || '{}');
            } catch (_error) {
                throw new Error('전체 세부 프로필 JSON 형식을 확인해 주세요.');
            }
            profile.ai_weight = Number(form.elements.namedItem('ai_weight').value || 0);
            profile.strategy_type = form.elements.namedItem('strategy_type').value;
            profile.risk_level = form.elements.namedItem('risk_level').value;
            profile.min_rule_score_for_ai = Number(form.elements.namedItem('min_rule_score_for_ai').value || 0);
            profile.min_ai_confidence = Number(form.elements.namedItem('min_ai_confidence').value || 0);
            profile.allow_candidate_promotion = form.elements.namedItem('allow_candidate_promotion').checked;
            profile.market_regime_filter = MARKET_REGIME_EDITOR_OPTIONS
                .filter(([key]) => form.elements.namedItem(`regime_enabled_${key}`).checked)
                .map(([key]) => key);
            if (!profile.market_regime_filter.length) {
                throw new Error('신규매수를 허용할 시장 국면을 하나 이상 선택해 주세요.');
            }
            profile.market_regime_max_pct = Object.fromEntries(
                MARKET_REGIME_EDITOR_OPTIONS.map(([key]) => {
                    const value = Number(form.elements.namedItem(`regime_max_${key}`).value);
                    const systemMax = MARKET_REGIME_EDITOR_OPTIONS.find(([item]) => item === key)[2];
                    if (!Number.isFinite(value) || value < 0 || value > systemMax) {
                        throw new Error(`${key} 최대 비율은 0~${systemMax}%로 입력해 주세요.`);
                    }
                    return [key, value];
                })
            );
            profile.risk = profile.risk || {};
            ['max_risk_per_trade_pct', 'max_total_open_risk_pct', 'max_strategy_exposure_pct', 'min_cash_reserve_pct', 'max_daily_ai_orders']
                .forEach((key) => {
                    profile.risk[key] = Number(form.elements.namedItem(key).value || 0);
                });
            if (profile.risk.max_total_open_risk_pct < profile.risk.max_risk_per_trade_pct) {
                profile.risk.max_total_open_risk_pct = profile.risk.max_risk_per_trade_pct;
                form.elements.namedItem('max_total_open_risk_pct').value = profile.risk.max_total_open_risk_pct;
            }
            await patchStrategyJson(id, {
                name: form.elements.namedItem('name').value.trim(),
                description: form.elements.namedItem('description').value.trim(),
                model: form.elements.namedItem('model').value,
                weight: profile.ai_weight,
                profile,
            });
            window.aiStrategyEditorSelectedId = id;
            await Promise.all([renderAiStrategies(), syncStrategiesToDropdown(), renderStrategyContext()]);
            setStatus('전략 상세 기준을 저장했습니다.', true);
        } catch (error) {
            setStatus(`전략 저장 실패: ${error.message}`);
        } finally {
            setButtonBusy(submit, false);
        }
    });
}

function strategyScheduleCategory(strategy) {
    if (strategy.schedule_category) return strategy.schedule_category;
    const profile = strategy.profile || {};
    const value = String(profile.preset || profile.strategy_type || profile.risk_level || '').toLowerCase();
    if (['safe', 'conservative', 'low'].includes(value)) return 'safe';
    if (['aggressive', 'momentum', 'high'].includes(value)) return 'aggressive';
    return 'balanced';
}

function strategyScheduleCategoryLabel(strategy) {
    return strategy.schedule_category_label || {
        safe: '안정형',
        balanced: '균형형',
        aggressive: '공격형',
    }[strategyScheduleCategory(strategy)] || '균형형';
}

function isSharedScheduleSelectable(strategy) {
    return String(strategy.status || '') === 'approved';
}

function updateAiStrategySelectionUi() {
    const draft = aiStrategyDraftSelection || new Set();
    const selectedCount = Array.from(draft).filter((id) =>
        aiStrategyCatalog.some((strategy) => strategy.id === id && isSharedScheduleSelectable(strategy))
    ).length;
    const appliedCount = aiStrategyCatalog.filter((strategy) =>
        strategy.selected && isSharedScheduleSelectable(strategy)
    ).length;
    const summary = document.getElementById('strategy-selection-summary');
    if (summary) {
        summary.textContent = aiStrategySelectionDirty
            ? `${selectedCount}개 선택 · 스케줄 적용 전`
            : `${appliedCount}개 스케줄 적용 중`;
        summary.classList.toggle('is-pending', aiStrategySelectionDirty);
    }
    const applyButton = document.getElementById('btn-apply-selected-strategies');
    if (applyButton) {
        applyButton.textContent = selectedCount
            ? `선택 ${selectedCount}개 스케줄 적용`
            : '선택 전략 모두 해제';
    }
    document.querySelectorAll('.easy-strategy-preset').forEach((button) => {
        const active = button.dataset.preset === aiStrategyCategoryFilter;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function chooseAiStrategyCategory(category) {
    const matching = aiStrategyCatalog.filter((strategy) =>
        isSharedScheduleSelectable(strategy)
        && strategyScheduleCategory(strategy) === category
    );
    if (!matching.length) {
        setStatus(`${{ safe: '안정형', balanced: '균형형', aggressive: '공격형' }[category] || category}으로 분류된 승인 전략이 없습니다.`);
        return false;
    }
    aiStrategyDraftSelection = new Set(matching.map((strategy) => strategy.id));
    aiStrategySelectionDirty = true;
    aiStrategyCategoryFilter = category;
    document.querySelectorAll('.strategy-select-checkbox').forEach((input) => {
        input.checked = aiStrategyDraftSelection.has(input.dataset.id);
    });
    updateAiStrategySelectionUi();
    return true;
}

async function renderAiStrategies() {
    const tbody = document.querySelector('#table-ai-strategies tbody');
    if (!tbody) return;
    try {
        const data = await fetchJson('/api/ai-strategies');
        const strategies = data.strategies || [];
        aiStrategyCatalog = strategies;
        window.aiStrategyEditorStrategies = strategies;
        if (!aiStrategySelectionDirty || !(aiStrategyDraftSelection instanceof Set)) {
            aiStrategyDraftSelection = new Set(
                strategies.filter((strategy) => strategy.selected).map((strategy) => strategy.id)
            );
            aiStrategySelectionDirty = false;
        } else {
            const existingIds = new Set(strategies.map((strategy) => strategy.id));
            aiStrategyDraftSelection = new Set(
                Array.from(aiStrategyDraftSelection).filter((id) => existingIds.has(id))
            );
        }
        const selectedId = window.aiStrategyEditorSelectedId ||
            activeStrategyAuditId ||
            strategies.find((strategy) => strategy.selected)?.id ||
            strategies[0]?.id;
        window.aiStrategyEditorSelectedId = selectedId;

        const head = document.querySelector('#table-ai-strategies thead tr');
        if (head) {
            head.innerHTML = '<th class="strategy-check-column">선택</th><th>전략</th><th>전략 유형</th><th>스케줄 적용</th><th>핵심 기준</th><th class="strategy-manage-column">관리</th>';
        }
        tbody.innerHTML = '';
        if (!strategies.length) {
            setTableMessage('#table-ai-strategies tbody', 6, '등록된 전략이 없습니다.');
            updateAiStrategySelectionUi();
            return;
        }
        HanstockDashboardAiStrategyTable.render(tbody, strategies, selectedId, aiStrategyDraftSelection, {
            escapeHtml, pill, formatNumber, strategyDisplayName, strategyStatusLabel,
            strategyScheduleCategory, strategyScheduleCategoryLabel, isSharedScheduleSelectable,
            select: (strategy, tr) => {
                window.aiStrategyEditorSelectedId = strategy.id;
                tbody.querySelectorAll('tr').forEach((row) => row.classList.toggle('is-selected', row === tr));
                fillStrategyDetail(strategy);
            },
            changeSelection: (input) => {
                if (input.checked) aiStrategyDraftSelection.add(input.dataset.id);
                else aiStrategyDraftSelection.delete(input.dataset.id);
                aiStrategySelectionDirty = true;
                aiStrategyCategoryFilter = '';
                renderAiStrategies();
            },
            openDetail: (strategy) => {
                window.aiStrategyEditorSelectedId = strategy.id;
                tbody.querySelectorAll('tr').forEach((row) => row.classList.toggle('is-selected', row.dataset.id === strategy.id));
                fillStrategyDetail(strategy);
            },
            deleteStrategy: async (strategy, button) => {
                if (!window.confirm(`Delete strategy '${strategyDisplayName(strategy)}'?`)) return;
                setButtonBusy(button, true);
                try {
                    await deleteJson(`/api/ai-strategies/${encodeURIComponent(strategy.id)}`);
                    aiStrategyDraftSelection.delete(strategy.id);
                    if (window.aiStrategyEditorSelectedId === strategy.id) window.aiStrategyEditorSelectedId = '';
                    await Promise.all([renderAiStrategies(), syncStrategiesToDropdown(), renderStrategyContext(), renderScheduleInfo()]);
                    setStatus('Strategy deleted.', true);
                } catch (error) {
                    setStatus(`Strategy delete failed: ${error.message}`);
                    setButtonBusy(button, false);
                }
            },
        });
        const active = strategies.filter((strategy) => strategy.selected && isSharedScheduleSelectable(strategy));
        const usable = strategies.filter(isSharedScheduleSelectable);
        const contextLabels = document.querySelectorAll('#strategy-context-summary > div > span');
        if (contextLabels.length >= 3) {
            contextLabels[0].textContent = '스케줄 적용';
            contextLabels[1].textContent = '적용 가능';
            contextLabels[2].textContent = '선택 안내';
        }
        setElementText('strategy-context-name', `${active.length}개 적용 중`);
        setElementText('strategy-context-detail', active.map(strategyDisplayName).join(', ') || '적용된 전략 없음');
        setElementText('strategy-context-status', `${usable.length}개 승인 전략`);
        setElementText('strategy-context-version', `전체 ${strategies.length}개 전략`);
        setElementText('strategy-context-safety', aiStrategySelectionDirty ? '변경 대기' : '동기화 완료');
        setElementText('strategy-context-approval', '유형 선택 또는 개별 체크 후 적용 버튼을 누르세요');

        const detailStrategy = strategies.find((strategy) => strategy.id === selectedId) || strategies[0];
        if (detailStrategy) fillStrategyDetail(detailStrategy);
        bindStrategyDetailForm();
        updateAiStrategySelectionUi();
    } catch (error) {
        setTableMessage('#table-ai-strategies tbody', 6, error.message);
    }
}

function renderWatchlistSummary(data) {
    watchlistPolicy = window.HanstockDashboardWatchlistSummaryScreen.render({
        formatNumber,
        escapeHtml,
    }, data);
}

function sortWatchlistData() {
    if (!watchlistSortKey) return;
    watchlistCache.sort((a, b) => {
        let valA = a[watchlistSortKey];
        let valB = b[watchlistSortKey];
        
        // 결측치 예외 처리 (정렬 방향 상관없이 가장 아래로 정렬)
        if (valA === null || valA === undefined) return watchlistSortAsc ? 1 : -1;
        if (valB === null || valB === undefined) return watchlistSortAsc ? -1 : 1;
        
        if (typeof valA === 'number' && typeof valB === 'number') {
            return watchlistSortAsc ? valA - valB : valB - valA;
        }
        
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
        if (valA < valB) return watchlistSortAsc ? -1 : 1;
        if (valA > valB) return watchlistSortAsc ? 1 : -1;
        return 0;
    });
}

function drawWatchlist() {
    const tbody = document.querySelector('#table-watchlist tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // 데이터 정렬 수행
    sortWatchlistData();
    
    // 헤더 정렬 아이콘 그리기
    const thead = document.querySelector('#table-watchlist thead');
    if (thead) {
        thead.querySelectorAll('.sort-header').forEach(th => {
            const key = th.getAttribute('data-sort');
            const iconSpan = th.querySelector('.sort-icon');
            if (iconSpan) {
                if (key === watchlistSortKey) {
                    iconSpan.innerHTML = watchlistSortAsc ? '▲' : '▼';
                    iconSpan.style.color = '#34d399'; // 활성 정렬 컬럼은 강조
                } else {
                    iconSpan.innerHTML = '';
                    iconSpan.style.color = '';
                }
            }
        });
    }

    if (!watchlistCache.length) {
        setTableMessage('#table-watchlist tbody', 11, '등록된 관심 종목이 없습니다.');
        return;
    }

    const policyFilter = document.getElementById('select-watchlist-policy-filter')?.value || 'all';
    const sectorFilter = document.getElementById('select-watchlist-sector-filter')?.value || 'all';
    const visibleRows = watchlistCache.filter((row) => (
        (policyFilter === 'all' || row.policy_status === policyFilter)
        && (sectorFilter === 'all' || row.sector === sectorFilter)
    ));
    if (!visibleRows.length) {
        setTableMessage('#table-watchlist tbody', 11, '선택한 조건에 해당하는 관심 종목이 없습니다.');
        return;
    }

    visibleRows.forEach((s) => {
        const tr = document.createElement('tr');
        
        // 1. 현재가 및 등락률 포맷
        let priceHtml = `<span style="color: rgba(255,255,255,0.25); font-size: 0.8rem;">-</span>`;
        if (s.price !== null && s.price !== undefined) {
            let changeHtml = '';
            if (s.change_rate !== null && s.change_rate !== undefined) {
                const rate = Number(s.change_rate);
                if (rate > 0) {
                    changeHtml = `<span style="color: #f87171; font-size: 0.78rem; font-weight: bold; margin-left: 4px;">▲${rate.toFixed(2)}%</span>`;
                } else if (rate < 0) {
                    changeHtml = `<span style="color: #60a5fa; font-size: 0.78rem; font-weight: bold; margin-left: 4px;">▼${Math.abs(rate).toFixed(2)}%</span>`;
                } else {
                    changeHtml = `<span style="color: rgba(255,255,255,0.4); font-size: 0.78rem; margin-left: 4px;">0.00%</span>`;
                }
            }
            priceHtml = `<span style="font-weight: 500; color: #fff;">${formatNumber(s.price)}원</span>${changeHtml}`;
        }
        
        // 2. AI 스코어
        let scoreStr = `-`;
        if (s.score !== null && s.score !== undefined) {
            const score = Number(s.score);
            let badgeStyle = "background: rgba(255,255,255,0.1); color: #ccc;";
            if (score >= 3.0) {
                badgeStyle = "background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: bold; border: 1px solid rgba(16, 185, 129, 0.3);";
            } else if (score >= 2.0) {
                badgeStyle = "background: rgba(59, 130, 246, 0.2); color: #60a5fa; font-weight: bold; border: 1px solid rgba(59, 130, 246, 0.3);";
            } else if (score >= 1.0) {
                badgeStyle = "background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.25);";
            }
            scoreStr = `<span style="padding: 2px 8px; border-radius: 20px; font-size: 0.8rem; ${badgeStyle}">${score.toFixed(1)}점</span>`;
        }
        
        // 3. RSI 보조지표 뱃지화
        let rsiStr = `<span style="color: rgba(255,255,255,0.25); font-size: 0.8rem;">-</span>`;
        if (s.rsi !== null && s.rsi !== undefined) {
            const rsi = Number(s.rsi);
            let rsiBadgeStyle = "background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.1);";
            if (rsi <= 30) {
                rsiBadgeStyle = "background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-weight: bold; border: 1px solid rgba(245, 158, 11, 0.35);";
            } else if (rsi >= 70) {
                rsiBadgeStyle = "background: rgba(239, 68, 68, 0.2); color: #f87171; font-weight: bold; border: 1px solid rgba(239, 68, 68, 0.35);";
            }
            rsiStr = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 0.78rem; ${rsiBadgeStyle}">${rsi.toFixed(1)}</span>`;
        }
        
        // 4. 섹터 뱃지 스타일 지정
        const sectorStr = s.sector ? escapeHtml(s.sector) : "미분류";
        let sectorBadgeStyle = "background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;";
        if (s.sector === "반도체") {
            sectorBadgeStyle = "background: rgba(52, 211, 153, 0.15); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.25); padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;";
        } else if (s.sector && (s.sector.includes("바이오") || s.sector.includes("제약"))) {
            sectorBadgeStyle = "background: rgba(244, 63, 94, 0.15); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.25); padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;";
        } else if (s.sector && s.sector.includes("2차전지")) {
            sectorBadgeStyle = "background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.25); padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;";
        } else if (s.sector && s.sector.includes("자동차")) {
            sectorBadgeStyle = "background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25); padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;";
        } else if (s.sector && (s.sector.includes("금융") || s.sector.includes("은행") || s.sector.includes("증권") || s.sector.includes("생명보험") || s.sector.includes("손해보험") || s.sector.includes("지주") || s.sector.includes("투자"))) {
            sectorBadgeStyle = "background: rgba(167, 139, 250, 0.15); color: #a78bfa; border: 1px solid rgba(167, 139, 250, 0.25); padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;";
        }
        const sectorHtml = `<span style="${sectorBadgeStyle}">${sectorStr}</span>`;

        const policyLabels = {
            eligible: '충족',
            ineligible: '미충족',
            unknown: '가격 미수집',
        };
        const policyStatus = s.policy_status || 'unknown';
        const policyHtml = `
            <span class="watchlist-policy-badge is-${escapeHtml(policyStatus)}"
                title="${escapeHtml(s.policy_reason || '')}">
                ${policyLabels[policyStatus] || '확인 필요'}
            </span>
        `;

        // 5. 대표 조건 / 스코어 사유
        const reasonStr = s.reason ? escapeHtml(s.reason) : "분석 데이터 없음";
        
        // 6. 분석 최종 시각 콤팩트화
        const timeStr = s.updated_at
            ? (s.updated_at.includes(' ') ? s.updated_at.split(' ')[1].substring(0, 5) : s.updated_at)
            : '-';
        
        tr.innerHTML = `
            <td style="text-align: center; color: rgba(255,255,255,0.4);">${s.index}</td>
            <td style="font-weight: 600; color: #fff;">${escapeHtml(s.symbol)}</td>
            <td style="color: rgba(255,255,255,0.8);">${escapeHtml(s.name)}</td>
            <td style="text-align: center;">${sectorHtml}</td>
            <td style="text-align: right;">${priceHtml}</td>
            <td style="text-align: center;">${policyHtml}</td>
            <td style="text-align: center;">${scoreStr}</td>
            <td style="text-align: center;">${rsiStr}</td>
            <td style="color: rgba(255,255,255,0.6); font-size: 0.85rem;" title="${reasonStr}">${reasonStr}</td>
            <td style="text-align: center; color: rgba(255,255,255,0.4); font-size: 0.8rem;">${escapeHtml(timeStr)}</td>
            <td style="text-align: center;">
                <button type="button" class="button-ghost btn-delete-watchlist compact-button"
                    data-symbol="${escapeHtml(s.symbol)}"
                    ${watchlistInherited ? 'disabled title="공용 관심종목을 상속 중입니다."' : ''}
                    style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25); padding: 2px 8px; border-radius: 4px; font-size: 0.78rem; cursor: pointer;">삭제</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    tbody.querySelectorAll('.btn-delete-watchlist').forEach(btn => {
        btn.addEventListener('click', async () => {
            const symbol = btn.getAttribute('data-symbol');
            setButtonBusy(btn, true);
            try {
                const strategyId = getActiveStrategyId();
                const query = strategyId ? `?strategy_id=${encodeURIComponent(strategyId)}` : '';
                await deleteJson(`/api/watchlist/${symbol}${query}`);
                setStatus(`관심 종목(${symbol})이 삭제되었습니다.`, true);
                await renderWatchlist();
            } catch (err) {
                setStatus(`관심 종목 삭제 실패: ${err.message}`);
                setButtonBusy(btn, false);
            }
        });
    });
}

async function renderWatchlist() {
    const autoChk = document.getElementById('chk-watchlist-ai-auto');
    
    // 테이블 헤더에 이벤트 리스너 바인딩 (최초 1회 실행)
    const thead = document.querySelector('#table-watchlist thead');
    if (thead && !thead.dataset.listenerBound) {
        thead.dataset.listenerBound = 'true';
        thead.querySelectorAll('.sort-header').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.getAttribute('data-sort');
                if (watchlistSortKey === key) {
                    watchlistSortAsc = !watchlistSortAsc;
                } else {
                    watchlistSortKey = key;
                    watchlistSortAsc = true;
                }
                drawWatchlist();
            });
        });
    }

    try {
        const strategyId = getActiveStrategyId();
        const query = strategyId ? `?strategy_id=${encodeURIComponent(strategyId)}` : '';
        const data = await fetchJson(`/api/watchlist${query}`);
        watchlistInherited = Boolean(data.inherited);
        watchlistCache = data.symbols || [];
        watchlistCache.forEach((s, idx) => {
            s.index = idx + 1;
        });
        
        if (autoChk) {
            autoChk.checked = data.ai_auto_add;
        }
        const threshInput = document.getElementById('num-watchlist-ai-threshold');
        if (threshInput && data.ai_auto_add_threshold !== undefined) {
            threshInput.value = data.ai_auto_add_threshold;
        }

        renderWatchlistSummary(data);
        drawWatchlist();
    } catch (err) {
        console.error("Failed to render watchlist:", err);
        setStatus(`관심종목 갱신 일시 실패 (기존 데이터 보존됨): ${err.message}`);
    }
}

async function renderSignals() {
    return window.HanstockDashboardSignalsScreen.render({
        captureStrategyRequest,
        setButtonBusy,
        setTableMessage,
        fetchJson,
        getActiveStrategyId,
        commonAnalysisPath,
        isCurrentStrategyRequest,
        captureAnalysisCycle,
        escapeHtml,
        pill,
        formatNumber,
        toKorAction,
        translateReason,
        bindQueueButtons,
    });
}

function strategyAnalysisDeps() {
    return {
        formatNumber,
        formatCurrency,
        reasonLabel: strategyReasonLabel,
        escapeHtml,
        pill,
        manualBuy: strategyManualBuyButton,
    };
}

function strategyAnalysisChecks(row) {
    return window.HanstockDashboardStrategyAnalysis.checks(strategyAnalysisDeps(), row);
}

function strategyAnalysisChecklistMarkup(row) {
    return window.HanstockDashboardStrategyAnalysis.checklistMarkup(strategyAnalysisDeps(), row);
}

function strategyAnalysisEvaluation(row) {
    return window.HanstockDashboardStrategyAnalysis.evaluate(strategyAnalysisDeps(), row);
}

function sortStrategyAnalysisRows(rows, sortKey) {
    return window.HanstockDashboardStrategyAnalysis.sort(strategyAnalysisDeps(), rows, sortKey);
}

function strategyExcludedRowsMarkup(rows) {
    return window.HanstockDashboardStrategyAnalysis.excludedRows(strategyAnalysisDeps(), rows);
}

function strategyManualBuyButton(row, verdict) {
    const symbol = String(row.ticker || row.symbol || '').trim();
    const price = Number(row.limit_price || row.current_price || 0);
    const qty = Math.max(1, Number(row.planned_qty || 1));
    if (!symbol || price <= 0) {
        return '<button type="button" class="button-ghost" disabled>가격 없음</button>';
    }
    return `<button type="button" class="button-ghost strategy-manual-buy"
        data-symbol="${escapeHtml(symbol)}"
        data-name="${escapeHtml(row.name || symbol)}"
        data-price="${price}"
        data-qty="${qty}"
        data-strategy-id="${escapeHtml(row.strategy_id || '')}"
        data-strategy-version="${Number(row.strategy_version || 0)}"
        data-profile-hash="${escapeHtml(row.profile_hash || '')}"
        data-verdict="${escapeHtml(verdict || 'unknown')}"
        data-reason="${escapeHtml((row.reasons || []).map(strategyReasonLabel).join(' · '))}">수동매수</button>`;
}

async function createStrategyLookupManualBuy(button) {
    const symbol = button.dataset.symbol || '';
    const name = button.dataset.name || symbol;
    const defaultQty = Math.max(1, Number(button.dataset.qty || 1));
    const defaultPrice = Math.max(1, Number(button.dataset.price || 0));
    const qtyText = window.prompt(`${name}(${symbol}) 수동 매수 수량`, String(defaultQty));
    if (qtyText === null) return;
    const priceText = window.prompt(`${name}(${symbol}) 지정가`, String(defaultPrice));
    if (priceText === null) return;
    const qty = Number(qtyText);
    const price = Number(priceText);
    if (!Number.isInteger(qty) || qty <= 0 || !Number.isInteger(price) || price <= 0) {
        setStatus('수량과 지정가는 1 이상의 정수로 입력해야 합니다.');
        return;
    }
    const verdict = button.dataset.verdict || 'unknown';
    if (!window.confirm(
        `${name}(${symbol}) ${qty.toLocaleString()}주를 ${formatCurrency(price)} 지정가로 승인 대기에 등록할까요?\n\n` +
        `분석 판정: ${verdict}\n판정이 제외여도 사용자가 직접 요청한 수동 매수로 기록됩니다.`
    )) return;

    button.disabled = true;
    try {
        const result = await postJson('/api/strategy-lookup/manual-buy', {
            symbol,
            name,
            qty,
            price,
            strategy_id: button.dataset.strategyId || 'manual_strategy',
            strategy_version: Number(button.dataset.strategyVersion || 0) || null,
            profile_hash: button.dataset.profileHash || '',
            analysis_verdict: verdict,
            reason: button.dataset.reason || '',
            manual_override_acknowledged: true,
        });
        setStatus(`${name} 수동 매수 ${qty.toLocaleString()}주를 승인 대기에 등록했습니다.`, true);
        showOrdersTab();
        await renderApprovals();
        return result;
    } catch (error) {
        setStatus(`수동 매수 등록 실패: ${error.message}`);
        button.disabled = false;
    }
}

function renderStrategyPreviewCards(results, strategies = []) {
    return window.HanstockDashboardStrategyPreviewScreen.render({
        setCache: (nextResults, nextCatalog) => {
            strategyPreviewResultsCache = nextResults;
            strategyPreviewCatalogCache = nextCatalog;
        },
        getCache: () => strategyPreviewResultsCache,
        getCatalog: () => strategies || strategyPreviewCatalogCache || [],
        displayName: strategyDisplayName,
        evaluation: strategyAnalysisEvaluation,
        sortRows: sortStrategyAnalysisRows,
        excludedRows: strategyExcludedRowsMarkup,
        escapeHtml,
        formatNumber,
        formatCurrency,
        pill,
        reasonLabel: strategyReasonLabel,
        manualBuy: strategyManualBuyButton,
        bindManualBuy: (container) => container.querySelectorAll('.strategy-manual-buy').forEach((button) => button.addEventListener('click', () => createStrategyLookupManualBuy(button))),
        getSortKey: (id) => strategyAnalysisSortState.get(id) || 'score_desc',
        setSortKey: (id, value) => strategyAnalysisSortState.set(id, value),
    }, results, strategies);
}

const strategyLookupRunTime = STRATEGY_AUDIT_MODULE.runTime;

async function openStrategyLookupRun(runId) {
    const envelope = await fetchJson(`/api/strategy-lookup/runs/${encodeURIComponent(runId)}`, 30000);
    const results = (envelope.results || []).map((item) => ({
        strategyId: item.strategy_id,
        data: item.data || {},
    }));
    renderStrategyPreviewCards(results, aiStrategyCatalog);
    setStatus(`분석 이력 ${strategyLookupRunTime(envelope.results?.[0]?.captured_at)}을 표시합니다.`, true);
}

async function renderStrategyLookupHistory() {
    return window.HanstockDashboardStrategyLookupHistory.render({
        fetchJson,
        escapeHtml,
        runTime: strategyLookupRunTime,
        openRun: openStrategyLookupRun,
    });
}

async function renderCachedStrategyPreviews(strategyIds, strategies = [], options = {}) {
    return window.HanstockDashboardStrategyPreviewCache.renderCached({
        fetchJson,
        renderCards: renderStrategyPreviewCards,
    }, strategyIds, strategies, options);
}

function finishStrategyPreviewUpdatingState() {
    return window.HanstockDashboardStrategyPreviewCache.finishUpdating();
}

async function renderCandidates(options = {}) {
    const request = captureStrategyRequest();
    setButtonBusy('btn-candidates', true);
    setTableMessage('#table-candidates tbody', 9, '관심종목에서 매수 후보를 찾고 있습니다...');
    try {
        const optimizer = document.getElementById('select-portfolio-optimizer')?.value || 'score_tilted_inverse_vol';
        let data;
        const previewStrategyIds = Array.isArray(options.strategyIds)
            ? options.strategyIds.filter(Boolean)
            : [];
        if (previewStrategyIds.length) {
            const results = await Promise.all(previewStrategyIds.map(async (strategyId) => {
                try {
                    const params = new URLSearchParams({
                        strategy_id: strategyId,
                        min_score: '2',
                        optimizer,
                        refresh: String(Boolean(options.refresh)),
                    });
                    const response = await fetchJson(`/api/candidates?${params.toString()}`, 90000);
                    return {
                        strategyId,
                        data: {
                            ...response,
                            candidates: (response.candidates || []).map((candidate) => ({
                                ...candidate,
                                strategy_id: candidate.strategy_id || strategyId,
                            })),
                        },
                    };
                } catch (error) {
                    return { strategyId, data: { candidates: [], scanned: 0 }, error: error.message };
                }
            }));
            renderStrategyPreviewCards(results, options.strategies || []);
            const responses = results.map((result) => result.data);
            data = {
                candidates: responses.flatMap((response) => response.candidates || []),
                scanned: responses.reduce((sum, response) => sum + Number(response.scanned || 0), 0),
                min_score: 2,
                scan_error: results.map((result) => result.error || result.data.scan_error).filter(Boolean).join(' · ') || null,
                preview_strategy_ids: previewStrategyIds,
            };
        } else {
            const previewContainer = document.getElementById('strategy-preview-results');
            const legacyTable = document.querySelector('.panel-candidates .candidate-legacy-table');
            if (previewContainer) {
                previewContainer.hidden = true;
                previewContainer.innerHTML = '';
            }
            if (legacyTable) legacyTable.hidden = false;
            const query = await commonAnalysisPath('/api/candidates', {
                min_score: 2,
                ranker: getActiveStrategyId() ? '' : 'rule_only',
                optimizer,
                refresh: Boolean(options.refresh),
            });
            data = await fetchJson(query, 90000);
        }
        if (!isCurrentStrategyRequest(request)) return;
        captureAnalysisCycle(data);
        const tbody = document.querySelector('#table-candidates tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!data.candidates.length) {
            const scanned = data.scanned || 0;
            const scanError = data.scan_error || null;
            const tableMsg = scanned === 0
                ? (scanError ? `데이터 수신 실패 — 잠시 후 다시 시도해 주세요` : '분석 대상 종목이 없습니다')
                : `조건을 만족한 후보가 없습니다 — ${scanned}종목 분석 완료`;
            setTableMessage('#table-candidates tbody', 9, tableMsg);
            // 분석 근거 팝업
            const titleEl = document.getElementById('noCandidatesTitle');
            const subtitleEl = document.getElementById('noCandidatesSubtitle');
            const bodyEl = document.getElementById('noCandidatesBody');
            if (scanned === 0 && scanError) {
                if (titleEl) titleEl.textContent = '⚠️ 데이터 수신 실패';
                if (subtitleEl) subtitleEl.textContent = '시세 데이터를 가져오지 못해 분석을 진행할 수 없었습니다.';
                if (bodyEl) bodyEl.innerHTML = buildScanErrorModalMarkup(scanError);
            } else {
                if (titleEl) titleEl.textContent = '📊 매수 후보 없음 — 분석 결과';
                if (subtitleEl) subtitleEl.textContent =
                    `${scanned}종목을 분석했으나 기준 점수(${data.min_score || 2}점) 이상인 종목이 없습니다.`;
                if (bodyEl) bodyEl.innerHTML = buildNoCandidatesModalMarkup(data);
            }
            // 전략조회 탭은 전략별 결과 카드에 같은 내용을 표시하므로
            // 완료 시 공용 "매수 후보 없음" 팝업을 중복으로 띄우지 않는다.
            if (!previewStrategyIds.length) setNoCandidatesModalOpen(true);
            if (data._cache?.cached_at) {
                setStatus(`최근 후보 검색 결과를 표시합니다. 기준 시각 ${data._cache.cached_at}`, true);
            } else {
                setStatus('분석 완료 — 매수 기준을 충족하는 종목이 없습니다.', true);
            }
            return;
        }

        const displayedCandidates = data.candidates.slice(0, 10);
        displayedCandidates.forEach((row) => {
            const stockName = row.name && row.name !== row.ticker ? row.name : '';
            const queueButton = Number(row.planned_qty || 0) > 0
                ? `<button type="button" class="button-ghost queue-order"
                    data-symbol="${escapeHtml(row.ticker)}"
                    data-name="${escapeHtml(row.name || row.ticker)}"
                    data-action="buy"
                    data-qty="${Number(row.planned_qty || 0)}"
                    data-price="${Number(row.limit_price || row.current_price || 0)}"
                    data-reason="${escapeHtml((row.reasons || []).join(', '))}"
                    data-source="candidate">승인대기</button>`
                : `<button type="button" class="button-ghost" disabled title="잔고 부족 또는 최대 보유 종목 수(MAX_POSITIONS) 초과로 매수할 수 없습니다." style="opacity:0.5; cursor:not-allowed;">승인불가</button>`;

            // 상세 근거 빌드
            const reasonLines = (row.reasons || []).map(r => strategyReasonLabel(r));
            const detailParts = [];
            if (row.rsi != null) detailParts.push(`RSI ${formatNumber(row.rsi,1)}`);
            if (row.rsi2 != null) detailParts.push(`RSI2 ${formatNumber(row.rsi2,1)}`);
            if (row.macd_hist != null) detailParts.push(`MACD ${formatNumber(row.macd_hist,2)}`);
            if (row.sma20 != null && row.sma60 != null) {
                const trend = row.sma20 > row.sma60 ? '단기↑중기선 위' : '단기↓중기선 아래';
                detailParts.push(trend);
            }
            if (row.bb_lo != null && row.current_price != null) {
                const bbDist = ((row.current_price - row.bb_lo) / row.bb_lo * 100).toFixed(1);
                detailParts.push(`볼밴하단+${bbDist}%`);
            }
            const detailSuffix = detailParts.length ? ` (${detailParts.join(' | ')})` : '';
            const reasonText = reasonLines.join(' · ') + detailSuffix;

            const promotedBadge = row.promoted_by_ai 
                ? `<span class="badge-purple" style="background-color: #8b5cf6; color: white; padding: 1px 5px; border-radius: 3px; font-size: 0.72rem; font-weight: 600; display: inline-block; vertical-align: middle; margin-left: 4px; box-shadow: 0 0 4px rgba(139, 92, 246, 0.4);">AI 승격</span>`
                : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="symbol-name">${escapeHtml(stockName || row.ticker)}${promotedBadge}</span>
                    <span class="symbol-code">${stockName ? row.ticker : ''}</span>
                </td>
                <td>${pill(formatNumber(row.score, 2), row.score >= 3 ? 'buy' : 'warn')}</td>
                <td>${buildCandidateStrategyMarkup(row)}</td>
                <td>${formatNumber(row.rsi, 1)} / ${formatNumber(row.rsi2, 1)}</td>
                <td>${formatNumber(row.macd_hist, 2)}</td>
                <td>${formatCurrency(row.current_price)}</td>
                <td>${Number(row.planned_qty || 0).toLocaleString()}</td>
                <td>${formatCurrency(row.estimated_cost)}</td>
                <td>
                    <div class="reason-detail">${escapeHtml(reasonText)}</div>
                    ${queueButton}
                </td>
            `;
            const rowQueueButton = tr.querySelector('.queue-order');
            if (rowQueueButton) {
                rowQueueButton.dataset.strategyId = row.strategy_id || '';
                rowQueueButton.dataset.strategyVersion = row.strategy_version || '';
                rowQueueButton.dataset.profileHash = row.profile_hash || '';
                rowQueueButton.dataset.sourceCandidateId = row.id || '';
            }
            tbody.appendChild(tr);
        });
        bindQueueButtons();
        await renderCandidateHistory();
        if (data._cache?.cached_at) {
            setStatus(`최근 후보 검색 결과를 표시합니다. 기준 시각 ${data._cache.cached_at}`, true);
        } else {
            setStatus('매수 후보 검색을 완료했습니다.', true);
        }
    } catch (err) {
        setTableMessage('#table-candidates tbody', 9, err.message);
    } finally {
        setButtonBusy('btn-candidates', false);
    }
}

function waitForStrategyPreviewCompletion(runId, timeoutMs = 600000) {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
        const timer = setInterval(async () => {
            try {
                if (Date.now() - startedAt > timeoutMs) {
                    clearInterval(timer);
                    reject(new Error('전략 조회 시간이 초과되었습니다. 이전 결과를 표시합니다.'));
                    return;
                }
                const status = await fetchJson(
                    `/api/scheduler/status?run_id=${encodeURIComponent(runId)}`,
                    30000,
                );
                const runState = status.run_state || {};
                if (!status.requested_run_matches) {
                    clearInterval(timer);
                    reject(new Error('조회 작업 상태가 변경되었습니다. 이전 결과를 표시합니다.'));
                    return;
                }
                if (!runState.is_running) {
                    clearInterval(timer);
                    if (runState.error) reject(new Error(runState.error));
                    else resolve(runState);
                    return;
                }
                if (Date.now() - startedAt > timeoutMs) {
                    clearInterval(timer);
                    reject(new Error('전략 조회 시간이 초과되었습니다.'));
                }
            } catch (error) {
                clearInterval(timer);
                reject(error);
            }
        }, 3000);
    });
}

async function previewSelectedStrategies() {
    const button = document.getElementById('btn-candidates');
    let selected = [];
    let strategyIds = [];
    setButtonBusy(button, true);
    setTableMessage('#table-candidates tbody', 9, '선택된 전략을 주문 없이 분석하고 있습니다...');
    try {
        const envelope = await fetchJson('/api/ai-strategies', 30000);
        selected = (envelope.strategies || []).filter((strategy) =>
            strategy.selected && strategy.status === 'approved');
        strategyIds = selected.map((strategy) => String(strategy.id));
        if (!strategyIds.length) throw new Error('AI 전략 탭에서 조회할 전략을 먼저 선택해 주세요.');
        const selection = document.getElementById('strategy-preview-selection');
        if (selection) {
            selection.innerHTML = `<strong>조회 전략 ${strategyIds.length}개</strong><span>${
                selected.map((strategy) => escapeHtml(strategyDisplayName(strategy))).join(' · ')
            }</span><small>분석 전용 · 주문/승인 생성 없음</small>`;
        }
        await renderCachedStrategyPreviews(strategyIds, selected);
        const started = await postJson('/api/scheduler/run', {
            mode: 'analysis_only',
            include_ai_rebalance: false,
            auto_approve: false,
            strategy_ids: strategyIds,
            allowed_categories: ['candidate'],
        });
        await renderStrategyLookupHistory();
        setStatus(`선택 전략 ${strategyIds.length}개를 분석 전용으로 실행 중입니다. 주문은 생성되지 않습니다.`, true);
        await waitForStrategyPreviewCompletion(started.run_id);
        await renderCandidates({ strategyIds, strategies: selected });
        await renderStrategyLookupHistory();
        setStatus(`전략 조회 완료 · ${strategyIds.length}개 전략 · 주문 없음`, true);
    } catch (error) {
        setTableMessage('#table-candidates tbody', 9, error.message);
        setStatus(`전략 조회 실패: ${error.message}`);
    } finally {
        if (strategyIds.length) {
            await renderCachedStrategyPreviews(strategyIds, selected, { updating: false });
        }
        finishStrategyPreviewUpdatingState();
        setButtonBusy(button, false);
    }
}

async function refreshStrategyLookup() {
    const button = document.getElementById('btn-refresh-strategy-lookup');
    let selected = [];
    let strategyIds = [];
    setButtonBusy(button, true);
    if (button) button.textContent = '새로고침 중...';
    try {
        const envelope = await fetchJson('/api/ai-strategies', 30000);
        selected = (envelope.strategies || []).filter((strategy) =>
            strategy.selected && strategy.status === 'approved');
        strategyIds = selected.map((strategy) => String(strategy.id));
        if (!strategyIds.length) throw new Error('AI 전략 탭에서 조회할 전략을 먼저 선택해 주세요.');

        await renderCachedStrategyPreviews(strategyIds, selected);
        const started = await postJson('/api/scheduler/run', {
            mode: 'analysis_only',
            include_ai_rebalance: false,
            auto_approve: false,
            strategy_ids: strategyIds,
            allowed_categories: ['candidate'],
        });
        await renderStrategyLookupHistory();
        setStatus(`선택 전략 ${strategyIds.length}개를 백그라운드에서 새로고침하고 있습니다. 최대 10분까지 기다립니다.`, true);
        await waitForStrategyPreviewCompletion(started.run_id);
        await renderCandidates({ strategyIds, strategies: selected });
        await renderStrategyLookupHistory();
        setStatus(`전략 새로고침 완료 · ${strategyIds.length}개 전략 · DB 최신본 저장`, true);
    } catch (error) {
        setStatus(`전략 새로고침 실패: ${error.message}`);
    } finally {
        if (strategyIds.length) {
            await renderCachedStrategyPreviews(strategyIds, selected, { updating: false });
        }
        if (button) button.textContent = '새로고침';
        finishStrategyPreviewUpdatingState();
        setButtonBusy(button, false);
    }
}

async function renderStrategyLookupTab() {
    const envelope = await fetchJson('/api/ai-strategies', 30000);
    const selected = (envelope.strategies || []).filter((strategy) =>
        strategy.selected && strategy.status === 'approved');
    const strategyIds = selected.map((strategy) => String(strategy.id));
    const selection = document.getElementById('strategy-preview-selection');
    if (selection) {
        selection.innerHTML = strategyIds.length
            ? `<strong>조회 전략 ${strategyIds.length}개</strong><span>${
                selected.map((strategy) => escapeHtml(strategyDisplayName(strategy))).join(' · ')
            }</span><small>저장된 최신 분석 결과 · 새 분석은 선택 전략 조회 버튼으로 실행</small>`
            : '<strong>조회 대기</strong><span>AI 전략 탭에서 사용할 전략을 선택하세요.</span>';
    }
    await renderStrategyLookupHistory();
    if (!strategyIds.length) {
        renderStrategyPreviewCards([], selected);
        return;
    }
    await renderCachedStrategyPreviews(strategyIds, selected, { updating: false });
    finishStrategyPreviewUpdatingState();
    setButtonBusy('btn-candidates', false);
}

function configureStrategyLookupTab() {
    const strategyTab = document.getElementById('dashboard-tab-strategy');
    const aiTab = document.getElementById('dashboard-tab-ai');
    const signals = document.querySelector('.panel-signals');
    if (aiTab && signals) aiTab.insertBefore(signals, aiTab.firstChild);

    strategyTab?.querySelector('.panel-candidates-history')?.remove();
    strategyTab?.querySelector('.panel-execution-plan')?.remove();

    const candidatePanel = strategyTab?.querySelector('.panel-candidates');
    if (candidatePanel) {
        const title = candidatePanel.querySelector('.panel-header h2');
        const help = candidatePanel.querySelector('.panel-header .section-help');
        const button = document.getElementById('btn-candidates');
        if (title) title.textContent = '전략매수후보';
        if (help) help.textContent = 'AI 전략 탭에서 선택한 전략을 스케줄 실행 전에 분석 전용으로 조회합니다. 주문은 생성되지 않습니다.';
        if (button) button.textContent = '선택 전략 조회';
        candidatePanel.querySelector('.ai-strategy-control-bar')?.remove();
        candidatePanel.querySelector('#ai-strategy-summary')?.remove();
        if (!candidatePanel.querySelector('#strategy-preview-results')) {
            const results = document.createElement('div');
            results.id = 'strategy-preview-results';
            results.className = 'strategy-preview-results';
            results.hidden = true;
            const table = candidatePanel.querySelector('.table-responsive');
            table?.classList.add('candidate-legacy-table');
            candidatePanel.insertBefore(results, table);
        }
        if (!candidatePanel.querySelector('#strategy-lookup-history')) {
            const history = document.createElement('section');
            history.id = 'strategy-lookup-history';
            history.className = 'strategy-lookup-history';
            history.innerHTML = '<p class="section-help">분석 실행 목록을 불러오는 중입니다...</p>';
            candidatePanel.querySelector('#strategy-preview-results')?.before(history);
        }
        candidatePanel.querySelector('#ai-flow-list')?.remove();
        const table = candidatePanel.querySelector('.table-responsive');
        if (table && !document.getElementById('strategy-preview-selection')) {
            const selection = document.createElement('div');
            selection.id = 'strategy-preview-selection';
            selection.className = 'strategy-preview-selection';
            selection.innerHTML = '<strong>조회 대기</strong><span>AI 전략 탭에서 사용할 전략을 선택하세요.</span><small>스케줄과 동일한 후보 분석을 주문 없이 실행합니다.</small>';
            table.before(selection);
        }
    }

    if (signals) {
        const title = signals.querySelector('.panel-header h2');
        const help = signals.querySelector('.panel-header .section-help');
        if (title) title.textContent = '보유종목 매매신호';
        if (help) help.textContent = '보유종목의 기술 신호와 선택 전략 판단을 AI 최적화 결과와 함께 확인합니다.';
    }
}

const MARKET_REGIME_MODULE = window.HanstockDashboardMarketRegime;
const MARKET_REGIME_LABELS = MARKET_REGIME_MODULE.labels;
const MARKET_REGIME_GUIDE = MARKET_REGIME_MODULE.guide;
const MARKET_REASON_LABELS = MARKET_REGIME_MODULE.reasonLabels;
const MARKET_POLICY_REASON_LABELS = MARKET_REGIME_MODULE.policyReasonLabels;
const marketPolicyReasonLabel = MARKET_REGIME_MODULE.marketPolicyReasonLabel;
const marketRegimeLabel = MARKET_REGIME_MODULE.marketRegimeLabel;
const marketRegimePercent = MARKET_REGIME_MODULE.marketRegimePercent;
const marketRegimeDate = (value) => MARKET_REGIME_MODULE.marketRegimeDate(value, escapeHtml);

function marketRegimeIndexRows(indices = {}) {
    const kospi = indices.kospi || indices.KOSPI || {};
    const kosdaq = indices.kosdaq || indices.KOSDAQ || {};
    const rows = [
        ['현재 지수', 'close', (v) => formatNumber(v, 2)],
        ['20일 평균선 (단기)', 'sma20', (v) => formatNumber(v, 2)], ['60일 평균선 (중기)', 'sma60', (v) => formatNumber(v, 2)],
        ['200일 평균선 (장기)', 'sma200', (v) => formatNumber(v, 2)], ['최근 5일 등락', 'return_5d', marketRegimePercent],
        ['최근 20일 등락', 'return_20d', marketRegimePercent], ['20일 고점 대비 낙폭', 'drawdown_20d', marketRegimePercent],
        ['평소 대비 변동성 (1.0=평소)', 'volatility_ratio', (v) => formatNumber(v, 2)], ['확보한 거래일', 'observations', formatNumber],
        ['데이터 기준일', 'session_date', (v) => v || '-'],
    ];
    return rows.map(([label, key, formatter]) => `<tr><th>${label}</th><td>${escapeHtml(formatter(kospi[key]))}</td><td>${escapeHtml(formatter(kosdaq[key]))}</td></tr>`).join('');
}

function renderMarketRegimeList(id, items, emptyText) {
    const element = document.getElementById(id);
    if (!element) return;
    const list = Array.isArray(items) ? items : [];
    element.innerHTML = list.length
        ? list.map((item) => {
            const raw = typeof item === 'string' ? item : item.message || item.reason || JSON.stringify(item);
            const parts = String(raw).split(':');
            const translated = MARKET_REASON_LABELS[parts.at(-1)] || MARKET_REASON_LABELS[raw] || raw;
            const prefix = parts.length > 1 && /^\d+$/.test(parts[0]) ? `${parts[0] === '0001' ? 'KOSPI' : parts[0] === '1001' ? 'KOSDAQ' : parts[0]}: ` : '';
            return `<li>${escapeHtml(prefix + translated)}</li>`;
        }).join('')
        : `<li class="muted">${escapeHtml(emptyText)}</li>`;
}

function renderMarketRegimeCurrent(envelope) {
    const data = envelope.current || envelope.snapshot || envelope;
    const quality = String(data.quality || 'unknown').toLowerCase();
    const regimeKey = String(data.regime || 'unknown').toLowerCase();
    const guide = MARKET_REGIME_GUIDE[regimeKey] || MARKET_REGIME_GUIDE.unknown;
    const summary = document.getElementById('market-regime-summary');
    if (summary) summary.dataset.quality = quality;
    const values = {
        'market-regime-value': marketRegimeLabel(data.regime),
        'market-regime-quality': ({ good: '좋음', degraded: '일부 누락', insufficient: '판단 불가' })[quality] || quality,
        'market-regime-confidence': marketRegimePercent(data.confidence, 0),
        'market-regime-session-date': data.session_date || '-',
        'market-regime-evaluated-at': marketRegimeDate(data.evaluated_at),
        'market-regime-risk-gate': data.new_risk_allowed === true ? '예, 조건부 가능' : data.new_risk_allowed === false ? '아니요, 현재 차단' : '-',
        'market-regime-risk-multiplier': data.risk_multiplier == null ? '-' : `평소의 ${marketRegimePercent(data.risk_multiplier, 0)}`,
        'market-regime-source': data.source || (data.sources || []).map((source) => source.name || source.source || source).join(', ') || '-',
    };
    Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
    const icon = document.getElementById('market-regime-icon');
    const summaryText = document.getElementById('market-regime-summary-text');
    const action = document.getElementById('market-regime-action');
    const actionNote = document.getElementById('market-regime-action-note');
    const qualityNote = document.getElementById('market-regime-quality-note');
    if (icon) icon.textContent = guide[0];
    if (summaryText) summaryText.textContent = guide[1];
    if (action) action.textContent = guide[2];
    if (actionNote) actionNote.textContent = data.new_risk_allowed === false ? '자동 전략도 신규 위험을 만들지 않습니다.' : `시스템 적용 배율: ${marketRegimePercent(data.risk_multiplier, 0)}`;
    if (qualityNote) qualityNote.textContent = ({ good: '필수 데이터가 모두 정상입니다.', degraded: '일부 표본이 빠져 투자 규모를 자동으로 줄입니다.', insufficient: '신규 매수를 자동 차단합니다.' })[quality] || '상태를 확인 중입니다.';
    const tbody = document.querySelector('#table-market-regime-indices tbody');
    if (tbody) tbody.innerHTML = marketRegimeIndexRows(data.indices);
    const breadth = data.breadth || {};
    const advance = Number(breadth.advance_ratio);
    const valid = Number(breadth.valid_count);
    const sample = Number(breadth.sample_size);
    const breadthSentence = document.getElementById('market-regime-breadth-sentence');
    if (breadthSentence) {
        const direction = !Number.isFinite(advance) ? '상승·하락 비율을 확인할 수 없습니다.' : advance >= .6 ? '상승 종목이 많아 시장 전반의 분위기가 강합니다.' : advance <= .4 ? '하락 종목이 많아 시장 전반의 분위기가 약합니다.' : '상승 종목과 하락 종목이 비슷해 방향이 뚜렷하지 않습니다.';
        const coverage = Number.isFinite(valid) && Number.isFinite(sample) ? ` 전체 ${sample}종목 중 ${valid}종목을 반영했습니다.` : '';
        breadthSentence.textContent = direction + coverage;
    }
    const breadthMetrics = [
        ['데이터 반영 종목', `${breadth.valid_count ?? '-'} / ${breadth.sample_size ?? '-'}종목`],
        ['오늘 상승한 종목 비율', marketRegimePercent(breadth.advance_ratio)],
        ['20일 평균보다 높은 종목', marketRegimePercent(breadth.above_sma20_ratio)],
        ['60일 평균보다 높은 종목', marketRegimePercent(breadth.above_sma60_ratio)],
    ];
    const breadthEl = document.getElementById('market-regime-breadth');
    if (breadthEl) breadthEl.innerHTML = breadthMetrics.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value ?? '-')}</strong></div>`).join('');
    renderMarketRegimeList('market-regime-failures', breadth.failures || data.failed_symbols, '실패 종목이 없습니다.');
    renderMarketRegimeList('market-regime-reasons', data.reasons, '저장된 판정 근거가 없습니다.');
    renderMarketRegimeList('market-regime-warnings', data.warnings, '경고가 없습니다.');
}

function renderMarketRegimeDiagnostics(envelope) {
    const data = envelope.diagnostics || envelope;
    const raw = data.checklist || data.checks || [];
    const checks = Array.isArray(raw) ? raw : Object.entries(raw).map(([name, value]) => ({ name, ok: typeof value === 'object' ? value.ok : Boolean(value), ...(typeof value === 'object' ? value : {}) }));
    const element = document.getElementById('market-regime-checklist');
    if (!element) return;
    const checkLabels = { quality: '시장 데이터 품질', index_history: '지수 200일 이상 확보', breadth_coverage: '시장 표본 60종목 확보', new_risk_gate: '신규 매수 안전장치' };
    element.innerHTML = checks.length ? checks.map((check) => {
        const ok = check.ok ?? check.passed ?? check.status === 'ok';
        const name = check.label || check.name || check.key || '점검 항목';
        const detail = typeof check.detail === 'object' ? Object.entries(check.detail).map(([key, value]) => `${key.toUpperCase()} ${value}일`).join(' · ') : check.message || check.detail;
        return `<div class="market-regime-check ${ok ? 'ok' : 'fail'}"><span aria-hidden="true">${ok ? '✓' : '!'}</span><div><strong>${escapeHtml(checkLabels[name] || name)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div></div>`;
    }).join('') : '<p class="section-help">점검 결과가 없습니다.</p>';
}

function renderMarketRegimeHistory(envelope) {
    const rows = envelope.history || envelope.items || [];
    const tbody = document.querySelector('#table-market-regime-history tbody');
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((row) => `<tr>
        <td>${escapeHtml(row.session_date || '-')}</td><td>${escapeHtml(marketRegimeLabel(row.regime))}</td>
        <td>${escapeHtml(row.quality || '-')}</td><td>${escapeHtml(marketRegimePercent(row.confidence, 0))}</td>
        <td>${escapeHtml(marketRegimePercent(row.risk_multiplier, 0))}</td><td>${escapeHtml(row.source || '-')}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="table-message">저장된 국면 이력이 없습니다.</td></tr>';
}

async function loadMarketRegimeDashboard() {
    const status = document.getElementById('market-regime-refresh-status');
    const error = document.getElementById('market-regime-error');
    if (status) status.textContent = '저장된 결과 불러오는 중...';
    if (error) error.hidden = true;
    try {
        const [current, history, diagnostics] = await Promise.all([
            fetchJson('/api/market-regime/current', 30000),
            fetchJson('/api/market-regime/history?days=30', 30000),
            fetchJson('/api/market-regime/diagnostics', 30000),
        ]);
        renderMarketRegimeCurrent(current);
        renderMarketRegimeHistory(history);
        renderMarketRegimeDiagnostics(diagnostics);
        if (status) status.textContent = `조회 완료 · ${new Date().toLocaleTimeString('ko-KR')}`;
    } catch (err) {
        if (status) status.textContent = '조회 실패';
        if (error) { error.textContent = `시장 국면 조회 실패: ${err.message}`; error.hidden = false; }
    }
}

async function refreshMarketRegimeData() {
    const button = document.getElementById('btn-refresh-market-regime');
    const status = document.getElementById('market-regime-refresh-status');
    const error = document.getElementById('market-regime-error');
    setButtonBusy(button, true);
    if (button) button.textContent = '수집 중...';
    if (status) status.textContent = 'Namuh 데이터를 다시 수집하고 있습니다...';
    if (error) error.hidden = true;
    try {
        const result = await postJson('/api/market-regime/refresh', {});
        if (result.current || result.snapshot || result.regime) renderMarketRegimeCurrent(result);
        await loadMarketRegimeDashboard();
        setStatus('시장 국면 데이터 수집과 재계산이 완료되었습니다.', true);
    } catch (err) {
        if (status) status.textContent = '수집 실패';
        if (error) { error.textContent = `데이터 다시 수집 실패: ${err.message}`; error.hidden = false; }
        setStatus(`시장 국면 갱신 실패: ${err.message}`);
    } finally {
        if (button) button.textContent = '데이터 다시 수집';
        setButtonBusy(button, false);
    }
}

async function renderCandidateHistory() {
    return window.HanstockDashboardCandidateHistoryScreen.render({
        fetchJson, deleteJson, withActiveStrategy, strategyReasonLabel, pill,
        formatNumber, formatCurrency, escapeHtml, setStatus, setTableMessage,
        reload: renderCandidateHistory,
    });
}

async function renderAiAllocation() {
    return window.HanstockDashboardAiAllocationScreen.render({
        fetchJson, setButtonBusy, setTableMessage, formatNumber, formatCurrency,
        translateReason, escapeHtml, pill, toKorAction, bindQueueButtons,
    });
}

function isHoldingSellPayload(payload) {
    return payload.action === 'sell'
        && payload.source === 'dashboard_holding_sell';
}

function showOrdersTab() {
    const tabEl = document.querySelector('[data-dashboard-tab="orders"]');
    if (tabEl) {
        tabEl.click();
    }
}

function scheduleOrderProgressRefresh() {
    setTimeout(() => {
        renderApprovals();
        renderTrades();
    }, 1500);
    setTimeout(() => {
        renderApprovals();
        renderTrades();
        renderBalance();
    }, 5000);
}

async function createApprovalFromButton(button) {
    const payload = {
        symbol: button.dataset.symbol,
        name: button.dataset.name,
        action: button.dataset.action,
        qty: Number(button.dataset.qty || 0),
        price: Number(button.dataset.price || 0),
        reason: button.dataset.reason || '',
        source: button.dataset.source || 'dashboard',
        strategy_id: button.dataset.strategyId || '',
        strategy_version: Number(button.dataset.strategyVersion || 0) || null,
        profile_hash: button.dataset.profileHash || '',
        source_candidate_id: Number(button.dataset.sourceCandidateId || 0) || null
    };
    button.disabled = true;
    try {
        const result = await postJson('/api/approvals', payload);
        await Promise.all([renderApprovals(), renderBalance()]);
        if (isHoldingSellPayload(payload)) {
            showOrdersTab();
            scheduleOrderProgressRefresh();
        }
        if (result.auto_approved) {
            setStatus(`${toKorAction(payload.action)} ${payload.symbol} 주문을 자동승인 처리했습니다.`, result.status !== 'failed');
            await Promise.all([renderTrades(), renderBalance()]);
        } else {
            setStatus(`${toKorAction(payload.action)} ${payload.symbol} 주문을 승인 대기에 올렸습니다.`, true);
        }
    } catch (err) {
        setStatus(`승인 대기 등록 실패: ${err.message}`);
        button.disabled = false;
    }
}

function bindQueueButtons() {
    document.querySelectorAll('.queue-order').forEach((button) => {
        button.addEventListener('click', () => createApprovalFromButton(button), { once: true });
    });
}

async function sellAllHoldings() {
    const button = document.getElementById('btn-sell-all-holdings');
    if (!window.confirm('신규 매수를 중단하고 현재 보유 종목을 전량 시장가 매도 승인으로 등록할까요?')) {
        return;
    }
    if (button) {
        button.disabled = true;
    }
    try {
        // 전량매도와 신규 매수 중단은 서로 다른 운영 기능이다.
        // 신규 매수를 중단하려면 별도의 Kill Switch를 명시적으로 사용한다.
        const result = await postJson('/api/holdings/sell-all', { halt_new_buys: false });
        if (result.status === 'empty') {
            setStatus('매도할 보유 종목이 없습니다.', true);
            return;
        }
        const submittedCount = result.submitted_count ?? result.executed_count ?? 0;
        const skippedCount = result.skipped_count || 0;
        const details = `대기 ${result.pending_count || 0}건, 주문접수 ${submittedCount}건, 실패 ${result.failed_count || 0}건, 제외 ${skippedCount}건`;
        const fillNote = result.fill_status_note || '실제 체결 여부는 주문내역 동기화 후 확정됩니다.';
        setStatus(
            `전량 매도 요청 ${result.created_count || 0}건을 등록했습니다. ${details}. ${fillNote}`,
            (result.failed_count || 0) === 0
        );
        showOrdersTab();
        scheduleOrderProgressRefresh();
        await Promise.all([renderApprovals(), renderTrades(), renderBalance()]);
    } catch (err) {
        setStatus(`전량 매도 요청 실패: ${err.message}`);
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

async function sellHoldingStrategyAttribution(button) {
    const symbol = button.dataset.symbol || '';
    const name = button.dataset.name || symbol;
    const strategyId = button.dataset.strategyId || '';
    const strategyName = button.dataset.strategyName || strategyId;
    const qty = Number(button.dataset.qty || 0);
    if (!window.confirm(`${name}(${symbol})의 ${strategyName} 귀속 ${qty.toLocaleString()}주를 매도할까요?`)) {
        return;
    }
    button.disabled = true;
    try {
        const result = await postJson('/api/holdings/strategy-sell', {
            symbol,
            strategy_id: strategyId,
        });
        setStatus(`${name} ${strategyName} 귀속 매도 ${result.created_count || 0}건을 등록했습니다.`, true);
        showOrdersTab();
        scheduleOrderProgressRefresh();
        await Promise.all([renderApprovals(), renderBalance()]);
    } catch (err) {
        setStatus(`종목별 귀속 매도 요청 실패: ${err.message}`);
        button.disabled = false;
    }
}

async function sellAllStrategyAttribution(button) {
    const strategyId = button.dataset.strategyId || '';
    const strategyName = button.dataset.strategyName || strategyId;
    if (!window.confirm(`${strategyName}에 귀속된 모든 보유종목을 전량 매도할까요?`)) {
        return;
    }
    button.disabled = true;
    try {
        const result = await postJson('/api/holdings/strategy-sell-all', {
            strategy_id: strategyId,
        });
        setStatus(
            `${strategyName} 전체귀속 매도 ${result.created_count || 0}건 등록, ${result.skipped_count || 0}건 제외했습니다.`,
            true
        );
        showOrdersTab();
        scheduleOrderProgressRefresh();
        await Promise.all([renderApprovals(), renderBalance()]);
    } catch (err) {
        setStatus(`전체귀속 전량매도 요청 실패: ${err.message}`);
        button.disabled = false;
    }
}

async function processOptimizerBatch() {
    const buttons = document.querySelectorAll('#table-optimizer tbody .queue-order:not([disabled])');
    if (buttons.length === 0) {
        alert('일괄 처리할 주문 제안이 없습니다.');
        return;
    }

    if (!window.confirm(`최적화 제안 ${buttons.length}건의 주문을 일괄 승인 대기로 등록하시겠습니까?`)) {
        return;
    }

    const batchButton = document.getElementById('btn-optimizer-batch');
    if (batchButton) {
        batchButton.disabled = true;
    }

    let successCount = 0;
    let failCount = 0;

    const promises = Array.from(buttons).map(async (button) => {
        const payload = {
            symbol: button.dataset.symbol,
            name: button.dataset.name,
            action: button.dataset.action,
            qty: Number(button.dataset.qty || 0),
            price: Number(button.dataset.price || 0),
            reason: button.dataset.reason || '',
            source: button.dataset.source || 'dashboard',
            strategy_id: button.dataset.strategyId || '',
            strategy_version: Number(button.dataset.strategyVersion || 0) || null,
            profile_hash: button.dataset.profileHash || '',
            source_candidate_id: Number(button.dataset.sourceCandidateId || 0) || null
        };
        button.disabled = true;
        try {
            const isMistock = window.location.pathname.includes('/mistock');
            const url = isMistock ? '/api/mistock/approvals' : '/api/approvals';
            await postJson(url, payload);
            successCount++;
            button.textContent = '등록완료';
            button.className = 'button-ghost';
            button.disabled = true;
        } catch (err) {
            failCount++;
            button.disabled = false;
            console.error(`Batch order registration failed for ${payload.symbol}:`, err);
        }
    });

    try {
        await Promise.all(promises);
        setStatus(`최적화 일괄 등록 완료 (성공: ${successCount}건, 실패: ${failCount}건)`, failCount === 0);
    } catch (err) {
        setStatus(`최적화 일괄 처리 중 오류 발생: ${err.message}`);
    } finally {
        if (batchButton) {
            batchButton.disabled = false;
        }
    }
    // Refresh UI in the background to prevent button from hanging on slow broker API calls
    renderApprovals();
    renderTrades();
    renderBalance();
}

const ACTIVE_ORDER_STATUSES = ['submitted', 'open', 'partial', 'cancel_pending', 'broker_unknown'];
let reconciliationIssueCount = 0;

function reconciliationReasonLabel(reason) {
    const value = String(reason || '').split(' | ')[0];
    if (value === 'verified fills contain a position absent from broker balance') {
        return '증권사 잔고에는 없지만 내부 원장에 수량이 남아 있음';
    }
    if (value === 'broker balance differs from verified fills') {
        return '증권사 수량과 내부 체결 원장 수량이 다름';
    }
    return value || '-';
}


async function renderReconciliationIssues() {
    reconciliationIssueCount = await window.HanstockDashboardReconciliationScreen.render({
        fetchJson,
        escapeHtml,
        setTableMessage,
        reasonLabel: reconciliationReasonLabel,
        formatCheckedAt: formatOrderCheckedAt,
        labels: {
            openIssues: '\uac74\uc758 \uc870\uc815 \ud544\uc694 \uc774\uc288',
            noIssues: '\ubd88\uc77c\uce58 \uc774\uc288\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.',
            quantity: '\uc8fc',
        },
    });
}

async function applyBrokerBalanceReconciliation(options = {}) {
    if (!reconciliationIssueCount) return;
    const skipConfirm = options.skipConfirm === true;
    const warning = `${reconciliationIssueCount}건의 내부 수량을 현재 나무 실제 잔고에 맞춥니다.\n변경 내용은 감사 원장에 기록되며 현금·손익 기록은 임의로 변경하지 않습니다.\n\n계속할까요?`;
    if (!skipConfirm && !window.confirm(warning)) return;
    const button = document.getElementById(options.buttonId || 'btn-apply-broker-balance');
    setButtonBusy(button, true);
    try {
        const result = await postJson('/api/reconciliation/issues/apply-broker-balance', {
            confirmation: 'APPLY_BROKER_BALANCE',
            reason: 'operator confirmed live Namuh balance alignment',
        });
        const ready = result.health?.new_risk_allowed === true;
        setStatus(
            `증권사 잔고 기준 보정 완료: ${Number(result.applied_count || 0)}건 · 주문 상태 ${ready ? 'READY' : '추가 점검 필요'}`,
            ready
        );
        await Promise.all([
            renderReconciliationIssues(), renderApprovals(), renderOpenOrders(), renderBalance()
        ]);
    } catch (err) {
        setStatus(`잔고 보정 실패: ${err.message} 보유종목 동기화 후 다시 확인하세요.`);
    } finally {
        setButtonBusy(button, false);
    }
}

let bulkReconciliationRunId = null;

async function resolveAllReconciliationIssues() {
    if (!reconciliationIssueCount) return;
    const warning = `주문 상태와 나무 보유잔고를 먼저 현행화한 뒤 ${reconciliationIssueCount}건의 잔고 불일치를 최신 증권사 수량으로 일괄 해결합니다.\n\n계속할까요?`;
    if (!window.confirm(warning)) return;
    const button = document.getElementById('btn-resolve-all-reconciliation');
    setButtonBusy(button, true);
    try {
        const result = await postJson('/api/trades/sync', {});
        bulkReconciliationRunId = result.run_id;
        renderTradeSyncResult(result);
        setStatus('전체 불일치 해결 1/2: 주문·보유 현행화 진행 중입니다.', true);
        startTradeSyncPolling();
    } catch (err) {
        bulkReconciliationRunId = null;
        setButtonBusy(button, false);
        setStatus(`전체 불일치 해결 시작 실패: ${err.message}`);
    }
}

function formatOrderCheckedAt(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('ko-KR');
}

async function cancelOpenOrder(button) {
    const orderId = Number(button.dataset.id || 0);
    const symbolName = button.dataset.name || button.dataset.symbol || `주문 #${orderId}`;
    const sideLabel = button.dataset.side === 'buy' ? '매수' : '매도';
    if (!orderId || !window.confirm(`${symbolName} ${sideLabel} 미체결 주문을 취소할까요?\n취소 접수 후 해당 주문만 즉시 확인해 최종 상태를 표시합니다.`)) {
        return;
    }
    setButtonBusy(button, true);
    try {
        const result = await postJson(`/api/orders/${orderId}/cancel`, {});
        const brokerResult = result.broker_result || {};
        if (!brokerResult.success) {
            setStatus(`주문 #${orderId} 취소 결과가 불명확합니다. 현행화 후 증권사 상태를 확인하세요: ${brokerResult.message || '-'}`);
        } else {
            setStatus(`${symbolName} ${sideLabel} 주문 취소가 접수됐습니다. 원주문 상태를 확인합니다.`, true);
        }
        await Promise.all([renderOpenOrders(), renderApprovals()]);
        if (brokerResult.success) {
            const terminal = await waitForCanceledOrder(orderId, symbolName);
            await Promise.all([renderOpenOrders(), renderApprovals(), renderBalance()]);
            if (terminal.status === 'canceled') {
                setStatus(`${symbolName} 주문 취소가 증권사 기록에서 확정됐습니다.`, true);
            } else if (terminal.status === 'filled') {
                setStatus(`${symbolName} 주문이 취소 전에 체결됐습니다. 보유종목을 확인하세요.`);
            } else {
                setStatus(`${symbolName} 취소 확인이 완료되지 않았습니다: ${orderStatusLabel(terminal.status)}`);
            }
        }
    } catch (err) {
        setStatus(`주문 취소 실패: ${err.message}`);
    } finally {
        setButtonBusy(button, false);
    }
}

async function resolveUnknownOpenOrder(button) {
    const orderId = Number(button.dataset.id || 0);
    const symbolName = button.dataset.name || button.dataset.symbol || `주문 #${orderId}`;
    if (!orderId || !window.confirm(
        `${symbolName} 주문이 증권사 앱/웹 미체결 목록에 없음을 직접 확인했습니까?\n확인한 경우에만 로컬 미확인 주문을 종결합니다.`
    )) return;
    setButtonBusy(button, true);
    try {
        await postJson(`/api/orders/${orderId}/resolve-unknown`, {
            confirmation: 'BROKER_ORDER_NOT_FOUND'
        });
        setStatus(`${symbolName} 미확인 주문을 종결했습니다.`, true);
        await Promise.all([renderOpenOrders(), renderApprovals(), renderBalance()]);
    } catch (err) {
        setStatus(`미확인 주문 종결 실패: ${err.message}`);
        button.disabled = false;
    }
}

async function waitForCanceledOrder(orderId, symbolName, attempts = 20) {
    let latest = { status: 'cancel_pending' };
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 2000));
        latest = await fetchJson(`/api/orders/${orderId}`, 10000);
        const status = String(latest.status || 'broker_unknown');
        if (['canceled', 'filled', 'rejected', 'expired', 'broker_unknown'].includes(status)) {
            return latest;
        }
        setStatus(`${symbolName} 취소 확인 중… ${attempt}/${attempts}` , true);
    }
    return latest;
}


async function renderOpenOrders() {
    return window.HanstockDashboardOpenOrdersScreen.render({
        fetchJson,
        setTableMessage,
        escapeHtml,
        formatCurrency,
        formatCheckedAt: formatOrderCheckedAt,
        strategyDisplayName,
        orderStatusLabel,
        pill,
        cancelOpenOrder,
        resolveUnknownOpenOrder,
        activeStatuses: ACTIVE_ORDER_STATUSES,
        labels: {
            orders: '\ubbf8\uccb4\uacb0 \uc8fc\ubb38',
            buy: '\ub9e4\uc218',
            sell: '\ub9e4\ub3c4',
            empty: '\ud604\uc7ac \ubbf8\uccb4\uacb0 \uc8fc\ubb38\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.',
            requested: '\uc694\uccad',
            filled: '\uccb4\uacb0',
            remaining: '\uc794\ub7c9',
            marketPrice: '\uc2dc\uc7a5\uac00',
            cancel: '\uc8fc\ubb38 \ucde8\uc18c',
            resolve: '\ubbf8\ud655\uc778 \uc885\ub8cc',
            noAction: '\uc870\uce58 \ud544\uc694 \uc5c6\uc74c',
        },
    });
}

async function renderApprovals() {
    try {
        const { data, orderHealth } = await window.HanstockDashboardApprovalQueue.load(fetchJson);
        const healthBanner = document.getElementById('order-health-banner');
        if (healthBanner) {
            const blockers = (orderHealth.blockers || []).map((item) => `${item.code} ${item.count}건`);
            const warnings = (orderHealth.warnings || []).map((item) => `${item.code} ${item.count}건`);
            const notices = [...blockers, ...warnings];
            healthBanner.textContent = `주문 상태: 매수 가능${notices.length ? ` · 점검 ${notices.join(', ')}` : ' · 정상'}`;
            healthBanner.classList.toggle('status-fail', false);
            healthBanner.classList.toggle('status-ok', !notices.length);
        }
        const tbody = document.querySelector('#table-approvals tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const directRetryCount = data.approvals.filter((row) => row.direct_retry_eligible).length;
        const cancelRetryCount = data.approvals.filter((row) => row.cancel_retry_eligible).length;
        const retryBatchButton = document.getElementById('btn-retry-approvals-batch');
        const cancelRetryBatchButton = document.getElementById('btn-cancel-retry-approvals-batch');
        if (retryBatchButton) {
            retryBatchButton.disabled = true;
            retryBatchButton.textContent = '선택 재처리 (0)';
        }
        if (cancelRetryBatchButton) {
            cancelRetryBatchButton.disabled = true;
            cancelRetryBatchButton.textContent = '선택 취소후재처리 (0)';
        }
        const summary = document.getElementById('approval-queue-summary');
        if (summary) {
            summary.textContent = `표시 ${data.approvals.length}건 · 처리 필요 ${Number(data.actionable_count || 0)}건 · 증권사 확인 필요 ${Number(data.verification_required_count || 0)}건 · 일반 재처리 ${directRetryCount}건 · 미체결 취소 필요 ${cancelRetryCount}건 · 승인 없이 동기화된 증권사 거래는 체결 내역에서 확인하세요.`;
        }
        if (!data.approvals.length) {
            setTableMessage('#table-approvals tbody', 11, '승인 대기 주문이 없습니다');
            return;
        }

        data.approvals.forEach((row) => {
            const status = String(row.status || '');
            const statusKind = ['pending', 'broker_unknown'].includes(status) ? 'warn' : (status === 'executed' ? 'buy' : (status === 'failed' ? 'sell' : 'hold'));
            const estimatedCost = Number(row.qty || 0) * Number(row.price || 0);
            const filledQty = Number(row.filled_qty || 0);
            const remainingQty = Number(row.remaining_qty ?? Math.max(0, Number(row.qty || 0) - filledQty));
            const orderStatus = String(row.order_status || '');
            const approvalLabel = status === 'executed' ? '주문 접수' : toKorStatus(status);
            const orderLabel = orderStatus ? orderStatusLabel(orderStatus) : (status === 'pending' ? '미제출' : '-');
            const autoApprovalInProgress = Boolean(row.auto_approval_in_progress);
            const retryButton = [
                row.direct_retry_eligible
                    ? `<button type="button" class="retry-approval" data-id="${row.id}" data-symbol="${escapeHtml(row.symbol)}">재처리</button>`
                    : '',
                row.cancel_retry_eligible
                    ? `<button type="button" class="button-danger cancel-retry-approval" data-id="${row.id}" data-symbol="${escapeHtml(row.symbol)}">미체결 취소 후 재처리</button>`
                    : '',
            ].filter(Boolean).join('');
            const blockingText = Number(row.blocking_remaining_qty || 0) > 0
                ? ` · 증권사 미체결 ${Number(row.blocking_remaining_qty).toLocaleString()}주 (#${escapeHtml(row.blocking_order_id || '-')})`
                : '';
            // The approval response only confirms submission. Once broker trade
            // data exists, show that final/partial outcome instead.
            const responseText = `${escapeHtml(row.result_message || row.response_msg || row.order_status || '')}${blockingText}`;
            const classificationKind = row.order_classification
                || (row.strategy_id ? 'strategy' : 'manual');
            const classificationLabel = row.order_classification_label
                || row.strategy_name
                || row.strategy_id
                || '수동 주문';
            const classificationDetail = row.order_classification_detail
                || (row.strategy_id
                    ? `전략 주문 · ${row.strategy_id}`
                    : (row.source ? `출처: ${row.source}` : '출처 미기록 · 수동 처리'));
            const controls = status === 'pending' && row.stale
                ? `<span class="time-muted text-danger">거래일 만료 · 새 주문을 생성하세요</span>`
                : status === 'pending' && autoApprovalInProgress
                ? `<span class="time-muted">자동승인 진행중</span>`
                : status === 'pending'
                ? `<div class="button-row">
                    <button type="button" class="approve-order" data-id="${row.id}">승인</button>
                    <button type="button" class="button-danger reject-order" data-id="${row.id}">거절</button>
                   </div>`
                : `<div class="button-row">
                    <span class="time-muted">${responseText}</span>
                    ${retryButton}
                   </div>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${(row.direct_retry_eligible || row.cancel_retry_eligible) && !row.stale
                    ? `<input type="checkbox" class="approval-batch-select" data-id="${row.id}" aria-label="주문 #${row.id} 일괄 처리 선택">`
                    : '-'}</td>
                <td>#${escapeHtml(row.id || '-')}</td>
                <td>
                    <div class="approval-classification">
                        <span class="approval-classification-badge is-${escapeHtml(classificationKind)}">${escapeHtml(classificationLabel)}</span>
                        <small>${escapeHtml(classificationDetail)}</small>
                    </div>
                </td>
                <td>
                    <div>${escapeHtml(String(row.created_at || '').split(' ')[0])}</div>
                    <div class="time-muted">${escapeHtml(String(row.created_at || '').split(' ')[1] || '')}</div>
                    ${row.expires_at ? `<small class="time-muted">만료 ${escapeHtml(row.expires_at)}</small>` : ''}
                </td>
                <td>${pill(toKorAction(row.action), row.action === 'buy' ? 'buy' : 'sell')}</td>
                <td>
                    <div class="symbol-name">${escapeHtml(row.name || row.symbol)}</div>
                    <div class="symbol-code">${escapeHtml(row.symbol)}</div>
                </td>
                <td>
                    <div>${Number(row.qty || 0).toLocaleString()} / ${filledQty.toLocaleString()} / ${remainingQty.toLocaleString()}</div>
                    <small class="time-muted">요청 / 체결 / 잔여</small>
                </td>
                <td>
                    <div>${Number(row.price || 0) > 0 ? formatCurrency(row.price) : '시장가'} / ${Number(row.filled_price || 0) > 0 ? formatCurrency(row.filled_price) : '-'}</div>
                    <small class="time-muted">주문가 / 평균체결가</small>
                </td>
                <td>${formatCurrency(estimatedCost)}</td>
                <td>
                    <div>${pill(approvalLabel, statusKind)} ${pill(orderLabel, orderStatus === 'filled' ? 'buy' : orderStatus === 'partial' ? 'warn' : 'hold')}</div>
                    ${row.broker_order_id ? `<small class="time-muted">주문번호 #${escapeHtml(row.broker_order_id)}</small>` : ''}
                    ${row.internal_order_id ? `<small class="time-muted">원장 #${escapeHtml(row.internal_order_id)} · ${escapeHtml(row.unified_order_status || '-')}</small>` : ''}
                    ${row.stale ? '<small class="time-muted text-danger">거래일 만료 · 재실행 불가</small>' : ''}
                </td>
                <td>${controls}</td>
            `;
            tbody.appendChild(tr);
        });

        const updateBatchSelection = () => {
            const selected = new Set(Array.from(document.querySelectorAll('.approval-batch-select:checked')).map((item) => item.dataset.id));
            const retrySelected = Array.from(document.querySelectorAll('.retry-approval')).filter((button) => selected.has(button.dataset.id)).length;
            const cancelSelected = Array.from(document.querySelectorAll('.cancel-retry-approval')).filter((button) => selected.has(button.dataset.id)).length;
            if (retryBatchButton) {
                retryBatchButton.disabled = retrySelected === 0;
                retryBatchButton.textContent = `선택 재처리 (${retrySelected})`;
            }
            if (cancelRetryBatchButton) {
                cancelRetryBatchButton.disabled = cancelSelected === 0;
                cancelRetryBatchButton.textContent = `선택 취소후재처리 (${cancelSelected})`;
            }
        };
        document.querySelectorAll('.approval-batch-select').forEach((checkbox) => {
            checkbox.addEventListener('change', updateBatchSelection);
        });

        document.querySelectorAll('.approve-order').forEach((button) => {
            button.addEventListener('click', () => handleApprovalAction(button, 'approve'));
        });
        document.querySelectorAll('.reject-order').forEach((button) => {
            button.addEventListener('click', () => handleApprovalAction(button, 'reject'));
        });
        document.querySelectorAll('.retry-approval').forEach((button) => {
            button.addEventListener('click', () => executeApprovalAction(button, 'retry'));
        });
        document.querySelectorAll('.cancel-retry-approval').forEach((button) => {
            button.addEventListener('click', () => executeApprovalAction(button, 'cancel-retry'));
        });
    } catch (err) {
        setTableMessage('#table-approvals tbody', 11, err.message);
    }
}

let pendingApprovalButton = null;
let pendingApprovalAction = null;

async function executeApprovalAction(button, action) {
    button.disabled = true;
    try {
        const result = await postJson(`/api/approvals/${button.dataset.id}/${action}`, {});
        setStatus(`승인 처리 결과: ${toKorStatus(result.status)} #${result.id}`, result.status !== 'failed');
        await Promise.all([renderApprovals(), renderTrades(), renderBalance()]);
    } catch (err) {
        setStatus(`승인 처리 실패: ${err.message}`);
        button.disabled = false;
    }
}

async function executeApprovalBatch(action) {
    const selector = action === 'cancel-retry'
        ? '#table-approvals tbody .cancel-retry-approval:not([disabled])'
        : '#table-approvals tbody .retry-approval:not([disabled])';
    const selectedIds = new Set(Array.from(document.querySelectorAll('.approval-batch-select:checked')).map((item) => item.dataset.id));
    const seenSymbols = new Set();
    const buttons = Array.from(document.querySelectorAll(selector)).filter((button) => {
        if (!selectedIds.has(button.dataset.id)) return false;
        const symbol = String(button.dataset.symbol || button.dataset.id);
        if (seenSymbols.has(symbol)) return false;
        seenSymbols.add(symbol);
        return true;
    });
    if (!buttons.length) {
        setStatus('일괄 처리할 주문을 먼저 선택하세요.', true);
        return;
    }

    const actionLabel = action === 'cancel-retry' ? '취소후재처리' : '재처리';
    if (!window.confirm(`${buttons.length}건을 ${actionLabel} 일괄 처리하시겠습니까?`)) {
        return;
    }

    const batchButtonId = action === 'cancel-retry'
        ? 'btn-cancel-retry-approvals-batch'
        : 'btn-retry-approvals-batch';
    const batchButton = document.getElementById(batchButtonId);
    if (batchButton) batchButton.disabled = true;

    try {
        buttons.forEach((button) => { button.disabled = true; });
        const started = await postJson('/api/approvals/batch', {
            action,
            approval_ids: buttons.map((button) => Number(button.dataset.id))
        });
        setStatus(`${actionLabel} 일괄 작업을 시작했습니다. 0/${started.total_count}건`);
        let state = started;
        const jobId = String(started.job_id || '');
        const pollingDeadline = Date.now() + 15 * 60 * 1000;
        while (state.status === 'running') {
            if (Date.now() >= pollingDeadline) {
                throw new Error('일괄 작업 상태 확인 시간이 초과되었습니다. 주문 현황을 새로고침해 확인해 주세요.');
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
            state = await fetchJson(`/api/approvals/batch/status?job_id=${encodeURIComponent(jobId)}`, 10000);
            if (jobId && String(state.job_id || '') !== jobId) {
                throw new Error('다른 일괄 작업의 상태가 반환되었습니다. 주문 현황을 새로고침해 주세요.');
            }
            setStatus(
                `${actionLabel} 처리 중: ${state.processed_count || 0}/${state.total_count || started.total_count}건`
            );
        }
        if (state.status !== 'completed') {
            throw new Error(state.error || '일괄 작업이 서버 재기동 또는 중단으로 완료되지 않았습니다.');
        }
        const failures = (state.results || []).filter((item) => !item.ok);
        const failureNote = failures.length
            ? ` · ${failures.slice(0, 3).map((item) => `#${item.approval_id} ${item.error}`).join(' / ')}`
            : '';
        setStatus(
            `${actionLabel} 일괄 완료: 성공 ${state.success_count || 0}건, 실패·건너뜀 ${state.failed_count || 0}건${failureNote}`,
            Number(state.failed_count || 0) === 0
        );
        await Promise.all([renderApprovals(), renderTrades(), renderBalance()]);
    } catch (err) {
        setStatus(`${actionLabel} 일괄 요청 실패: ${err.message}`);
        buttons.forEach((button) => { button.disabled = false; });
    } finally {
        if (batchButton) batchButton.disabled = false;
    }
}

async function handleApprovalAction(button, action) {
    if (action === 'approve') {
        const row = button.closest('tr');
        const details = row ? row.innerText.replace(/\s+/g, ' ').trim() : `승인 #${button.dataset.id}`;
        if (!window.confirm(`주문을 제출하시겠습니까?\n\n${details}\n\n주문 접수는 체결 완료가 아닙니다.`)) {
            return;
        }
    }
    // 안드로이드 하이브리드 앱 내부이며 승인(approve)을 시도할 경우, 네이티브 생체 인식 요구
    if (typeof window.androidApp !== 'undefined' && action === 'approve') {
        button.disabled = true;
        pendingApprovalButton = button;
        pendingApprovalAction = action;
        setStatus("주문 실행을 위해 기기의 지문 또는 Face ID 생체 인증을 진행해 주세요.");
        window.androidApp.authenticateBiometric();
    } else {
        await executeApprovalAction(button, action);
    }
}

// 안드로이드 네이티브 생체 인증 완료 시 호출되는 전역 콜백
window.onBiometricResult = function(success) {
    if (success) {
        if (pendingApprovalButton && pendingApprovalAction) {
            setStatus("생체 인증 완료. 주문 처리를 요청합니다...", true);
            executeApprovalAction(pendingApprovalButton, pendingApprovalAction);
            pendingApprovalButton = null;
            pendingApprovalAction = null;
        }
    } else {
        if (pendingApprovalButton) {
            pendingApprovalButton.disabled = false;
            setStatus("생체 인증이 실패했거나 취소되어 주문 전송이 중단되었습니다.");
            pendingApprovalButton = null;
            pendingApprovalAction = null;
        }
    }
};

// FCM 알림 클릭 시 특정 대시보드 탭으로 즉시 라우팅하는 전역 콜백
window.routeToTab = function(tabName) {
    console.log("routeToTab received tab:", tabName);
    let target = tabName;
    if (tabName === 'approval' || tabName === 'approvals') {
        target = 'orders';
    }
    const tabEl = document.querySelector(`[data-dashboard-tab="${target}"]`);
    if (tabEl) {
        tabEl.click();
        setStatus(`FCM 알림 딥링크 라우팅: [${tabEl.textContent}] 탭으로 전환되었습니다.`, true);
    }
};


let tradeSyncPollInterval = null;
let tradeSyncLastCompletedRunId = null;

function updateTradeSyncButton(result) {
    const button = document.getElementById('btn-sync-trades');
    const holdingsButton = document.getElementById('btn-sync-holdings');
    const orderHoldingsButton = document.getElementById('btn-sync-order-holdings');
    if (!result) return;
    const running = result.status === 'running';
    if (button) {
        button.disabled = running;
        button.textContent = running ? '동기화 진행 중…' : '증권사 기록 동기화';
        button.style.backgroundColor = running ? '#f59e0b' : '';
        button.style.color = running ? 'white' : '';
    }
    if (holdingsButton) {
        holdingsButton.disabled = running;
        holdingsButton.textContent = running ? '보유종목 동기화 중…' : '보유종목 동기화';
    }
    if (orderHoldingsButton) {
        orderHoldingsButton.disabled = running;
        orderHoldingsButton.textContent = running ? '주문·보유 현행화 중…' : '주문·보유 현행화';
    }
}

async function startBrokerHoldingsSync() {
    const holdingsButton = document.getElementById('btn-sync-holdings');
    const orderHoldingsButton = document.getElementById('btn-sync-order-holdings');
    if (holdingsButton) {
        holdingsButton.disabled = true;
        holdingsButton.textContent = '보유종목 동기화 중…';
    }
    if (orderHoldingsButton) {
        orderHoldingsButton.disabled = true;
        orderHoldingsButton.textContent = '주문·보유 현행화 중…';
    }
    try {
        const result = await postJson('/api/trades/sync', {});
        renderTradeSyncResult(result);
        setStatus('증권사 체결내역과 실제 잔고의 동기화를 시작했습니다.', true);
        startTradeSyncPolling();
    } catch (err) {
        setStatus(`보유종목 동기화 실패: ${err.message}`);
        if (holdingsButton) {
            holdingsButton.disabled = false;
            holdingsButton.textContent = '보유종목 동기화';
        }
        if (orderHoldingsButton) {
            orderHoldingsButton.disabled = false;
            orderHoldingsButton.textContent = '주문·보유 현행화';
        }
        await loadTradeSyncResult();
    }
}


function renderTradeSyncResult(result) {
    return window.HanstockDashboardTradeSyncScreen.render(result, {
        updateButton: updateTradeSyncButton,
        fetchJson,
        setStatus,
        escapeHtml,
        formatCurrency,
        orderStatusLabel,
        typeLabels: { history: '\uccb4\uacb0 \ub0b4\uc5ed', order_status: '\uc8fc\ubb38 \uc0c1\ud0dc', balance: '\ubcf4\ud5d8 \uc870\uc815', cleanup: '\ubd88\uc77c\uce58 \uc815\ub9ac' },
        resultLabels: { imported: '\uc2e0\uaddc \ucd94\uac00', updated: '\uc0c1\ud0dc \uac31\uc2e0', skipped: '\uae30\uc874 \ud56d\ubaa9', reconciled: '\ubcf4\ud5d8 \uc870\uc815', removed: '\uc0ad\uc81c', checked: '\ud655\uc778' },
        labels: { added: '\ucd94\uac00', removed: '\ubd88\uc77c\uce58 \uc815\ub9ac', imported: '\uccb4\uacb0 \ucd94\uac00', updated: '\uc0c1\ud0dc \uac31\uc2e0', completed: '\uc644\ub8cc \uc2dc\uac04', error: '\uc624\ub958', selected: '\uc120\ud0dd\ub41c \ub3d9\uae30\ud654', items: '\uac74', noItems: '\uc2e4\ud589\ub41c \uc0c1\uc138 \ub3d9\uae30\ud654 \ud56d\ubaa9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.', running: '\uc9c4\ud589 \uc911', failed: '\uc2e4\ud328', done: '\uc644\ub8cc', buy: '\ub9e4\uc218', sell: '\ub9e4\ub3c4', detailFailed: '\ub3d9\uae30\ud654 \uc0c1\uc138 \uc870\ud68c \uc2e4\ud328' },
    });
}

async function loadTradeSyncResult() {
    try {
        const result = await fetchJson('/api/trades/sync/status', 10000);
        renderTradeSyncResult(result);
        if (result.status === 'running') startTradeSyncPolling();
        return result;
    } catch (_) {
        // The performance data itself remains usable when no saved sync result exists.
        return null;
    }
}

function startTradeSyncPolling() {
    if (tradeSyncPollInterval) return;
    const poll = async () => {
        const result = await loadTradeSyncResult();
        if (!result || result.status === 'running') return;
        clearInterval(tradeSyncPollInterval);
        tradeSyncPollInterval = null;
        updateTradeSyncButton(result);
        if (bulkReconciliationRunId && result.run_id === bulkReconciliationRunId) {
            const bulkButton = document.getElementById('btn-resolve-all-reconciliation');
            if (['success', 'completed'].includes(result.status)) {
                setStatus('전체 불일치 해결 2/2: 최신 증권사 잔고로 내부 원장을 보정 중입니다.', true);
                await renderReconciliationIssues();
                await applyBrokerBalanceReconciliation({
                    skipConfirm: true,
                    buttonId: 'btn-resolve-all-reconciliation',
                });
            } else {
                setStatus(`전체 불일치 해결 실패: ${result.error || '주문·보유 현행화 실패'}`);
            }
            bulkReconciliationRunId = null;
            setButtonBusy(bulkButton, false);
        }
        if (result.run_id && result.run_id !== tradeSyncLastCompletedRunId) {
            tradeSyncLastCompletedRunId = result.run_id;
            await Promise.all([
                renderBalance(),
                renderOpenOrders(),
                renderReconciliationIssues(),
                renderApprovals(),
                renderPeriodicPerformance(),
                renderExecutionPlan(),
            ]);
            const removed = Number(result.removed_mismatch_count || 0);
            setStatus(
                ['success', 'completed'].includes(result.status)
                    ? `증권사 기록 동기화 완료 (추가 ${Number(result.synced_count || 0)}건, 불일치 정리 ${removed}건)`
                    : `증권사 기록 동기화 실패: ${result.error || '알 수 없는 오류'}`,
                ['success', 'completed'].includes(result.status)
            );
        }
    };
    tradeSyncPollInterval = setInterval(poll, 3000);
    poll();
}

async function renderTrades() {
    try {
        await loadTradeSyncResult();
        // 성과 요약 (Performance)
        try {
            const perf = await fetchJson(performancePath('/api/performance'), 30000);
            document.getElementById('perf-total-trades').textContent = `${perf.total_trades}회`;
            document.getElementById('perf-success-rate').textContent = `${perf.success_rate}%`;
            
            const pnlEl = document.getElementById('perf-realized-pnl');
            pnlEl.textContent = formatCurrency(perf.realized_pnl);
            pnlEl.className = perf.realized_pnl > 0 ? 'text-success' : (perf.realized_pnl < 0 ? 'text-danger' : '');
            
            const evalPnlEl = document.getElementById('perf-eval-pnl');
            if (evalPnlEl) {
                const evalPnl = perf.total_eval_pnl || 0;
                evalPnlEl.textContent = formatCurrency(evalPnl);
                evalPnlEl.className = evalPnl > 0 ? 'text-success' : (evalPnl < 0 ? 'text-danger' : '');
            }
            const holdingDailyChangeEl = document.getElementById('perf-holding-daily-change');
            if (holdingDailyChangeEl) {
                const dailyChange = perf.holding_daily_change_pct;
                holdingDailyChangeEl.textContent = dailyChange == null ? '-' : formatPercent(dailyChange);
                holdingDailyChangeEl.className = Number(dailyChange) > 0
                    ? 'text-success'
                    : (Number(dailyChange) < 0 ? 'text-danger' : '');
            }
            
            const tbodyEval = document.querySelector('#table-eval-details tbody');
            if (tbodyEval) {
                tbodyEval.innerHTML = '';
                const details = perf.eval_details || [];
                if (!details.length) {
                    setTableMessage('#table-eval-details tbody', 8, '자동매매로 매수한 보유종목이 없습니다.');
                } else {
                    details.forEach((item) => {
                        const tr = document.createElement('tr');
                        const pnlClass = item.eval_pnl > 0 ? 'text-success' : (item.eval_pnl < 0 ? 'text-danger' : '');
                        tr.innerHTML = `
                            <td>
                                <span class="symbol-name">${escapeHtml(item.name || item.symbol)}</span>
                                ${item.diff_reason ? `<div style="font-size: 0.75rem; color: #ffc107; margin-top: 2px;">⚠️ ${escapeHtml(item.diff_reason)}</div>` : ''}
                            </td>
                            <td>${Number(item.qty || 0).toLocaleString()}</td>
                            <td>${formatCurrency(item.avg_cost)}</td>
                            <td>${formatCurrency(item.current_price)}</td>
                            <td>${formatCurrency(Number(item.current_price || 0) * Number(item.qty || 0))}</td>
                            <td class="${pnlClass}">${formatPercent(item.return_rate)}</td>
                            <td class="${Number(item.daily_change_pct) > 0 ? 'text-success' : (Number(item.daily_change_pct) < 0 ? 'text-danger' : '')}">${item.daily_change_pct == null ? '-' : formatPercent(item.daily_change_pct)}</td>
                            <td class="${pnlClass}">${item.eval_pnl > 0 ? '+' : ''}${formatCurrency(item.eval_pnl)}</td>
                        `;
                        tbodyEval.appendChild(tr);
                    });
                }
            }

            const diffContainer = document.getElementById('pnl-diff-container');
            const diffList = document.getElementById('pnl-diff-list');
            const brokerPnlSpan = document.getElementById('perf-broker-pnl');
            
            if (diffContainer && diffList && brokerPnlSpan && typeof perf.total_broker_pnl !== 'undefined') {
                const autoPnl = perf.total_eval_pnl || 0;
                const brokerPnl = perf.total_broker_pnl || 0;
                
                if (autoPnl !== brokerPnl) {
                    diffContainer.hidden = false;
                    brokerPnlSpan.textContent = formatCurrency(brokerPnl);
                    
                    let diffHtml = '';
                    const details = perf.eval_details || [];
                    details.forEach(item => {
                        if (item.diff_reason) {
                            const diffAmt = (item.broker_pnl || 0) - (item.eval_pnl || 0);
                            const sign = diffAmt > 0 ? '+' : '';
                            diffHtml += `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.diff_reason)} (평가손익 차액: ${sign}${formatCurrency(diffAmt)})</li>`;
                        }
                    });
                    
                    const untracked = perf.untracked_details || [];
                    untracked.forEach(item => {
                        const sign = item.broker_pnl > 0 ? '+' : '';
                        diffHtml += `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.diff_reason)} (증권사 평가손익 전체 합산: ${sign}${formatCurrency(item.broker_pnl)})</li>`;
                    });
                    
                    diffList.innerHTML = diffHtml || '<li>차이 원인을 분석할 수 없는 오차가 있습니다. (API 지연 등)</li>';
                } else {
                    diffContainer.hidden = true;
                }
            }
        } catch (e) {
            console.error('Failed to fetch performance summary', e);
        }

        const trades = await fetchJson(performancePath('/api/trades', { limit: 20 }));
        const tbodyTrades = document.querySelector('#table-trades tbody');
        if (!tbodyTrades) return;
        tbodyTrades.innerHTML = '';

        if (!trades.trades.length) {
            setTableMessage('#table-trades tbody', 8, '주문 기록이 없습니다');
        }

        trades.trades.forEach((trade) => {
            const action = String(trade.action || '').toLowerCase();
            const badge = action === 'buy'
                ? '<span class="badge badge-buy">매수</span>'
                : '<span class="badge badge-sell">매도</span>';
            const [datePart = '-', timePart = '-'] = String(trade.ts || '').split(' ');
            const baseReason = translateReason(trade.reason || '-');
            const cause = trade.response_msg || trade.cleanup_reason || '';
            const reason = escapeHtml(cause ? `${baseReason} | 원인: ${cause}` : baseReason);
            const orderStatus = orderStatusLabel(trade.order_status);
            const filledQty = Number(trade.filled_qty || 0);
            const filledPrice = Number(trade.filled_price || 0);
            const filledText = filledQty > 0
                ? `${filledQty.toLocaleString()} @ ${formatCurrency(filledPrice)}`
                : '-';
            const canDeleteLocal = trade.local_id
                && filledQty === 0
                && ['failed', 'submitted', 'broker_unknown'].includes(String(trade.order_status || '').toLowerCase());
            const cleanupButton = canDeleteLocal
                ? `<button type="button" class="button-ghost delete-local-trade" data-id="${Number(trade.local_id)}" title="증권사 주문은 건드리지 않고 로컬 기록만 삭제합니다">로컬삭제</button>`
                : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div>${escapeHtml(datePart)}</div>
                    <div class="time-muted">${escapeHtml(timePart.substring(0, 5))}</div>
                </td>
                <td>${badge}</td>
                <td><span class="symbol-name">${escapeHtml(trade.name || trade.symbol)}</span></td>
                <td>${formatCurrency(trade.price)}</td>
                <td>${Number(trade.qty || 0).toLocaleString()}</td>
                <td><div class="reason-cell" title="${reason}">${reason}</div></td>
                <td>
                    <span class="badge">${escapeHtml(orderStatus)}</span>
                    ${trade.broker_order_id ? `<div class="time-muted">#${escapeHtml(trade.broker_order_id)}</div>` : ''}
                    ${cleanupButton}
                </td>
                <td>${escapeHtml(filledText)}</td>
            `;
            tbodyTrades.appendChild(tr);
        });

        tbodyTrades.querySelectorAll('.delete-local-trade').forEach((button) => {
            button.addEventListener('click', async () => {
                const tradeId = Number(button.dataset.id || 0);
                if (!tradeId || !window.confirm('이 기록을 로컬 DB에서만 삭제할까요? 증권사 주문/체결 내역은 삭제되지 않습니다.')) return;
                try {
                    const response = await fetch(`/api/trades/local/${tradeId}?confirm=true`, { method: 'DELETE' });
                    const payload = await response.json();
                    if (!response.ok) throw new Error(payload.detail || '로컬 거래 삭제 실패');
                    await renderTrades();
                } catch (error) {
                    window.alert(error.message || '로컬 거래 삭제 실패');
                }
            });
        });

        await renderTradeCleanup();
        
        await renderPeriodicPerformance();
    } catch (err) {
        console.error('Failed to fetch trade history', err);
        setTableMessage('#table-trades tbody', 8, err.message);
    }
}


async function renderTradeCleanup() {
    return window.HanstockDashboardTradeCleanupScreen.render({
        fetchJson,
        deleteJson,
        escapeHtml,
        orderStatusLabel,
        reload: renderTradeCleanup,
        labels: {
            empty: '\uc815\ub9ac \ub300\uc0c1 \ub85c\uceec \uBD88\uc77c\uce58 \uac70\ub798\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.',
            buy: '\ub9e4\uc218',
            sell: '\ub9e4\ub3c4',
            lowRisk: '\ub0ae\uc74c',
            highRisk: '\ub192\uc74c',
            risk: '\uc815\ub9ac \uc704\ud5d8\ub3c4:',
            delete: '\ub85c\uceec \uc0ad\uc81c',
            confirm: '\uc774 \ubd88\uc77c\uce58 \uae30\ub85d\uc744 \ub85c\uceec DB\uc5d0\uc11c\ub9cc \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c? \uc99d\uad8c \uc8fc\ubb38\uacfc \uccb4\uacb0 \ub0b4\uc5ed\uc740 \uc0ad\uc81c\ub418\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.',
            deleteFailed: '\ub85c\uceec \uac70\ub798 \uc0ad\uc81c \uc2e4\ud328',
            loadFailed: '\ubd88\uc77c\uce58 \uac70\ub798 \uc870\ud68c \uc2e4\ud328',
        },
    });
}


async function renderPeriodicPerformance() {
    return window.HanstockDashboardPeriodicPerformanceScreen.render({
        fetchJson,
        performancePath,
        escapeHtml,
        setPeriodicData: (data) => { periodicDataCache = data; },
        activateTab: (tab, activeButton, otherButton) => {
            periodicActiveTab = tab;
            activeButton.classList.add('active');
            if (otherButton) otherButton.classList.remove('active');
            updatePeriodicPerformanceUI();
        },
        updatePeriodicUi: updatePeriodicPerformanceUI,
        renderForward: renderStrategyForwardPerformance,
    });
}

function renderPeriodicCanvasFallback(canvas, dataList) {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, canvas.clientWidth || 900);
    const height = Math.max(240, canvas.clientHeight || 320);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const series = [
        { key: 'realized_pnl_rate', label: '성과 등락', color: '#3b82f6' },
        { key: 'holding_change_pct', label: '보유주식 등락', color: '#22c55e' },
        { key: 'kospi_change_pct', label: 'KOSPI 등락', color: '#f59e0b' },
        { key: 'kosdaq_change_pct', label: 'KOSDAQ 등락', color: '#a855f7' },
    ];
    const values = series.flatMap(item => dataList
        .map(row => row[item.key])
        .filter(value => value !== null && typeof value !== 'undefined')
        .map(Number)
        .filter(Number.isFinite));
    const bound = Math.max(1, ...values.map(value => Math.abs(value)));
    const left = 54;
    const right = 18;
    const top = 42;
    const bottom = 38;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const xAt = index => left + (dataList.length <= 1 ? plotWidth / 2 : index * plotWidth / (dataList.length - 1));
    const yAt = value => top + plotHeight / 2 - (value / bound) * (plotHeight / 2);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    [-bound, 0, bound].forEach(value => {
        const y = yAt(value);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();
        ctx.fillText(`${value.toFixed(1)}%`, 4, y + 4);
    });
    series.forEach((item, seriesIndex) => {
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        let drawing = false;
        dataList.forEach((row, index) => {
            const value = Number(row[item.key]);
            if (row[item.key] === null || typeof row[item.key] === 'undefined' || !Number.isFinite(value)) {
                drawing = false;
                return;
            }
            if (drawing) ctx.lineTo(xAt(index), yAt(value));
            else ctx.moveTo(xAt(index), yAt(value));
            drawing = true;
        });
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.fillRect(left + seriesIndex * 125, 12, 10, 10);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(item.label, left + 15 + seriesIndex * 125, 21);
    });
    ctx.fillStyle = '#94a3b8';
    const labelIndexes = [...new Set([0, Math.floor((dataList.length - 1) / 2), dataList.length - 1])];
    labelIndexes.forEach(index => {
        const label = String(dataList[index]?.period || '');
        ctx.fillText(label, Math.max(left, Math.min(width - right - 70, xAt(index) - 30)), height - 12);
    });
}

function updatePeriodicPerformanceUI() {
    if (!periodicDataCache) return;
    setPerformanceDetailPanelOpen(false);
    
    const dataList = periodicActiveTab === 'daily' ? (periodicDataCache.daily || []) : (periodicDataCache.monthly || []);
    
    // 1. Populate the table
    const tbody = document.querySelector('#table-periodic-performance tbody');
    if (tbody) {
        tbody.innerHTML = '';
        if (!dataList.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: #94a3b8;">성과 분석 데이터가 없습니다.</td></tr>`;
        } else {
            // Sort to display latest data first in the table
            const tableDataList = [...dataList].reverse();
            tableDataList.forEach(item => {
                const tr = document.createElement('tr');
                const pnl = item.realized_pnl || 0;
                const pnlRate = item.realized_pnl_rate || 0;
                const pnlClass = pnl > 0 ? 'text-success' : (pnl < 0 ? 'text-danger' : '');
                const holdingChange = item.holding_change_pct;
                const holdingChangeClass = Number(holdingChange) > 0
                    ? 'text-success'
                    : (Number(holdingChange) < 0 ? 'text-danger' : '');
                
                tr.innerHTML = `
                    <td><strong>${escapeHtml(item.period)}</strong></td>
                    <td>${Number(item.order_count || 0).toLocaleString()}회</td>
                    <td>${formatCurrency(item.buy_amount)}</td>
                    <td>${formatCurrency(item.sell_amount)}</td>
                    <td class="${pnlClass}">${pnl > 0 ? '+' : ''}${formatCurrency(pnl)}</td>
                    <td class="${pnlClass}">${pnlRate > 0 ? '+' : ''}${pnlRate.toFixed(2)}%</td>
                    <td class="${pnl > 0 ? 'text-success' : (pnl < 0 ? 'text-danger' : '')}">${formatCurrency(item.net_cashflow)}</td>
                    <td class="${holdingChangeClass}" title="반영 ${Number(item.holding_change_symbol_count || 0)}종목 · 자료누락 ${Number(item.holding_change_missing_count || 0)}종목">${holdingChange == null ? '-' : `${Number(holdingChange) > 0 ? '+' : ''}${Number(holdingChange).toFixed(2)}%`}</td>
                    <td>${formatMarketIndex(item.kospi, item.kospi_change_pct)}</td>
                    <td>${formatMarketIndex(item.kosdaq, item.kosdaq_change_pct)}</td>
                `;
                const periodCell = tr.querySelector('td');
                if (periodCell) {
                    periodCell.innerHTML = '';
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'period-detail-button';
                    button.innerHTML = `<strong>${escapeHtml(item.period)}</strong>`;
                    button.addEventListener('click', () => renderPerformanceDetailPanel(item));
                    periodCell.appendChild(button);
                }
                if (tr.cells[1]) {
                    tr.cells[1].textContent = `${Number(item.order_count || 0).toLocaleString()}건`;
                }
                tbody.appendChild(tr);
            });
        }
    }

    renderStrategyForwardPerformance(periodicDataCache.strategy_forward || []);
    
    const canvas = document.getElementById('periodicPerformanceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (periodicChartInstance) {
        try {
            periodicChartInstance.destroy();
        } catch (e) {
            console.error('Failed to destroy previous chart instance', e);
        }
        periodicChartInstance = null;
    }
    
    if (!dataList || dataList.length === 0) {
        return;
    }

    // Keep the performance graph usable even when the external Chart.js CDN is blocked.
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js is unavailable; using the built-in canvas renderer.');
        renderPeriodicCanvasFallback(canvas, dataList);
        return;
    }
    
    const labels = dataList.map(item => item.period);
    const pnlData = dataList.map(item => item.realized_pnl || 0);
    const pnlRateData = dataList.map(item => item.realized_pnl_rate || 0);
    const holdingChangeData = dataList.map(item => item.holding_change_pct ?? null);
    const kospiChangeData = dataList.map(item => item.kospi_change_pct ?? null);
    const kosdaqChangeData = dataList.map(item => item.kosdaq_change_pct ?? null);
    
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Noto Sans KR', 'Inter', sans-serif";
    
    // Dynamic bar colors based on profit/loss
    const barColors = pnlData.map(val => val >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)');
    const borderColors = pnlData.map(val => val >= 0 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)');
    
    try {
        periodicChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: '실현손익 (원)',
                        data: pnlData,
                        backgroundColor: barColors,
                        borderColor: borderColors,
                        borderWidth: 1,
                        yAxisID: 'y1',
                        borderRadius: 4
                    },
                    {
                        label: '성과 등락 (%)',
                        data: pnlRateData,
                        type: 'line',
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#ffffff',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.3,
                        yAxisID: 'y2'
                    },
                    {
                        label: '보유주식 당일 등락 (%)',
                        data: holdingChangeData,
                        type: 'line',
                        borderColor: '#22c55e',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        spanGaps: true,
                        yAxisID: 'y2'
                    },
                    {
                        label: '코스피 등락 (%)',
                        data: kospiChangeData,
                        type: 'line',
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        spanGaps: true,
                        yAxisID: 'y2'
                    },
                    {
                        label: '코스닥 등락 (%)',
                        data: kosdaqChangeData,
                        type: 'line',
                        borderColor: '#a855f7',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        spanGaps: true,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 12, color: '#f8fafc' }
                    },
                    tooltip: {
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.datasetIndex === 0) {
                                    label += formatCurrency(context.parsed.y);
                                } else {
                                    label += (context.parsed.y > 0 ? '+' : '') + Number(context.parsed.y || 0).toFixed(2) + '%';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y1: {
                        type: 'linear',
                        position: 'left',
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#94a3b8',
                            callback: function(value) {
                                const val = Number(value);
                                if (isNaN(val)) return '0';
                                if (val >= 10000 || val <= -10000) {
                                    return (val / 10000).toFixed(0) + '만';
                                }
                                return val.toLocaleString();
                            }
                        },
                        title: { display: true, text: '실현손익 (원)', color: '#22c55e' }
                    },
                    y2: {
                        type: 'linear',
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                            color: '#94a3b8',
                            callback: function(value) {
                                const val = Number(value);
                                return (isNaN(val) ? 0 : val).toFixed(1) + '%';
                            }
                        },
                        title: { display: true, text: '실현수익률 (%)', color: '#3b82f6' }
                    }
                }
            }
        });
    } catch (chartErr) {
        console.error('Chart initialization failed:', chartErr);
    }
}

function formatOptionalPercent(value) {
    return value === null || typeof value === 'undefined' ? '-' : `${Number(value).toFixed(2)}%`;
}

function formatMarketIndex(value, changePct) {
    if (value === null || typeof value === 'undefined') return '-';
    const change = changePct === null || typeof changePct === 'undefined'
        ? ''
        : ` (${Number(changePct) > 0 ? '+' : ''}${Number(changePct).toFixed(2)}%)`;
    return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${change}`;
}

function renderStrategyForwardPerformance(items) {
    const tbody = document.querySelector('#table-strategy-validation tbody');
    if (!tbody) return;
    bindPerformanceCashflowForm();
    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="11">전략이 기록된 모의 체결 데이터가 없습니다.</td></tr>';
        return;
    }
    const decisionLabels = {
        monitor: '관찰 유지', pause: '신규진입 중지 검토', reduce: '비중 축소 검토',
        increase: '비중 확대 검토', retire: '폐기 검토'
    };
    const qualityLabels = {
        strategy_unattributed: '전략 미귀속', missing_market_close: '종가 누락',
        strategy_ownership_mismatch: '전략 보유량과 매도 불일치',
        shared_symbol_attribution: '여러 전략이 같은 종목 보유',
        no_invested_capital: '투입금 없음', missing_kospi_benchmark: 'KOSPI 자료 없음',
        missing_kosdaq_benchmark: 'KOSDAQ 자료 없음',
        incomplete_kospi_contributions: '일부 KOSPI 비교시점 누락',
        incomplete_kosdaq_contributions: '일부 KOSDAQ 비교시점 누락',
        costs_not_included: '거래비용 미반영', account_identity_unavailable: '계좌 식별정보 없음',
        benchmark_uses_previous_close: '장중 지수 대신 직전 확정 종가 사용',
        synthetic_cashflow: '매수 부족분을 가상 투입금으로 처리',
        nav_unavailable: 'NAV 계산 자료 부족',
        unprocessed_trade_after_last_session: '마지막 확정 거래일 이후 체결 존재',
        missing_kospi_nav_sessions: 'KOSPI 일별 비교자료 누락',
        missing_kosdaq_nav_sessions: 'KOSDAQ 일별 비교자료 누락',
    };
    const optionalCurrency = (value) => value === null || typeof value === 'undefined' ? '-' : formatCurrency(value);
    tbody.innerHTML = items.map((item) => {
        const isAccount = item.scope === 'account';
        const brokerAccountNav = item.broker_account_nav || {};
        const strategyReturn = isAccount && brokerAccountNav.available
            ? brokerAccountNav.twr_pct
            : (item.returns?.twr_pct ?? item.return_pct);
        const kospiReturn = isAccount && brokerAccountNav.available
            ? brokerAccountNav.kospi_twr_pct
            : (item.returns?.kospi_twr_pct ?? item.kospi_return_pct);
        const kosdaqReturn = isAccount && brokerAccountNav.available
            ? brokerAccountNav.kosdaq_twr_pct
            : (item.returns?.kosdaq_twr_pct ?? item.kosdaq_return_pct);
        const excess = isAccount && brokerAccountNav.available
            ? brokerAccountNav.excess_twr_vs_kospi_pct
            : (item.returns?.excess_twr_vs_kospi_pct ?? item.excess_vs_kospi_pct);
        const quality = item.quality || {};
        const qualityText = quality.status === 'blocked' ? '계산 차단' : '사용 가능(제약)';
        const nav = isAccount && brokerAccountNav.available
            ? { available: true, current_index: 100 + Number(brokerAccountNav.twr_pct), max_drawdown_pct: brokerAccountNav.max_drawdown_pct }
            : (item.nav || {});
        const navText = nav.available
            ? `NAV ${Number(nav.current_index).toFixed(2)} · MDD ${formatOptionalPercent(nav.max_drawdown_pct)}`
            : 'NAV 산출 불가';
        const qualityIssues = [...new Set([
            ...(quality.blocking_issues || []), ...(quality.warnings || []),
            ...(item.quality_issues || []),
        ])];
        const qualityDetail = qualityIssues
            .map((code) => qualityLabels[code] || code)
            .join(', ');
        const qualitySummary = qualityIssues.length ? `문제 ${qualityIssues.length}건` : '이상 없음';
        return `
            <tr>
                <td><strong>${escapeHtml(item.strategy_name || item.strategy_id)}</strong><div class="time-muted">${escapeHtml(item.strategy_id || '')}</div></td>
                <td>${escapeHtml(item.started_at || '-')}<div class="time-muted">~ ${escapeHtml(item.as_of || '-')}</div></td>
                <td>${formatCurrency(item.net_contribution || 0)}<div class="time-muted">가상 현금흐름</div></td>
                <td>${optionalCurrency(item.current_equity)}</td>
                <td class="${Number(strategyReturn) > 0 ? 'text-success' : Number(strategyReturn) < 0 ? 'text-danger' : ''}">${formatOptionalPercent(strategyReturn)}<div class="time-muted">비용 미반영</div></td>
                <td>${formatOptionalPercent(kospiReturn)}</td>
                <td>${formatOptionalPercent(kosdaqReturn)}</td>
                <td class="${Number(excess) > 0 ? 'text-success' : Number(excess) < 0 ? 'text-danger' : ''}">${formatOptionalPercent(excess)}<div class="time-muted">KOSPI 대비</div></td>
                <td class="strategy-quality-cell">${pill(qualityText, quality.status === 'blocked' ? 'sell' : 'hold')}<span class="strategy-validation-reason" title="${escapeHtml(qualityDetail)}">${escapeHtml(qualitySummary)}</span><div class="time-muted strategy-nav-summary">${escapeHtml(navText)}</div></td>
                <td>${isAccount ? '<span class="time-muted">계좌 전체</span>' : `<select class="strategy-review-decision" data-id="${escapeHtml(item.strategy_id)}">
                    ${Object.entries(decisionLabels).map(([value, label]) => `<option value="${value}" ${item.review_decision === value ? 'selected' : ''}>${label}</option>`).join('')}
                </select>`}</td>
                <td>${isAccount ? '-' : `<input type="text" class="strategy-review-note" data-id="${escapeHtml(item.strategy_id)}" value="${escapeHtml(item.review_note || '')}" maxlength="1000" placeholder="판단 근거"><button type="button" class="button-ghost compact-button save-strategy-review" data-id="${escapeHtml(item.strategy_id)}">저장</button>`}</td>
            </tr>
        `;
    }).join('');
    tbody.querySelectorAll('.save-strategy-review').forEach((button) => {
        button.addEventListener('click', async () => {
            const id = button.dataset.id;
            const decision = tbody.querySelector(`.strategy-review-decision[data-id="${CSS.escape(id)}"]`)?.value || 'monitor';
            const note = tbody.querySelector(`.strategy-review-note[data-id="${CSS.escape(id)}"]`)?.value || '';
            try {
                setButtonBusy(button, true);
                const response = await fetch(`/api/performance/forward/${encodeURIComponent(id)}/review`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision, note }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.detail || `저장 실패: ${response.status}`);
                button.textContent = '저장됨';
                button.dataset.savedAt = payload.review?.reviewed_at || '';
                setStatus('전략 수동 검토 의견을 저장했습니다. 자동매매 상태는 변경되지 않았습니다.', true);
            } catch (error) {
                setStatus(`수동 검토 저장 실패: ${error.message}`);
            } finally {
                setButtonBusy(button, false);
            }
        });
    });
}

function bindPerformanceCashflowForm() {
    const button = document.getElementById('btn-save-performance-cashflow');
    if (!button || button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', async () => {
        const occurredInput = document.getElementById('performance-cashflow-at');
        const amountInput = document.getElementById('performance-cashflow-amount');
        const kindInput = document.getElementById('performance-cashflow-kind');
        const noteInput = document.getElementById('performance-cashflow-note');
        const confirmedInput = document.getElementById('performance-cashflow-confirmed');
        const amount = Number(amountInput?.value);
        const occurredDate = occurredInput?.value ? new Date(occurredInput.value) : null;
        if (!occurredDate || Number.isNaN(occurredDate.getTime()) || !Number.isFinite(amount) || amount === 0) {
            setStatus('발생 시각과 0이 아닌 금액을 입력해 주세요.');
            return;
        }
        try {
            setButtonBusy(button, true);
            const response = await fetch('/api/performance/account-cashflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    external_ref: `manual-${Date.now()}`,
                    occurred_at: occurredDate.toISOString(),
                    amount,
                    kind: kindInput?.value || 'other',
                    confirmed: Boolean(confirmedInput?.checked),
                    note: noteInput?.value || '',
                }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.detail || `저장 실패: ${response.status}`);
            setStatus('계좌 현금흐름을 저장했습니다. 다음 성과 조회부터 반영됩니다.', true);
            if (amountInput) amountInput.value = '';
            if (noteInput) noteInput.value = '';
        } catch (error) {
            setStatus(`계좌 현금흐름 저장 실패: ${error.message}`);
        } finally {
            setButtonBusy(button, false);
        }
    });
}

async function renderExecutionPlan() {
    const request = captureStrategyRequest();
    const btn = document.getElementById('btn-execution-plan');
    setButtonBusy(btn, true);
    setTableMessage('#table-execution-plan tbody', 8, '실행 계획 불러오는 중...');
    try {
        const data = await fetchJson(await commonAnalysisPath('/api/execution-plan'));
        if (!isCurrentStrategyRequest(request)) return;
        captureAnalysisCycle(data);
        const plan = data.plan || [];

        const summaryEl = document.getElementById('execution-plan-summary');
        if (summaryEl) {
            const haltBadge = data.daily_loss_halt
                ? ' <span class="badge badge-sell">손실한도 초과 — 신규매수 중단</span>'
                : '';
            summaryEl.innerHTML =
                `<span>모드: <strong>${escapeHtml(data.mode || 'live')}</strong></span>` +
                ` <span>예수금: <strong>${formatCurrency(data.cash)}</strong></span>` +
                ` <span>잔여예수금: <strong>${formatCurrency(data.remaining_cash)}</strong></span>` +
                ` <span>스캔: <strong>${data.scanned || 0}종목</strong></span>` +
                haltBadge;
        }

        const tbody = document.querySelector('#table-execution-plan tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!plan.length) {
            setTableMessage('#table-execution-plan tbody', 8, '실행 계획이 없습니다');
            return;
        }

        plan.forEach((row) => {
            const action = String(row.action || '').toLowerCase();
            const actionBadge = action === 'buy'
                ? pill('매수', 'buy')
                : action === 'sell'
                ? pill('매도', 'sell')
                : pill('보유', 'hold');

            const decision = row.decision || '';
            const decisionBadge = decision === 'execute'
                ? pill('실행', 'buy')
                : decision === 'queue'
                ? pill('대기', 'warn')
                : decision === 'failed'
                ? pill('실패', 'sell')
                : decision === 'hold'
                ? pill('보유', 'hold')
                : decision
                ? pill(decision, 'hold')
                : '-';

            const reason = escapeHtml(translateReason(row.reason || '-'));
            const estimated = row.estimated_cost || (row.qty && row.price ? row.qty * row.price : 0);

            const queueBtn = decision === 'queue'
                ? '<span class="time-muted">대기중</span>'
                : `<button type="button" class="queue-order button-ghost"
                    data-symbol="${escapeHtml(row.symbol)}"
                    data-name="${escapeHtml(row.name || row.symbol)}"
                    data-action="${escapeHtml(row.action)}"
                    data-qty="${row.qty}"
                    data-price="${row.price}"
                    data-reason="${escapeHtml(row.reason || '')}"
                    data-source="execution_plan"
                    style="padding:3px 8px;font-size:0.75rem;">승인큐</button>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="symbol-name">${escapeHtml(row.name || row.symbol)}</span></td>
                <td>${actionBadge}</td>
                <td>${Number(row.qty || 0).toLocaleString()}</td>
                <td>${formatCurrency(row.price)}</td>
                <td>${formatCurrency(estimated)}</td>
                <td><div class="reason-cell" title="${reason}">${reason}</div></td>
                <td>${decisionBadge}</td>
                <td>${queueBtn}</td>
            `;
            tbody.appendChild(tr);
        });
        bindQueueButtons();
    } catch (err) {
        setTableMessage('#table-execution-plan tbody', 8, err.message);
    } finally {
        setButtonBusy(btn, false);
    }
}

async function fetchDashboardData() {
    try {
        await renderConfig();
    } catch (err) {
        console.error("Failed to load config:", err);
    }
    // Watchlist and other strategy-scoped requests must run after the server-selected
    // strategy has populated the dropdown. Otherwise the template's placeholder or
    // a stale browser value can incorrectly request an empty isolated watchlist.
    await syncStrategiesToDropdown();
    await Promise.all([
        renderRuntime(),
        renderBalance(),
        renderTrades(),
        renderOpenOrders(),
        renderReconciliationIssues(),
        renderApprovals(),
        renderCandidateHistory(),
        renderStrategyContext(),
        renderAiStrategies(),
        renderWatchlist()
    ]);
}

// 매수후보 포착 히스토리 새로고침 버튼 바인딩
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[data-dashboard-tab="market-regime"]')?.addEventListener('click', loadMarketRegimeDashboard);
    document.getElementById('btn-refresh-market-regime')?.addEventListener('click', refreshMarketRegimeData);
    configureStrategyLookupTab();
    document.getElementById('select-performance-scope')?.addEventListener('change', () => {
        renderTrades();
    });
    const histRefreshBtn = document.getElementById('btn-candidates-history-refresh');
    if (histRefreshBtn) {
        histRefreshBtn.addEventListener('click', async () => {
            setButtonBusy(histRefreshBtn, true);
            await renderCandidateHistory();
            setButtonBusy(histRefreshBtn, false);
        });
    }

    const aiRefreshBtn = document.getElementById('btn-refresh-ai-strategies');
    if (aiRefreshBtn) {
        aiRefreshBtn.addEventListener('click', async () => {
            setButtonBusy(aiRefreshBtn, true);
            await Promise.all([syncStrategiesToDropdown(), renderStrategyContext(), renderAiStrategies()]);
            setButtonBusy(aiRefreshBtn, false);
        });
    }
    document.querySelectorAll('.easy-strategy-preset').forEach((button) => {
        button.addEventListener('click', async () => {
            const category = button.getAttribute('data-preset');
            if (chooseAiStrategyCategory(category)) {
                await renderAiStrategies();
                setStatus(`${strategyScheduleCategoryLabel({ schedule_category: category })} 전략을 선택했습니다. '스케줄 적용' 버튼을 눌러 반영하세요.`, true);
            }
        });
    });
    const advancedStrategyBtn = document.getElementById('btn-toggle-advanced-strategy');
    if (advancedStrategyBtn) {
        advancedStrategyBtn.addEventListener('click', () => {
            const panel = document.querySelector('.panel-add-ai-strategy');
            if (!panel) return;
            panel.hidden = !panel.hidden;
            if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
    const auditRefreshBtn = document.getElementById('btn-refresh-strategy-audit');
    if (auditRefreshBtn) {
        auditRefreshBtn.addEventListener('click', async () => {
            setButtonBusy(auditRefreshBtn, true);
            await renderStrategyAudit();
            setButtonBusy(auditRefreshBtn, false);
        });
    }

    const addAiForm = document.getElementById('form-add-ai-strategy');
    if (addAiForm) {
        addAiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = addAiForm.querySelector('button[type="submit"]');
            setButtonBusy(submitBtn, true);

            const formData = new FormData(addAiForm);
            const payload = {
                name: formData.get('strat_name'),
                model: formData.get('strat_model'),
                weight: parseFloat(formData.get('strat_weight')),
                description: formData.get('strat_desc') || '',
                profile: {
                    min_rule_score_for_ai: parseFloat(formData.get('strat_min_rule_score') || '1.5'),
                    min_ai_confidence: parseFloat(formData.get('strat_min_confidence') || '0.6'),
                    allow_candidate_promotion: formData.get('strat_allow_promotion') === 'true'
                }
            };

            try {
                await postJson('/api/ai-strategies', payload);
                setStatus('신규 AI 전략이 성공적으로 등록되었습니다.', true);
                addAiForm.reset();
                const weightInput = addAiForm.querySelector('input[name="strat_weight"]');
                if (weightInput) weightInput.value = "0.4";
                const ruleInput = addAiForm.querySelector('input[name="strat_min_rule_score"]');
                if (ruleInput) ruleInput.value = "1.5";
                const confInput = addAiForm.querySelector('input[name="strat_min_confidence"]');
                if (confInput) confInput.value = "0.6";
                const promoInput = addAiForm.querySelector('select[name="strat_allow_promotion"]');
                if (promoInput) promoInput.value = "false";
                
                await Promise.all([renderAiStrategies(), syncStrategiesToDropdown(), renderStrategyContext()]);
            } catch (err) {
                setStatus(`전략 추가 실패: ${err.message}`);
            } finally {
                setButtonBusy(submitBtn, false);
            }
        });
    }

    const applySelectedBtn = document.getElementById('btn-apply-selected-strategies');
    if (applySelectedBtn) {
        applySelectedBtn.addEventListener('click', async () => {
            setButtonBusy(applySelectedBtn, true);
            try {
                const selectedIds = Array.from(aiStrategyDraftSelection || []).filter((id) =>
                    aiStrategyCatalog.some((strategy) =>
                        strategy.id === id && isSharedScheduleSelectable(strategy)
                    )
                );
                await postJson('/api/ai-strategies/selection', {
                    strategy_ids: selectedIds,
                });
                const applyResult = selectedIds.length
                    ? await postJson('/api/ai-strategies/apply-selected', {})
                    : { applied_strategy_ids: [] };
                aiStrategySelectionDirty = false;
                await Promise.all([renderAiStrategies(), syncStrategiesToDropdown(), renderStrategyContext(), renderScheduleInfo()]);

                const select = document.getElementById('select-ai-ranker');
                if (select && select.options.length > 0) {
                    const data = await fetchJson('/api/ai-strategies');
                    const activeStrats = data.strategies.filter(
                        (strategy) => strategy.selected && !['retired', 'suspended', 'review_required'].includes(strategy.status) && !strategy.independent_schedule
                    );
                    if (activeStrats.length > 0) {
                        select.value = activeStrats[0].id;
                        localStorage.setItem('hanstock_ai_ranker', select.value);
                    }
                }
                const appliedCount = (applyResult.applied_strategy_ids || []).length;
                setStatus(
                    appliedCount
                        ? `AI 전략 ${appliedCount}개를 공용 스케줄에 적용했습니다.`
                        : '공용 스케줄의 AI 전략을 모두 해제했습니다.',
                    true
                );
            } catch (err) {
                setStatus(`전략 스케줄 적용 실패: ${err.message}`);
            } finally {
                setButtonBusy(applySelectedBtn, false);
            }
        });
    }

    // 관심 종목 수동 추가 폼 바인딩
    const addWatchlistForm = document.getElementById('form-watchlist-add');
    if (addWatchlistForm) {
        addWatchlistForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = addWatchlistForm.querySelector('button[type="submit"]');
            setButtonBusy(submitBtn, true);
            
            const formData = new FormData(addWatchlistForm);
            const rawVal = formData.get('watchlist_code');
            const symbol = rawVal.trim ? rawVal.trim() : rawVal;
            
            try {
                const strategyId = getActiveStrategyId();
                const res = await postJson('/api/watchlist', {
                    symbol: symbol,
                    strategy_id: strategyId || null,
                });
                setStatus(`관심 종목에 성공적으로 추가되었습니다: ${res.name} (${res.symbol})`, true);
                addWatchlistForm.reset();
                await renderWatchlist();
            } catch (err) {
                setStatus(`관심 종목 추가 실패: ${err.message}`);
            } finally {
                setButtonBusy(submitBtn, false);
            }
        });
    }

    const watchlistPolicyForm = document.getElementById('form-watchlist-policy');
    if (watchlistPolicyForm) {
        watchlistPolicyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = watchlistPolicyForm.querySelector('button[type="submit"]');
            const minPrice = Number(document.getElementById('num-watchlist-min-price')?.value || 0);
            const minMarketCapEok = Number(
                document.getElementById('num-watchlist-min-market-cap')?.value || 0
            );
            if (!Number.isFinite(minPrice) || !Number.isFinite(minMarketCapEok)) {
                setStatus('관심종목 정책 값은 숫자로 입력해 주세요.');
                return;
            }
            setButtonBusy(submitBtn, true);
            try {
                const result = await postJson('/api/watchlist/policy', {
                    enabled: document.getElementById('chk-watchlist-policy-enabled')?.checked !== false,
                    min_price: minPrice,
                    min_market_cap: minMarketCapEok * 100000000,
                    require_mid_large_when_market_cap_unknown:
                        document.getElementById('chk-watchlist-mid-large-fallback')?.checked !== false,
                });
                setStatus(
                    `관심종목 정책 적용 완료: 최소 ${formatNumber(result.policy.min_price)}원, ` +
                    `최소 시총 ${formatNumber(result.policy.min_market_cap / 100000000)}억원`,
                    true
                );
                await renderWatchlist();
            } catch (err) {
                setStatus(`관심종목 정책 저장 실패: ${err.message}`);
            } finally {
                setButtonBusy(submitBtn, false);
            }
        });
    }

    ['select-watchlist-policy-filter', 'select-watchlist-sector-filter'].forEach((id) => {
        const select = document.getElementById(id);
        if (select) select.addEventListener('change', drawWatchlist);
    });

    // AI 자동 추가 적용 토글 및 임계값 제어 바인딩
    const chkWatchlistAiAuto = document.getElementById('chk-watchlist-ai-auto');
    const numWatchlistAiThreshold = document.getElementById('num-watchlist-ai-threshold');
    
    async function syncWatchlistSettings() {
        if (!chkWatchlistAiAuto) return;
        const checked = chkWatchlistAiAuto.checked;
        const threshold = numWatchlistAiThreshold ? parseFloat(numWatchlistAiThreshold.value) : 3.0;
        try {
            await postJson('/api/watchlist/toggle-auto', { enabled: checked, threshold: threshold });
            setStatus(`AI 자동 관심 종목 추가설정(여부: ${checked ? '활성화' : '비활성화'}, 기준: ${threshold}점)이 반영되었습니다.`, true);
        } catch (err) {
            setStatus(`AI 자동 추가설정 동기화 실패: ${err.message}`);
        }
    }

    if (chkWatchlistAiAuto) {
        chkWatchlistAiAuto.addEventListener('change', syncWatchlistSettings);
    }
    if (numWatchlistAiThreshold) {
        numWatchlistAiThreshold.addEventListener('change', syncWatchlistSettings);
    }

    // AI 자동 즉시 스캔 가동 버튼 바인딩
    const btnWatchlistAiScan = document.getElementById('btn-watchlist-ai-scan');
    if (btnWatchlistAiScan) {
        btnWatchlistAiScan.addEventListener('click', async () => {
            setButtonBusy(btnWatchlistAiScan, true);
            setStatus('AI 자동추가 즉시 스캔이 가동되었습니다. 시장 유니버스를 실시간 탐색 중입니다...', true);
            
            try {
                const threshold = numWatchlistAiThreshold ? parseFloat(numWatchlistAiThreshold.value) : 3.0;
                const enabled = chkWatchlistAiAuto ? chkWatchlistAiAuto.checked : true;
                const res = await postJson('/api/watchlist/scan-trigger', {
                    enabled,
                    threshold
                });
                const usedThreshold = Number(res.threshold_used ?? threshold);
                if (res.added_count > 0) {
                    const names = res.added_symbols.map(s => `${s.name}(${s.symbol})`).join(', ');
                    setStatus(
                        `AI 스캔 완료: ${usedThreshold}점 이상 ${res.eligible_count || 0}개, ` +
                        `기등록 ${res.already_registered_count || 0}개, 신규 추가 ${res.added_count}개: ${names}`,
                        true
                    );
                } else {
                    setStatus(
                        `AI 스캔 완료: 기준 ${usedThreshold}점, 대상 ${res.eligible_count || 0}개, ` +
                        `기등록 ${res.already_registered_count || 0}개, 신규 추가 0개. ` +
                        `기존 관심종목은 기준 변경만으로 자동 삭제되지 않습니다. (분석: ${res.scanned}종목)`,
                        true
                    );
                }
                await renderWatchlist();
            } catch (err) {
                setStatus(`AI 즉시 스캔 실패: ${err.message}`);
            } finally {
                setButtonBusy(btnWatchlistAiScan, false);
            }
        });
    }
    const btnSignals = document.getElementById('btn-signals');
    if (btnSignals) {
        btnSignals.addEventListener('click', renderSignals);
    }

    const btnSyncTrades = document.getElementById('btn-sync-trades');
    if (btnSyncTrades) {
        btnSyncTrades.addEventListener('click', async () => {
            btnSyncTrades.disabled = true;
            btnSyncTrades.textContent = '동기화 중...';
            btnSyncTrades.style.backgroundColor = '#f59e0b'; // warning yellow
            btnSyncTrades.style.color = 'white';
            try {
                const result = await postJson('/api/trades/sync', {});
                renderTradeSyncResult(result);
                setStatus('증권사 기록 동기화를 백그라운드에서 시작했습니다.', true);
                startTradeSyncPolling();
            } catch (err) {
                setStatus(`동기화 실패: ${err.message}`);
                btnSyncTrades.textContent = '동기화 실패';
                btnSyncTrades.style.backgroundColor = '#ef4444'; // error red
                btnSyncTrades.style.color = 'white';
                
                setTimeout(() => {
                    btnSyncTrades.disabled = false;
                    btnSyncTrades.textContent = '증권사 기록 동기화';
                    btnSyncTrades.style.backgroundColor = '';
                    btnSyncTrades.style.color = '';
                }, 3000);
            }
        });
    }

    const btnCandidates = document.getElementById('btn-candidates');
    if (btnCandidates) {
        btnCandidates.addEventListener('click', previewSelectedStrategies);
    }
    const btnRefreshStrategyLookup = document.getElementById('btn-refresh-strategy-lookup');
    if (btnRefreshStrategyLookup) {
        btnRefreshStrategyLookup.addEventListener('click', refreshStrategyLookup);
    }
    const btnExecutionPlan = document.getElementById('btn-execution-plan');
    if (btnExecutionPlan) {
        btnExecutionPlan.addEventListener('click', renderExecutionPlan);
    }
    const btnApprovals = document.getElementById('btn-approvals');
    if (btnApprovals) {
        btnApprovals.addEventListener('click', renderApprovals);
    }
    const btnRefreshOpenOrders = document.getElementById('btn-refresh-open-orders');
    if (btnRefreshOpenOrders) {
        btnRefreshOpenOrders.addEventListener('click', async () => {
            setButtonBusy(btnRefreshOpenOrders, true);
            try {
                await Promise.all([renderOpenOrders(), renderApprovals()]);
            } finally {
                setButtonBusy(btnRefreshOpenOrders, false);
            }
        });
    }
    const btnSyncOrderHoldings = document.getElementById('btn-sync-order-holdings');
    if (btnSyncOrderHoldings) {
        btnSyncOrderHoldings.addEventListener('click', startBrokerHoldingsSync);
    }
    const btnRefreshReconciliation = document.getElementById('btn-refresh-reconciliation');
    if (btnRefreshReconciliation) {
        btnRefreshReconciliation.addEventListener('click', async () => {
            setButtonBusy(btnRefreshReconciliation, true);
            try {
                await Promise.all([renderReconciliationIssues(), renderApprovals()]);
            } finally {
                setButtonBusy(btnRefreshReconciliation, false);
            }
        });
    }
    const btnApplyBrokerBalance = document.getElementById('btn-apply-broker-balance');
    if (btnApplyBrokerBalance) {
        btnApplyBrokerBalance.addEventListener('click', () => applyBrokerBalanceReconciliation());
    }
    const btnResolveAllReconciliation = document.getElementById('btn-resolve-all-reconciliation');
    if (btnResolveAllReconciliation) {
        btnResolveAllReconciliation.addEventListener('click', resolveAllReconciliationIssues);
    }
    const btnRetryApprovalsBatch = document.getElementById('btn-retry-approvals-batch');
    if (btnRetryApprovalsBatch) {
        btnRetryApprovalsBatch.addEventListener('click', () => executeApprovalBatch('retry'));
    }
    const btnCancelRetryApprovalsBatch = document.getElementById('btn-cancel-retry-approvals-batch');
    if (btnCancelRetryApprovalsBatch) {
        btnCancelRetryApprovalsBatch.addEventListener('click', () => executeApprovalBatch('cancel-retry'));
    }
    const btnAiAllocation = document.getElementById('btn-ai-allocation');
    if (btnAiAllocation) {
        btnAiAllocation.addEventListener('click', renderAiAllocation);
    }
    const btnOptimizer = document.getElementById('btn-optimizer');
    if (btnOptimizer) {
        btnOptimizer.addEventListener('click', renderOptimizer);
    }
    const btnOptimizerBatch = document.getElementById('btn-optimizer-batch');
    if (btnOptimizerBatch) {
        btnOptimizerBatch.addEventListener('click', processOptimizerBatch);
    }
    const btnAutoApproval = document.getElementById('btn-auto-approval');
    if (btnAutoApproval) {
        btnAutoApproval.addEventListener('click', toggleAutoApproval);
    }
    const btnSellAllHoldings = document.getElementById('btn-sell-all-holdings');
    if (btnSellAllHoldings) {
        btnSellAllHoldings.addEventListener('click', sellAllHoldings);
    }
    const btnSyncHoldings = document.getElementById('btn-sync-holdings');
    if (btnSyncHoldings) {
        btnSyncHoldings.addEventListener('click', startBrokerHoldingsSync);
    }
    const btnRefreshHoldings = document.getElementById('btn-refresh-holdings');
    if (btnRefreshHoldings) {
        btnRefreshHoldings.addEventListener('click', async () => {
            setButtonBusy(btnRefreshHoldings, true);
            btnRefreshHoldings.textContent = '새로고침 중...';
            try {
                await renderBalance();
            } finally {
                btnRefreshHoldings.textContent = '새로고침';
                setButtonBusy(btnRefreshHoldings, false);
            }
        });
    }
    const holdingStrategySelect = document.getElementById('select-holding-strategy-filter');
    if (holdingStrategySelect) {
        holdingStrategySelect.addEventListener('change', () => {
            holdingStrategyFilter = holdingStrategySelect.value || 'all';
            renderHoldingRows();
        });
    }
    const holdingPnlSelect = document.getElementById('select-holding-pnl-filter');
    if (holdingPnlSelect) {
        holdingPnlSelect.addEventListener('change', () => {
            holdingPnlFilter = holdingPnlSelect.value || 'all';
            renderHoldingRows();
        });
    }
    const btnDryRun = document.getElementById('btn-dry-run');
    if (btnDryRun) {
        btnDryRun.addEventListener('click', () => toggleRuntimeOrderMode('btn-dry-run', 'DRY_RUN', '주문차단'));
    }

    setTableMessage('#table-signals tbody', 7, '진단하기를 누르면 보유 종목 신호를 확인합니다');
    setTableMessage('#table-candidates tbody', 9, '찾기를 누르면 관심종목에서 매수 후보를 검색합니다');
    setTableMessage('#table-execution-plan tbody', 8, '불러오기를 누르면 다음 사이클 실행 계획을 표시합니다');
    setTableMessage('#table-approvals tbody', 10, '승인 대기 주문이 없습니다');
    setTableMessage('#table-ai-allocation tbody', 8, '계산을 누르면 AI 목표 비중을 확인합니다');
    setTableMessage('#table-optimizer tbody', 7, '최적화를 누르면 리스크 기반 목표 비중을 확인합니다');
    
    fetchDashboardData();
    
    setInterval(() => Promise.all([
        renderRuntime(),
        syncStrategiesToDropdown(),
        refreshCommonDashboardTab(getActiveDashboardTab())
    ]).catch(err => console.error("Polling error:", err)), 30000);
});

window.showAiModal = function(element) {
    const payloadText = element.getAttribute('data-ai-payload');
    const titleEl = document.getElementById('aiModalTitle');
    const subtitleEl = document.getElementById('aiModalSubtitle');
    const bodyEl = document.getElementById('aiModalBody');

    if (!titleEl || !bodyEl) {
        return;
    }

    if (payloadText) {
        try {
            const payload = JSON.parse(decodeURIComponent(payloadText));
            titleEl.textContent = `${payload.name || payload.symbol || 'AI 전략'} 상세 근거`;
            if (subtitleEl) {
                subtitleEl.textContent = payload.ai_strategy_name || '';
            }
            bodyEl.innerHTML = buildAiModalMarkup(payload);
        } catch (_err) {
            const reasonText = element.getAttribute('data-reason') || '-';
            titleEl.textContent = 'AI 전략 상세 근거';
            if (subtitleEl) {
                subtitleEl.textContent = '';
            }
            bodyEl.textContent = reasonText;
        }
    } else {
        const reasonText = element.getAttribute('data-reason') || '-';
        titleEl.textContent = 'AI 전략 상세 근거';
        if (subtitleEl) {
            subtitleEl.textContent = '';
        }
        bodyEl.textContent = reasonText;
    }
    setAiModalOpen(true);
};

window.addEventListener('load', () => {
    const aiModal = document.getElementById('aiModal');
    const ncModal = document.getElementById('noCandidatesModal');
    const closePerformanceDetailBtn = document.getElementById('btn-close-performance-detail');

    // 닫기 버튼 — 모든 .close-modal 버튼을 각 모달 컨텍스트로 연결
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            setAiModalOpen(false);
            setNoCandidatesModalOpen(false);
        });
    });
    if (closePerformanceDetailBtn) {
        closePerformanceDetailBtn.addEventListener('click', () => setPerformanceDetailPanelOpen(false));
    }

    window.addEventListener('click', (event) => {
        if (event.target === aiModal) setAiModalOpen(false);
        if (event.target === ncModal) setNoCandidatesModalOpen(false);
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setAiModalOpen(false);
            setNoCandidatesModalOpen(false);
        }
    });

    // AI 전략 컨트롤 드롭다운 초기화 및 바인딩
    const rankerSelect = document.getElementById('select-ai-ranker');
    const optimizerSelect = document.getElementById('select-portfolio-optimizer');
    const applyBtn = document.getElementById('btn-apply-strategy');
    
    if (rankerSelect) {
        const savedRanker = localStorage.getItem('hanstock_ai_ranker');
        if (savedRanker) rankerSelect.value = savedRanker;
        rankerSelect.addEventListener('change', async () => {
            localStorage.setItem('hanstock_ai_ranker', rankerSelect.value);
            await postJson(`/api/ai-strategies/${encodeURIComponent(rankerSelect.value)}/select`, {
                selected: true,
            });
            invalidateCommonTabRefreshes();
            await refreshCommonDashboardTab(getActiveDashboardTab(), { force: true });
        });
    }
    
    if (optimizerSelect) {
        const savedOptimizer = localStorage.getItem('hanstock_portfolio_optimizer');
        if (savedOptimizer) optimizerSelect.value = savedOptimizer;
        optimizerSelect.addEventListener('change', () => {
            localStorage.setItem('hanstock_portfolio_optimizer', optimizerSelect.value);
        });
    }
    
    if (applyBtn) {
        applyBtn.addEventListener('click', renderCandidates);
    }


    // ----------------------------------------------------
    // Scheduler Tab Manual Run Buttons Binding
    // ----------------------------------------------------
    const btnRunDailyAuto = document.getElementById('btn-run-daily-auto');
    const btnRunAnalysisOnly = document.getElementById('btn-run-analysis-only');
    const btnRunExecute = document.getElementById('btn-run-execute');
    const btnSaveAiSchedule = document.getElementById('btn-save-ai-schedule');
    const schedulerResultPeriod = document.getElementById('sched-result-period');

    if (btnRunDailyAuto) {
        btnRunDailyAuto.addEventListener('click', () => triggerSchedule('daily_auto'));
    }
    if (btnRunAnalysisOnly) {
        btnRunAnalysisOnly.addEventListener('click', () => triggerSchedule('analysis_only'));
    }
    if (btnRunExecute) {
        btnRunExecute.addEventListener('click', () => triggerSchedule('execute'));
    }
    if (btnSaveAiSchedule) {
        btnSaveAiSchedule.addEventListener('click', async () => {
            setButtonBusy(btnSaveAiSchedule, true);
            try {
                await saveAiScheduleSettings();
                setStatus('AI 정기 스케줄을 저장했습니다.', true);
            } catch (err) {
                setStatus(`AI 정기 스케줄 저장 실패: ${err.message}`);
            } finally {
                setButtonBusy(btnSaveAiSchedule, false);
            }
        });
    }
    if (schedulerResultPeriod) {
        schedulerResultPeriod.addEventListener('change', () => {
            window._expandedRounds = new Set();
            renderScheduleInfo();
        });
    }

    // Load initial schedule info
    if (typeof renderScheduleInfo === 'function') {
        renderScheduleInfo();
    }
});

// ----------------------------------------------------
// Scheduler Tab Rendering & Operation Helpers
// ----------------------------------------------------

const AI_SCHEDULE_ID = 'ai_stock_default_v1';

async function loadAiScheduleSettings() {
    return window.HanstockDashboardAiScheduleSettings.load({ fetchJson, scheduleId: AI_SCHEDULE_ID });
}

async function saveAiScheduleSettings() {
    return window.HanstockDashboardAiScheduleSettings.save({
        fetchJson,
        postJson,
        scheduleId: AI_SCHEDULE_ID,
        renderInfo: renderScheduleInfo,
    });
}

async function renderScheduleInfo() {
    try {
        const strategyId = getActiveStrategyId();
        const period = document.getElementById('sched-result-period')?.value || 'daily';
        const params = new URLSearchParams({ period });
        if (strategyId) params.set('strategy_id', strategyId);
        const data = await fetchJson(`/api/scheduler/status?${params.toString()}`);
        await renderSchedulerStrategyChecklist(data.strategy_dispatch?.schedules || []);
        const aiSchedule = await loadAiScheduleSettings();
        const dispatch = data.strategy_dispatch || {};
        window.HanstockDashboardSchedulerOverview.render(data, aiSchedule);

        const scheduleStateEl = document.getElementById('sched-overview-schedule-state');
        if (scheduleStateEl) {
            scheduleStateEl.textContent = aiSchedule.enabled
                ? `사용 · ${Number(aiSchedule.interval_minutes || 15)}분 간격`
                : '사용 안 함';
            scheduleStateEl.className = aiSchedule.enabled ? 'is-active' : '';
        }
        const strategyCountEl = document.getElementById('sched-overview-strategy-count');
        if (strategyCountEl) {
            strategyCountEl.textContent = `사용 ${dispatch.enabled_count || 0} / 전체 ${dispatch.schedule_count || 0}`;
        }
        const overviewEnvEl = document.getElementById('sched-overview-env');
        if (overviewEnvEl) {
            overviewEnvEl.textContent = data.config.trading_env === 'real' ? '실전투자' : '모의투자';
            overviewEnvEl.className = data.config.trading_env === 'real' ? 'is-warning' : 'is-active';
        }
        
        // 1. Config / Settings
        const cronTzEl = document.getElementById('sched-cron-tz');
        if (cronTzEl) cronTzEl.textContent = data.config.cron_tz || '-';
        
        const dailyRetriesEl = document.getElementById('sched-daily-retries');
        if (dailyRetriesEl) dailyRetriesEl.textContent = `${data.config.daily_auto_retries}회`;
        
        const dailyRetryDelayEl = document.getElementById('sched-daily-retry-delay');
        if (dailyRetryDelayEl) dailyRetryDelayEl.textContent = `${data.config.daily_auto_retry_delay_seconds}초`;
        
        const retriesEl = document.getElementById('sched-retries');
        if (retriesEl) retriesEl.textContent = `${data.config.scheduler_retries}회`;
        
        const retryDelayEl = document.getElementById('sched-retry-delay');
        if (retryDelayEl) retryDelayEl.textContent = `${data.config.scheduler_retry_delay_seconds}초`;
        
        const slackEnabledEl = document.getElementById('sched-slack-enabled');
        if (slackEnabledEl) slackEnabledEl.textContent = data.config.slack_enabled === 'true' ? '활성화' : '비활성화';
        
        const syncEnabledEl = document.getElementById('sched-sync-enabled');
        if (syncEnabledEl) syncEnabledEl.textContent = data.config.sync_enabled === 'true' ? '활성화' : '비활성화';
        
        const tradingEnvEl = document.getElementById('sched-trading-env');
        if (tradingEnvEl) tradingEnvEl.textContent = data.config.trading_env === 'real' ? '실전투자' : '모의투자';

        const activeStrategyEl = document.getElementById('sched-active-strategy');
        if (activeStrategyEl) {
            const dispatchText = dispatch.summary || `사용 ${dispatch.enabled_count || 0}개 / 전체 ${dispatch.schedule_count || 0}개 / 감시종목 ${dispatch.universe_count || 0}개`;
            activeStrategyEl.textContent = `${data.active_strategy_name || '-'} (${data.active_strategy_id || '-'}) · ${dispatchText}`;
        }
        
        // 2. Dynamic status of current/last execution state
        const runState = data.run_state;
        const runStateEl = document.getElementById('sched-overview-run-state');
        if (runStateEl) {
            const modeLabel = runState.mode === 'daily_auto'
                ? 'AI 자동매매'
                : (runState.mode === 'execute' ? '주문 실행' : '분석 전용');
            runStateEl.textContent = runState.is_running ? `실행 중 · ${modeLabel}` : '대기';
            runStateEl.className = runState.is_running ? 'is-warning' : 'is-active';
        }
        const runningPanel = document.getElementById('scheduler-running-panel');
        if (runningPanel) {
            if (runState.is_running) {
                runningPanel.style.display = 'block';
                startSchedulerPolling(runState.mode);
            } else {
                runningPanel.style.display = 'none';
                if (schedulerPollInterval) {
                    clearInterval(schedulerPollInterval);
                    schedulerPollInterval = null;
                }
                // Enable trigger buttons
                disableTriggerButtons(false);
            }
        }
        
        // 3. Render last result
        const lastResult = data.last_result;
        if (lastResult) {
            const timeEl = document.getElementById('sched-last-run-time');
            if (timeEl) {
                const summaryLabel = lastResult.summary_label || '최근 실행';
                timeEl.textContent = `${summaryLabel} · 최종 실행: ${formatKstTime(lastResult.recorded_at)}`;
            }
            
            const results = lastResult.result.results || [];
            const approved = lastResult.result.auto_approved || [];
            const approvalErrors = lastResult.result.auto_approval_errors || [];
            const schedulerRuns = lastResult.result.execution_runs || [];
            const summaryCounts = lastResult.result.summary_counts || {};
            
            const summaryResult = HanstockDashboardSchedulerSummary.render(lastResult, results, approved, approvalErrors, schedulerRuns, { formatKstTime });
            const aggregateStatus = summaryResult.aggregateStatus;
            const runErrors = summaryResult.runErrors;
            // Build groups dynamically by round
            const uniqueRounds = HanstockDashboardSchedulerRounds.buildRounds({
                results, approved, approvalErrors, schedulerRuns,
                fallbackTime: lastResult.recorded_at ? lastResult.recorded_at.replace("T", " ").split(" ")[1]?.substring(0, 5) || '-' : '-',
                mode: lastResult.mode,
            });
            const sortedRoundIds = Array.from(uniqueRounds.keys()).sort((a, b) => b - a); // DESC: latest at top
            if (!window._expandedRounds) {
                window._expandedRounds = new Set();
                if (sortedRoundIds.length > 0) {
                    window._expandedRounds.add(sortedRoundIds[0]); // Expand latest round by default
                }
            }
            
            // Build collapsible rounds container HTML
            const runsContainer = document.getElementById('scheduler-runs-container');
            if (runsContainer) {
                runsContainer.innerHTML = '';
                // Daily summaries retain earlier failures for audit. Do not
                // present those historical entries as a current execution
                // error after the latest aggregate status has recovered.
                if (runErrors.length && aggregateStatus !== 'success') {
                    const errorPanel = document.createElement('div');
                    errorPanel.className = 'scheduler-status-message is-error';
                    errorPanel.style.cssText = 'margin-bottom:1rem;white-space:pre-wrap;color:var(--danger);';
                    errorPanel.innerHTML = `<strong>전체 실행 오류 ${runErrors.length}건</strong><span>${escapeHtml(runErrors.map((item) => {
                        if (typeof item === 'string') return item;
                        const target = [item?.symbol, item?.action ? toKorAction(item.action) : ''].filter(Boolean).join(' ');
                        const message = item?.message || item?.error || item?.response_msg || '알 수 없는 오류';
                        return `${target ? `${target}: ` : ''}${message}`;
                    }).join('\n'))}</span>`;
                    runsContainer.appendChild(errorPanel);
                }
                if (uniqueRounds.size === 0) {
                    runsContainer.insertAdjacentHTML('beforeend', `
                        <div class="text-center" style="color: var(--text-muted); font-size: 0.95rem; padding: 3rem 0;">
                            생성된 실행 계획 및 결과 내역이 없습니다.
                        </div>`);
                } else {
                    sortedRoundIds.forEach(round => {
                        const roundData = uniqueRounds.get(round);
                        const isExpanded = window._expandedRounds.has(round);
                        const planCount = roundData.results.length;
                        const approvedCount = roundData.approved.length + roundData.approvalErrors.length;
                        const successCount = roundData.approved.filter(a => a.status === 'executed').length;
                        const failedCount = roundData.approved.filter(a => a.status === 'failed').length + roundData.approvalErrors.length;
                        const hasFailure = failedCount > 0 || roundData.status === 'failed' || roundData.status === 'partial';
                        const isBlocked = roundData.status === 'blocked';
                        const runStatusLabels = { success: '성공', partial: '일부 실패', failed: '실패', blocked: '차단', skipped: '건너뜀' };
                        const runStatusText = runStatusLabels[roundData.status] || roundData.status || '상태 미확인';
                        const timeVal = roundData.time || '-';
                        const modeKor = roundData.mode === 'daily_auto' ? 'AI 자동매매' : (roundData.mode === 'execute' ? '주문 실행' : '분석 전용');
                        const regimePolicy = roundData.marketRegimePolicy || {};
                        const regimeAllowed = regimePolicy.allowed !== false;
                        const sourceMultiplier = marketRegimePercent(regimePolicy.source_multiplier, 0);
                        const configuredMaximum = marketRegimePercent(regimePolicy.configured_max_pct, 0);
                        const regimeSummary = regimePolicy.regime
                            ? `${marketRegimeLabel(regimePolicy.regime)} · 수집 ${sourceMultiplier} · 전략 상한 ${configuredMaximum} · 최종 ${marketRegimePercent(Number(regimePolicy.multiplier || 0), 0)} · ${regimeAllowed ? '신규매수 허용' : '신규매수 차단'}`
                            : '실행 당시 시장 국면 기록 없음';
                        const regimeReason = marketPolicyReasonLabel(regimePolicy.reason)
                            || roundData.blocked.map(marketPolicyReasonLabel).join(', ');
                        
                        // Create card element
                        const card = HanstockDashboardSchedulerRoundCard.create(round, roundData, isExpanded, {
                            escapeHtml, marketRegimeLabel, marketRegimePercent, marketPolicyReasonLabel,
                        });
                        const analysisSummary = card.querySelector('.scheduler-analysis-summary');
                        const analysisDetails = card.querySelector('.scheduler-analysis-details');
                        HanstockDashboardSchedulerAnalysis.render(roundData, analysisSummary, analysisDetails, { escapeHtml, formatNumber, pill });
                        // Populate Plans table inside this round body
                        const plansTbody = card.querySelector('.table-plans tbody');
                        if (plansTbody) {
                            if (roundData.results.length === 0) {
                                plansTbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">생성된 계획이 없습니다.</td></tr>';
                            } else {
                                HanstockDashboardSchedulerRows.appendPlanRows(plansTbody, roundData.results, {
                                    escapeHtml, pill, formatNumber, toKorAction, toKorPlanCategory,
                                    schedulerDecisionLabel, schedulerReasonText,
                                    schedulerPlanQuantityText, schedulerPlanPriceText,
                                });
                            }
                        }
                        // Populate Orders table inside this round body
                        const ordersTbody = card.querySelector('.table-orders tbody');
                        if (ordersTbody) {
                            if (roundData.approved.length === 0 && roundData.approvalErrors.length === 0) {
                                ordersTbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">승인 대기 주문이 없거나 자동 승인이 생략되었습니다.</td></tr>';
                            } else {
                                HanstockDashboardSchedulerRows.appendOrderRows(ordersTbody, roundData.approved, roundData.approvalErrors, roundData.results, {
                                    escapeHtml, pill, formatNumber, toKorAction, schedulerApprovalStatus,
                                });
                            }
                        }
                        runsContainer.appendChild(card);
                    });
                }
            }
        }
    } catch (err) {
        console.error('Failed to load schedule status:', err);
        setStatus(`스케줄 세부 내역 조회 실패: ${err.message}`);
    }
}

async function renderSchedulerStrategyChecklist(schedules = []) {
    return window.HanstockDashboardSchedulerStrategyChecklist.render({
        getActiveStrategyId,
        strategyDisplayName,
        formatKstTime,
        toKorAction,
        escapeHtml,
    }, schedules);
}

function getScheduledStrategyIds() {
    return window.HanstockDashboardSchedulerStrategyChecklist.selectedIds();
}


window.toggleRoundCollapse = function(round) {
    return window.HanstockDashboardSchedulerCollapse.toggle(round, window._expandedRounds);
};


function toKorDecision(dec) {
    return window.HanstockDashboardSchedulerFormatters.decision(dec);
}

function toKorPlanCategory(category) {
    return window.HanstockDashboardSchedulerFormatters.planCategory(category);
}




function schedulerApprovalStatus(status) {
    return window.HanstockDashboardSchedulerFormatters.approvalStatus(status);
}

function schedulerPlanQuantityText(row) {
    return window.HanstockDashboardSchedulerFormatters.planQuantity({ formatNumber }, row);
}

function schedulerPlanPriceText(row) {
    return window.HanstockDashboardSchedulerFormatters.planPrice({ formatNumber }, row);
}

function formatKstTime(isoStr) {
    return window.HanstockDashboardSchedulerFormatters.kstTime(isoStr);
}



function disableTriggerButtons(disabled) {
    return window.HanstockDashboardSchedulerActions.disableButtons(disabled);
}

async function triggerSchedule(mode) {
    return window.HanstockDashboardSchedulerActions.trigger({
        setButtonBusy,
        postJson,
        getStrategyIds: getScheduledStrategyIds,
        getActiveStrategyId,
        setStatus,
        startPolling: startSchedulerPolling,
    }, mode);
}

function startSchedulerPolling(mode) {
    return window.HanstockDashboardSchedulerActions.createPolling({
        fetchJson,
        getActiveStrategyId,
        setStatus,
        refreshAll: async () => {
            await renderScheduleInfo();
            if (typeof refreshOverview === 'function') refreshOverview();
            if (typeof renderSignals === 'function') renderSignals();
            if (typeof renderApprovals === 'function') renderApprovals();
            if (typeof renderWatchlist === 'function') renderWatchlist();
        },
    }, mode, () => schedulerPollInterval, (value) => { schedulerPollInterval = value; });
}

function copySchedulerLog() {
    const logBox = document.getElementById('scheduler-running-log');
    if (!logBox) return;
    const text = logBox.innerText || logBox.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btn-copy-scheduler-log');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '복사 완료!';
            btn.style.borderColor = '#10b981';
            btn.style.color = '#10b981';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.borderColor = '';
                btn.style.color = '';
            }, 2000);
        }
    }).catch(err => {
        alert('로그 복사 실패: ' + err);
    });
}
