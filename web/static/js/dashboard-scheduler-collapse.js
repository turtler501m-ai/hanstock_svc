(function (global) {
    'use strict';

    function toggle(round, expandedRounds) {
        const body = document.getElementById(`round-body-${round}`);
        if (!body) return;
        const expanded = body.style.display !== 'none';
        const icon = document.getElementById(`toggle-icon-${round}`);
        if (expanded) {
            body.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(0deg)';
            expandedRounds?.delete(round);
        } else {
            body.style.display = 'block';
            if (icon) icon.style.transform = 'rotate(180deg)';
            expandedRounds?.add(round);
        }
    }

    global.HanstockDashboardSchedulerCollapse = { toggle };
})(window);
