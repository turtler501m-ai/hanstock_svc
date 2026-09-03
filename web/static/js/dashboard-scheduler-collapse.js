(function (global) {
    'use strict';

    function toggle(round, expandedRounds) {
        const body = document.getElementById(`round-body-${round}`);
        if (!body) return;
        const expanded = body.style.display !== 'none';
        const icon = document.getElementById(`toggle-icon-${round}`);
        const header = body.previousElementSibling;
        if (expanded) {
            body.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(0deg)';
            if (icon) icon.classList.remove('is-expanded');
            if (header) header.setAttribute('aria-expanded', 'false');
            expandedRounds?.delete(round);
        } else {
            body.style.display = 'block';
            if (icon) icon.style.transform = 'rotate(180deg)';
            if (icon) icon.classList.add('is-expanded');
            if (header) header.setAttribute('aria-expanded', 'true');
            expandedRounds?.add(round);
        }
    }

    global.HanstockDashboardSchedulerCollapse = { toggle };
})(window);
