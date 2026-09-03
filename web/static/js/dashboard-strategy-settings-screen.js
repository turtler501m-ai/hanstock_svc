(function (global) {
    'use strict';

    function render(deps, config) {
        const { groups, escapeHtml } = deps;
        const settingGroups = groups(config);
        const readiness = config.technical_strategy_readiness || {};
        const rows = Array.isArray(readiness.items) ? readiness.items : [];
        const complete = rows.filter((item) => item.complete).length;
        const pct = Math.max(0, Math.min(100, Number(readiness.current_pct || 0)));
        const readinessItems = rows.map((item) => `<div class="strategy-readiness-item ${item.complete ? 'is-complete' : 'is-pending'}"><span aria-hidden="true">${item.complete ? '✓' : '!'}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(String(item.current_pct ?? 0))}%</small></div>`).join('');
        const monitor = readiness.condition_monitor || {};
        const markets = monitor.markets || {};
        const open = monitor.market_open || {};
        const monitorMarkup = [['KR', '한국'], ['US', '미국']].map(([market, label]) => {
            const row = markets[market] || {};
            const fresh = Boolean(row.fresh);
            const isOpen = Boolean(open[market]);
            return `<div class="strategy-monitor-item ${fresh ? 'is-fresh' : (isOpen ? 'is-waiting' : 'is-closed')}"><span>${label}</span><strong>${isOpen ? '장중' : '장외'} · ${escapeHtml(String(row.symbol_count || 0))}종목</strong><small>${fresh ? '최근 조건검사 반영' : (isOpen ? '조건검사 대기' : '장 시작 후 갱신')}</small></div>`;
        }).join('');
        const field = (item) => `<label class="strategy-setting-item"><span class="label">${escapeHtml(item.label)}</span><div class="setting-input-row"><input type="number" aria-label="${escapeHtml(item.label)}" name="${escapeHtml(item.key)}" value="${escapeHtml(item.value)}" step="${escapeHtml(item.step || '1')}" ${item.min !== undefined ? `min="${escapeHtml(item.min)}"` : ''} ${item.max !== undefined ? `max="${escapeHtml(item.max)}"` : ''} data-type="${escapeHtml(item.type)}" data-percent="${item.percent ? 'true' : 'false'}">${item.suffix ? `<span>${escapeHtml(item.suffix)}</span>` : ''}</div></label>`;
        const groupMarkup = settingGroups.map((group) => `<section class="strategy-setting-group strategy-setting-group-${escapeHtml(group.id)}"><div class="strategy-setting-group-header"><h3>${escapeHtml(group.title)}</h3><p>${escapeHtml(group.description)}</p></div><div class="strategy-settings-grid">${group.fields.map(field).join('')}</div></section>`).join('');
        return `<div class="strategy-settings-shell"><section class="strategy-readiness-card ${readiness.complete ? 'is-complete' : 'is-pending'}"><div class="strategy-readiness-heading"><div><span class="strategy-readiness-eyebrow">기술 전략 적용 상태</span><strong>${readiness.complete ? '운영 준비 완료' : '확인 필요'}</strong><small>${complete}/${rows.length}개 조건 적용</small></div><div class="strategy-readiness-score">${escapeHtml(String(pct))}%</div></div><div class="strategy-readiness-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(String(pct))}"><span style="width:${escapeHtml(String(pct))}%"></span></div><div class="strategy-monitor-grid">${monitorMarkup}</div><details class="strategy-readiness-details"><summary>적용 조건 ${rows.length}개 상세 보기</summary><div class="strategy-readiness-list">${readinessItems || '<div class="strategy-readiness-item is-pending">적용 상태를 확인 중입니다.</div>'}</div></details></section><form id="strategy-settings-form" class="strategy-settings-form"><div class="strategy-setting-groups">${groupMarkup}</div><div class="strategy-settings-meta"><span class="time-muted">변경값은 저장 즉시 현재 서버 전략에 반영됩니다.</span><button type="submit" id="btn-strategy-save">전략 설정 저장</button></div></form></div>`;
    }

    global.HanstockDashboardStrategySettingsScreen = { render };
})(window);
