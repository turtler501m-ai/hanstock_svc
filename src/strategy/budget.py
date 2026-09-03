"""Pure capital and buying-budget calculations for the trading engine."""

from __future__ import annotations

from typing import Any


def operating_capital(
    account_total_eval: int | float = 0,
    *,
    settings: Any,
) -> int:
    """Return configured capital available to the strategy."""
    configured = max(0, int(getattr(settings, "total_capital", 0) or 0))
    account_total = max(0, int(account_total_eval or 0))
    if configured <= 0:
        return account_total
    if account_total <= 0:
        return configured
    return min(configured, account_total)


def available_buying_cash(
    broker_cash: int | float,
    stock_eval: int | float,
    account_total_eval: int | float,
    *,
    settings: Any,
) -> int:
    """Cap new buys by configured capital, cash buffer, and exposure."""
    capital = operating_capital(account_total_eval, settings=settings)
    cash_buffer = float(getattr(settings, "cash_buffer", 0) or 0)
    investable_limit = int(capital * max(0.0, 1.0 - cash_buffer))
    remaining_exposure = max(0, investable_limit - max(0, int(stock_eval or 0)))
    return min(max(0, int(broker_cash or 0)), remaining_exposure)


def buying_cash_diagnostics(
    broker_cash: int | float,
    stock_eval: int | float,
    account_total_eval: int | float,
    *,
    locked_holding_eval: int | float = 0,
    settings: Any,
) -> dict[str, int | float]:
    """Explain the capital and exposure limits applied to new buys."""
    capital = operating_capital(account_total_eval, settings=settings)
    cash_buffer = float(getattr(settings, "cash_buffer", 0) or 0)
    investable_limit = int(capital * max(0.0, 1.0 - cash_buffer))
    exposure_for_new_buys = max(0, int(stock_eval or 0) - int(locked_holding_eval or 0))
    exposure_remaining = investable_limit - exposure_for_new_buys
    broker_cash_int = max(0, int(broker_cash or 0))
    return {
        "broker_cash": broker_cash_int,
        "stock_eval": max(0, int(stock_eval or 0)),
        "locked_holding_eval": max(0, int(locked_holding_eval or 0)),
        "exposure_for_new_buys": exposure_for_new_buys,
        "operating_capital": capital,
        "cash_buffer": cash_buffer,
        "investable_limit": investable_limit,
        "exposure_remaining": exposure_remaining,
        "buying_cash": min(broker_cash_int, max(0, exposure_remaining)),
    }
