/* Market-regime labels and pure presentation helpers. Loaded before app.js. */
(function (global) {
    const labels = {
        bull: '안정적인 상승장', bull_pullback: '상승 흐름 속 조정', sideways_low_vol: '조용한 횡보장',
        sideways_high_vol: '출렁이는 횡보장', bear_rally: '하락 흐름 속 반등', bear: '하락장',
        crash: '급락', insufficient_data: '데이터 부족', unknown: '미확인',
    };

    const guide = {
        bull: ['📈', '시장 전반의 상승 흐름이 비교적 안정적입니다.', '평소 수준으로 분산 매수 가능'],
        bull_pullback: ['↘️', '큰 상승 흐름은 유지되지만 단기 조정을 받고 있습니다.', '서두르지 말고 나눠서 접근'],
        sideways_low_vol: ['↔️', '뚜렷한 방향 없이 비교적 조용하게 움직이고 있습니다.', '선별 매수, 평소보다 보수적으로'],
        sideways_high_vol: ['〰️', '방향은 불분명한데 가격 움직임은 큰 시장입니다.', '매수 규모를 줄이고 변동성 주의'],
        bear_rally: ['🔄', '하락 추세 안에서 단기 반등이 나타난 상태입니다.', '추격 매수보다 반등 지속 여부 확인'],
        bear: ['📉', '시장 전반의 하락 흐름이 우세합니다.', '신규 매수를 최소화하고 방어 우선'],
        crash: ['🚨', '단기 낙폭과 변동성이 매우 큰 위험 구간입니다.', '신규 매수 중단, 위험 관리 최우선'],
        insufficient_data: ['⚠️', '판단에 필요한 시장 데이터가 충분하지 않습니다.', '새 매수 중단 후 데이터 재수집'],
        unknown: ['❔', '아직 시장 상태를 판단하지 못했습니다.', '데이터 확인 전 판단 보류'],
    };

    const reasonLabels = {
        aligned_uptrend: '단기·중기·장기 이동평균이 상승 순서로 정렬됨',
        long_uptrend_short_pullback: '장기 상승 흐름 안에서 단기 가격이 조정 중',
        aligned_downtrend: '단기·중기·장기 이동평균이 하락 순서로 정렬됨',
        short_rebound_in_downtrend: '장기 하락 흐름 안에서 단기 반등 중',
        crash_threshold: '최근 낙폭 또는 변동성이 급락 기준을 넘음',
        complete_sideways_fallback: '상승·하락 추세가 뚜렷하지 않아 횡보로 판단',
        broad_uptrend: 'KOSPI와 KOSDAQ 모두 상승 흐름을 확인',
        broad_downtrend: 'KOSPI와 KOSDAQ 모두 하락 흐름을 확인',
        confirmed_market_crash: '두 시장에서 급락 위험을 함께 확인',
        market_divergence: 'KOSPI와 KOSDAQ의 방향이 서로 다름',
        breadth_coverage_degraded: '시장 표본 일부가 누락되어 보수적으로 판단',
        required_market_data_available: '필수 지수와 시장 표본 데이터가 모두 준비됨',
    };

    const policyReasonLabels = {
        market_regime_allowed: '전략에서 허용한 국면입니다.',
        market_regime_not_allowed: '이 전략에서 허용하지 않은 국면입니다.',
        market_regime_missing: '저장된 시장 국면 자료가 없습니다.',
        market_regime_insufficient: '시장 자료가 부족하여 신규매수를 차단했습니다.',
        market_regime_invalid: '시장 국면 자료 형식이 올바르지 않습니다.',
        market_regime_time_invalid: '시장 국면 계산 시각을 확인할 수 없습니다.',
        market_regime_stale: '시장 국면 자료가 오래되어 신규매수를 차단했습니다.',
        market_regime_zero_risk: '이 국면의 신규투자 한도가 0%입니다.',
        market_regime_cap_invalid: '전략의 국면별 최대 비율 설정이 올바르지 않습니다.',
        allowed_market_regime: '이 전략에서 허용하지 않은 국면입니다.',
    };

    const api = {
        labels,
        guide,
        reasonLabels,
        policyReasonLabels,
        marketPolicyReasonLabel(value) {
            const key = String(value || '');
            return policyReasonLabels[key] || key.replace(/^market_regime:/, '') || '';
        },
        marketRegimeLabel(value) {
            const key = String(value || 'unknown').toLowerCase();
            return labels[key] || value || '-';
        },
        marketRegimePercent(value, digits = 1) {
            if (value === null || value === undefined || value === '') return '-';
            const number = Number(value);
            if (!Number.isFinite(number)) return '-';
            const normalized = Math.abs(number) <= 1 ? number * 100 : number;
            return `${normalized.toFixed(digits)}%`;
        },
        marketRegimeDate(value, escapeHtml) {
            if (!value) return '-';
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : parsed.toLocaleString('ko-KR');
        },
    };

    global.HanstockDashboardMarketRegime = Object.freeze(api);
}(window));
