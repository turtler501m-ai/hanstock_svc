"""Pure momentum and volatility metrics used by strategy scans."""


def period_return(prices: list[float], days: int) -> float:
    """Return percentage change over a completed lookback window."""
    if len(prices) <= days:
        return 0.0
    start = float(prices[-days - 1] or 0)
    end = float(prices[-1] or 0)
    if start <= 0 or end <= 0:
        return 0.0
    return round((end / start - 1) * 100, 2)


def relative_momentum_score(prices: list[float]) -> dict:
    """Favor persistent 3-12 month winners while penalizing blow-offs."""
    returns = {
        "return_20d": period_return(prices, 20),
        "return_60d": period_return(prices, 60),
        "return_120d": period_return(prices, 120),
    }
    score = 0.0
    reasons: list[str] = []
    if returns["return_60d"] >= 8:
        score += 1.0
        reasons.append(f"60d momentum {returns['return_60d']:+.1f}%")
    elif returns["return_60d"] <= -8:
        score -= 1.0
        reasons.append(f"weak 60d momentum {returns['return_60d']:+.1f}%")
    if returns["return_120d"] >= 12:
        score += 1.0
        reasons.append(f"120d momentum {returns['return_120d']:+.1f}%")
    elif returns["return_120d"] <= -12:
        score -= 1.0
        reasons.append(f"weak 120d momentum {returns['return_120d']:+.1f}%")
    if returns["return_20d"] >= 25:
        score -= 1.5
        reasons.append(f"short-term overextension {returns['return_20d']:+.1f}%")
    return {**returns, "score": score, "reasons": reasons}


def volatility(prices: list[float], period: int = 20) -> float:
    """Return population standard deviation of simple daily returns."""
    if len(prices) < period + 1:
        return 0.0
    window = prices[-(period + 1):]
    returns = [
        (window[index] / window[index - 1]) - 1
        for index in range(1, len(window))
        if window[index - 1] > 0
    ]
    if not returns:
        return 0.0
    mean = sum(returns) / len(returns)
    variance = sum((value - mean) ** 2 for value in returns) / len(returns)
    return variance ** 0.5
