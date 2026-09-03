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
