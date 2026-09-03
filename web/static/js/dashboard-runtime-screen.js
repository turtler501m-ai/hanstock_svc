/* Runtime status screen rendering. Loaded before app.js. */
(function (global) {
    async function renderRuntime(deps) {
        const health = await deps.fetchJson('/api/health');
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
        const setContextState = (id, state) => {
            const element = document.getElementById(id);
            if (element) element.dataset.state = state;
        };
        setContextState('context-item-env', isReal ? 'danger' : 'good');
        setContextState('context-item-order', isLive ? 'danger' : (canSubmit ? 'good' : 'warn'));
        setContextState('context-item-approval', autoApproval ? 'warn' : 'good');
        deps.setText('runtime-env', isReal ? deps.labels.real : deps.labels.demo);
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
