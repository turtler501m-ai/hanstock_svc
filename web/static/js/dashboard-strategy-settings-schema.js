(function (global) {
    'use strict';
    function groups(config) {
        return [
            { id: 'entry', title: '기본 매매', description: '분할매수와 RSI 진입·청산 기준', fields: [
                { key: 'SPLIT_N', label: '분할 횟수', value: config.split_n, type: 'int', step: '1', min: '1', suffix: '회' },
                { key: 'RSI_BUY', label: 'RSI 매수선', value: config.rsi_buy, type: 'int', step: '1', min: '0', max: '100' },
                { key: 'RSI_SELL', label: 'RSI 매도선', value: config.rsi_sell, type: 'int', step: '1', min: '0', max: '100' },
            ] },
            { id: 'exit', title: '청산·수익 보호', description: '고정 손절과 진입 이후 최고가 기준 수익 보호', fields: [
                { key: 'STOP_LOSS_PCT', label: '고정 손절', value: config.stop_loss_pct, type: 'float', step: '0.1', suffix: '%' },
                { key: 'TAKE_PROFIT', label: '목표 수익', value: config.take_profit, type: 'float', step: '0.1', suffix: '%' },
                { key: 'TRAILING_STOP_ACTIVATION_PCT', label: '트레일링 시작 수익률', value: config.trailing_stop_activation_pct, type: 'float', step: '0.5', min: '0', suffix: '%' },
                { key: 'TRAILING_STOP_PCT', label: '최고가 대비 청산 하락률', value: config.trailing_stop_pct, type: 'float', step: '0.5', min: '0.5', suffix: '%' },
                { key: 'TRAILING_STOP_LOOKBACK', label: '고점 참고 기간', value: config.trailing_stop_lookback, type: 'int', step: '1', min: '2', suffix: '일' },
            ] },
            { id: 'candidate', title: '후보 선별', description: '거래대금과 주도주 1차 파동 알림 조건', fields: [
                { key: 'TRADE_VALUE_SURGE_RATIO', label: '거래대금 급증 배수', value: config.trade_value_surge_ratio, type: 'float', step: '0.1', min: '1', suffix: '배' },
                { key: 'FIRST_WAVE_MIN_PCT', label: '1차 파동 최소 상승률', value: config.first_wave_min_pct, type: 'float', step: '0.5', min: '1', suffix: '%' },
                { key: 'FIRST_WAVE_PULLBACK_MIN_PCT', label: '눌림목 최소 조정률', value: config.first_wave_pullback_min_pct, type: 'float', step: '0.5', min: '0', suffix: '%' },
                { key: 'FIRST_WAVE_PULLBACK_MAX_PCT', label: '눌림목 최대 조정률', value: config.first_wave_pullback_max_pct, type: 'float', step: '0.5', min: '0', suffix: '%' },
            ] },
            { id: 'risk', title: '자금·리스크', description: '주문 규모와 계좌 손실 제한', fields: [
                { key: 'TOTAL_CAPITAL', label: '운용 기준 원금', value: config.total_capital, type: 'float', step: '100000', min: '0', suffix: '원' },
                { key: 'MAX_POSITIONS', label: '최대 보유종목', value: config.max_positions, type: 'int', step: '1', min: '1', suffix: '개' },
                { key: 'MAX_SINGLE_WEIGHT', label: '종목당 최대비중', value: Number(config.max_single_weight || 0) * 100, type: 'float', step: '0.1', min: '0', max: '100', suffix: '%', percent: true },
                { key: 'CASH_BUFFER', label: '현금 보유비중', value: Number(config.cash_buffer || 0) * 100, type: 'float', step: '0.1', min: '0', max: '100', suffix: '%', percent: true },
                { key: 'MAX_DAILY_LOSS_PCT', label: '일일 손실 제한', value: config.max_daily_loss_pct, type: 'float', step: '0.1', min: '0', suffix: '%' },
            ] },
        ];
    }
    global.HanstockDashboardStrategySettingsSchema = { groups };
})(window);
