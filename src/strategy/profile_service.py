from __future__ import annotations

from collections.abc import Callable


def calculate_profile_inputs(
    prices: list[float],
    highs: list[float],
    lows: list[float],
    volumes: list[float],
    *,
    config,
    calc_rsi: Callable,
    calc_sma: Callable,
    calc_bollinger: Callable,
    calc_macd: Callable,
    calc_atr: Callable,
    moving_average_cross: Callable,
    relative_momentum: Callable,
    trade_value_surge: Callable,
    first_wave_pullback: Callable,
) -> dict:
    """Calculate the shared indicator bundle used by strategy profiles."""
    current = prices[-1] if prices else 0
    previous = prices[-2] if len(prices) >= 2 else current
    rsi14 = calc_rsi(prices, 14)
    rsi2 = calc_rsi(prices, 2)
    sma20 = calc_sma(prices, 20)
    sma60 = calc_sma(prices, 60)
    sma120 = calc_sma(prices, 120)
    bb_lo, bb_mid, bb_hi = calc_bollinger(prices, 20)
    macd = calc_macd(prices)
    ma_cross = moving_average_cross(prices)
    momentum = relative_momentum(prices)
    atr = calc_atr(highs, lows, prices)
    atr_pct = round(atr / current * 100, 2) if current > 0 and atr > 0 else 0.0
    value_surge = trade_value_surge(prices, volumes, minimum_ratio=config.trade_value_surge_ratio)
    wave_pullback = first_wave_pullback(
        prices,
        volumes,
        minimum_wave_pct=config.first_wave_min_pct,
        minimum_pullback_pct=config.first_wave_pullback_min_pct,
        maximum_pullback_pct=config.first_wave_pullback_max_pct,
    )
    return locals()
