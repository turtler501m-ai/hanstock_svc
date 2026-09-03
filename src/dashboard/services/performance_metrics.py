"""Pure performance aggregation primitives used by the dashboard."""

from __future__ import annotations


def period_bucket() -> dict:
    """Return the accumulator shape used by daily and monthly reports."""
    return {
        "order_count": 0,
        "buy_count": 0,
        "sell_count": 0,
        "buy_amount": 0,
        "sell_amount": 0,
        "realized_pnl": 0,
        "cost_of_sold": 0,
        "realized_pnl_rate": 0.0,
        "net_cashflow": 0,
        "details": [],
    }


def safe_index_rows(rows: list[dict]) -> list[dict]:
    """Normalize benchmark observations for stable performance chains."""
    result: list[dict] = []
    for row in sorted(rows, key=lambda item: str(item.get("date") or "")):
        try:
            close = float(row.get("close") or 0)
        except (TypeError, ValueError):
            continue
        date = str(row.get("date") or "")[:10]
        if len(date) == 8 and date.isdigit():
            date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
        if len(date) != 10 or close <= 0:
            continue
        result.append({"date": date, "close": close})
    return result


def daily_market_context(index_rows: dict[str, list[dict]]) -> dict[str, dict]:
    context: dict[str, dict] = {}
    for name, rows in index_rows.items():
        closes = [float(row["close"]) for row in rows]
        for idx, row in enumerate(rows):
            change_pct = None
            if idx and closes[idx - 1] > 0:
                change_pct = (closes[idx] / closes[idx - 1] - 1) * 100
            day = context.setdefault(row["date"], {})
            day[name.lower()] = round(float(row["close"]), 2)
            day[f"{name.lower()}_change_pct"] = round(change_pct, 2) if change_pct is not None else None
    return context


def monthly_market_context(index_rows: dict[str, list[dict]]) -> dict[str, dict]:
    context: dict[str, dict] = {}
    for name, rows in index_rows.items():
        by_month: dict[str, list[float]] = {}
        for row in rows:
            date = str(row.get("date") or "")
            close = float(row.get("close") or 0)
            if len(date) >= 7 and close > 0:
                by_month.setdefault(date[:7], []).append(close)
        previous_close = None
        for month, closes in sorted(by_month.items()):
            close = closes[-1]
            change_pct = None
            if previous_close and previous_close > 0:
                change_pct = (close / previous_close - 1) * 100
            bucket = context.setdefault(month, {})
            bucket[name.lower()] = round(close, 2)
            bucket[f"{name.lower()}_change_pct"] = round(change_pct, 2) if change_pct is not None else None
            previous_close = close
    return context
