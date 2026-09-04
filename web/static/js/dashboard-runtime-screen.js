/* Runtime status screen rendering. Loaded before app.js. */
(function (global) {
    async function renderRuntime(deps) {
        const [health, orderHealth] = await Promise.all([
            deps.fetchJson('/api/health'),
            deps.fetchJson('/api/operations/health'),
        ]);
        const isReal = health.trading_env === 'real';
        const isLive = Boolean(health.real_orders_enabled);
        const canSubmit = Boolean(health.order_submission_enabled);
        const autoApproval = Boolean(health.auto_approval_enabled);
        const refreshStatus = document.getElementById('dashboard-refresh-status');
        const refreshDot = document.getElementById('dashboard-refresh-dot');
        const refreshLabel = document.getElementById('dashboard-refresh-label');
        const healthState = health.ok && !health.online_access_blocked && !health.kill_switch_active
            ? (health.demo_trading_ready === false ? 'warn' : 'good')
            : 'danger';
        if (refreshStatus) refreshStatus.dataset.state = healthState;
        if (refreshDot) refreshDot.className = `dot ${healthState}`;
        if (refreshLabel) refreshLabel.textContent = healthState === 'good' ? deps.labels.healthGood : (healthState === 'warn' ? deps.labels.healthWarn : deps.labels.healthBad);
        deps.setText('dashboard-eyebrow', isReal ? deps.labels.realHeader : deps.labels.demoHeader);
        const setContextState = (id, state) => {
            const element = document.getElementById(id);
            if (element) element.dataset.state = state;
        };
        setContextState('context-item-env', isReal ? 'danger' : 'good');
        setContextState('context-item-order', isLive ? 'danger' : (canSubmit ? 'good' : 'warn'));
        setContextState('context-item-approval', autoApproval ? 'warn' : 'good');
        deps.setText('runtime-env', isReal ? deps.labels.real : deps.labels.demo);
        const operationalStatus = orderHealth.operational_status || 'unknown';
        const operationalLabels = {
            healthy: '정상', degraded: '주의', blocked: '차단', unknown: '확인 필요',
        };
        const operationalState = operationalStatus === 'healthy'
            ? 'good' : (operationalStatus === 'degraded' ? 'warn' : 'danger');
        const operationalEl = document.getElementById('runtime-operational-status');
        if (operationalEl) {
            operationalEl.innerHTML = deps.pill(operationalLabels[operationalStatus] || operationalLabels.unknown, operationalState === 'good' ? 'buy' : 'warn');
        }
        const newBuyAllowed = orderHealth.new_risk_allowed === true;
        const newBuyItem = document.getElementById('runtime-new-buy-item');
        const newBuyEl = document.getElementById('runtime-new-buy-status');
        const newBuyReason = document.getElementById('runtime-new-buy-reason');
        if (newBuyItem) newBuyItem.dataset.state = newBuyAllowed ? 'good' : 'danger';
        if (newBuyEl) newBuyEl.innerHTML = deps.pill(newBuyAllowed ? '가능' : '차단', newBuyAllowed ? 'buy' : 'sell');
        if (newBuyReason) {
            const blockers = (orderHealth.blockers || []).map((item) => `${item.code} ${item.count}건`);
            newBuyReason.textContent = newBuyAllowed ? '안전 조건 충족' : (blockers.join(', ') || '운영 안전 조건 확인 필요');
        }
        deps.setText('context-env', isReal ? deps.labels.real : deps.labels.demo);
        deps.setText(
            'context-order',
            isLive ? deps.labels.liveEnabled : (canSubmit ? deps.labels.demoOrder : deps.labels.blocked)
        );
        deps.setText('context-approval', autoApproval ? deps.labels.autoApproval : deps.labels.manualApproval);
        deps.setText('context-updated', new Date().toLocaleTimeString('ko-KR'));
        deps.setHtml('runtime-dry-run', health.dry_run ? deps.pill(deps.labels.on, 'warn') : deps.pill(deps.labels.off, 'buy'));
        deps.setHtml('runtime-order', health.order_submission_enabled ? deps.pill(deps.labels.enabled, 'buy') : deps.pill(deps.labels.blocked, 'warn'));
        deps.setHtml('runtime-real', health.real_orders_enabled ? deps.pill(deps.labels.liveEnabled, 'sell') : deps.pill(deps.labels.liveBlocked, 'hold'));
        const dryRunButton = document.getElementById('btn-dry-run');
        if (dryRunButton) {
            dryRunButton.dataset.enabled = String(Boolean(health.dry_run));
            dryRunButton.textContent = health.dry_run ? deps.labels.disable : deps.labels.enable;
        }
        const autoApprovalEnabled = autoApproval;
        const autoApprovalEl = document.getElementById('runtime-auto-approval');
        const autoApprovalButton = document.getElementById('btn-auto-approval');
        if (autoApprovalEl) autoApprovalEl.innerHTML = autoApprovalEnabled ? deps.pill(deps.labels.enabled, 'buy') : deps.pill(deps.labels.blocked, 'hold');
        if (autoApprovalButton) {
            autoApprovalButton.dataset.enabled = String(autoApprovalEnabled);
            autoApprovalButton.textContent = autoApprovalEnabled ? deps.labels.disable : deps.labels.enable;
        }
        const tokensEl = document.getElementById('runtime-tokens');
        if (tokensEl) {
            const tokens = health.token_usage || {};
            const prompt = Number(tokens.prompt_tokens || 0).toLocaleString();
            const completion = Number(tokens.completion_tokens || 0).toLocaleString();
            const total = Number(tokens.total_tokens || 0).toLocaleString();
            const calls = Number(tokens.api_calls || 0).toLocaleString();
            tokensEl.innerHTML = `${total} tkn <span style="font-size: 0.72rem; font-weight: normal; color: rgba(255,255,255,0.45); margin-left: 4px;">(P:${prompt} C:${completion}, ${calls}${deps.labels.calls})</span>`;
        }
        const syncButton = document.getElementById('btn-sync-trades');
        if (syncButton) {
            syncButton.disabled = Boolean(health.dry_run);
            syncButton.textContent = health.dry_run ? deps.labels.syncBlocked : deps.labels.sync;
            syncButton.title = health.dry_run ? deps.labels.syncBlockedTitle : '';
        }
    }
    global.HanstockDashboardRuntimeScreen = Object.freeze({ render: renderRuntime });
}(window));
