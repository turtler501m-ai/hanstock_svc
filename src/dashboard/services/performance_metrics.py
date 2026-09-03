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


def trade_is_ok(trade: dict) -> bool:
    try:
        return bool(int(trade.get("ok", 1)))
    except (TypeError, ValueError):
        return True


def trade_is_dry_run(trade: dict) -> bool:
    try:
        return bool(int(trade.get("dry_run", 0)))
    except (TypeError, ValueError):
        return False


def filled_price_matches_order(trade: dict, *, tolerance: float = 0.30) -> bool:
    try:
        filled_price = int(float(trade.get("filled_price") or 0))
        order_price = int(float(trade.get("price") or 0))
    except (TypeError, ValueError):
        return True
    if filled_price <= 0 or order_price <= 0:
        return True
    return order_price * (1.0 - tolerance) <= filled_price <= order_price * (1.0 + tolerance)


def trade_is_sync_adjustment(trade: dict) -> bool:
    """Identify synthetic synchronization rows excluded from realized PnL."""
    reason = str(trade.get("reason") or "").lower()
    if reason.strip() == "broker history import":
        return False
    if any(token in reason for token in ("sync", "adjust", "correction", "import")):
        return True
    if any(token in reason for token in ("\ub3d9\uae30\ud654", "\ubcf4\uc815", "\uc870\uc815")):
        return True
    return False


def account_trades(trades: list[dict], *, show_dry_run: bool) -> list[dict]:
    """Filter and normalize executed trades used by account performance views."""
    account_rows = []
    for trade in trades:
        if not trade_is_ok(trade) or trade_is_sync_adjustment(trade):
            continue
        if not show_dry_run and trade_is_dry_run(trade):
            continue
        order_status = str(trade.get("order_status") or "")
        try:
            filled_qty = int(float(trade.get("filled_qty") or 0))
            filled_price = int(float(trade.get("filled_price") or 0))
        except (TypeError, ValueError):
            filled_qty = 0
            filled_price = 0
        if order_status in {"submitted", "partial", "open"} and filled_qty <= 0:
            continue
        if filled_qty > 0 and not filled_price_matches_order(trade):
            if order_status in {"submitted", "partial", "open"}:
                continue
            filled_qty = 0
            filled_price = 0
        if filled_qty > 0:
            try:
                fallback_price = int(float(trade.get("price") or 0))
            except (TypeError, ValueError):
                fallback_price = 0
            trade = {**trade, "qty": filled_qty, "price": filled_price or fallback_price}
        account_rows.append(trade)
    return account_rows
