from __future__ import annotations

from collections.abc import Callable


def score_default_strategy(
    prices: list[float],
    highs: list[float],
    volumes: list[float],
    *,
    current: float,
    previous: float,
    rsi14: float,
    rsi2: float,
    sma20: float,
    sma60: float,
    sma120: float,
    bb_lo: float,
    macd: dict,
    ma_cross: dict,
    momentum: dict,
    atr_pct: float,
    value_surge: dict,
    wave_pullback: dict,
    config,
    calc_rsi: Callable,
    calc_bollinger: Callable,
) -> tuple[float, list[str]]:
    """Apply the built-in technical scoring policy to precomputed indicators."""
    score = 0.0
    reasons = []
    if len(prices) >= 16:
        prev_rsi = calc_rsi(prices[:-1], 14)
        if prev_rsi < config.rsi_buy <= rsi14:
            score += 2.0
            reasons.append(f"RSI recovery {prev_rsi:.0f}->{rsi14:.0f}")
        elif 30 < rsi14 < 50:
            score += 1.0
            reasons.append(f"RSI pullback {rsi14:.0f}")
    if macd["bull_cross"]:
        score += 2.0
        reasons.append("MACD bullish cross")
    elif macd["hist"] > 0:
        score += 1.0
        reasons.append("MACD positive")
    if len(prices) >= 21:
        prev_lo, _prev_mid, _prev_hi = calc_bollinger(prices[:-1], 20)
        if previous < prev_lo and current >= bb_lo:
            score += 2.0
            reasons.append("Bollinger rebound")
        elif current <= bb_lo:
            score += 1.0
            reasons.append("near lower band")
    if len(prices) >= 60 and current > sma60 and rsi2 <= 15:
        score += 2.0
        reasons.append(f"trend pullback RSI2={rsi2:.0f}")
    elif len(prices) >= 120 and current > sma120 and rsi2 <= 20:
        score += 1.0
        reasons.append(f"long trend pullback RSI2={rsi2:.0f}")
    if len(highs) >= 21 and len(volumes) >= 20:
        high20 = max(highs[-21:-1])
        vol_avg = sum(volumes[-20:]) / 20
        if current > high20 and volumes[-1] > vol_avg * 1.5:
            score += 2.0
            reasons.append("20-day breakout with volume")
        elif volumes[-1] > vol_avg * 1.5:
            score += 1.0
            reasons.append("volume spike")
    if ma_cross["golden_cross"]:
        score += 2.0
        reasons.append("SMA20/SMA60 golden cross")
    elif sma20 > sma60 > 0:
        score += 1.0
        reasons.append("SMA20>SMA60")
    elif ma_cross["dead_cross"]:
        score -= 2.0
        reasons.append("SMA20/SMA60 dead cross")
    if len(prices) >= 120 and current > sma120 > 0 and sma20 > sma60:
        score += 1.0
        reasons.append("price above SMA120 with rising medium trend")
    if momentum["score"]:
        score += momentum["score"]
        reasons.extend(momentum["reasons"])
    if atr_pct > 12:
        score -= 1.0
        reasons.append(f"high ATR risk {atr_pct:.1f}%")
    if value_surge["matched"]:
        score += 2.0
        reasons.append(f"trade value surge {value_surge['ratio']:.1f}x")
    if wave_pullback["matched"]:
        score += 3.0
        reasons.append(
            f"first wave pullback wave={wave_pullback['wave_pct']:.1f}% "
            f"pullback={wave_pullback['pullback_pct']:.1f}%"
        )
    return score, reasons
