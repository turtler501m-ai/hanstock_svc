"""Deterministic, cost-aware order execution model for research backtests.

The live broker remains the source of truth for real orders.  This module is
deliberately pure and deterministic by default so a backtest can explain why
an order was filled, partially filled, rejected, or left unresolved.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import floor
from random import Random
from typing import Any, Mapping


@dataclass(frozen=True)
class ExecutionConfig:
    commission_bps: float = 3.0
    sell_tax_bps: float = 18.0
    base_slippage_bps: float = 5.0
    spread_bps: float = 8.0
    market_impact_bps: float = 2.0
    max_participation_rate: float = 0.10
    minimum_order_value: float = 0.0
    order_failure_rate: float = 0.0
    timeout_rate: float = 0.0
    cancel_failure_rate: float = 0.0
    cancel_unfilled: bool = False
    seed: int = 42


@dataclass(frozen=True)
class ExecutionRequest:
    symbol: str
    side: str
    quantity: int
    reference_price: float
    order_type: str = "market"
    bid: float = 0.0
    ask: float = 0.0
    bar_volume: float = 0.0
    adv: float = 0.0
    tick_size: float = 0.0
    halted: bool = False
    limit_up: float = 0.0
    limit_down: float = 0.0
    available_cash: float = 0.0
    available_quantity: int = 0
    api_rate_limited: bool = False


@dataclass(frozen=True)
class ExecutionResult:
    status: str
    requested_quantity: int
    filled_quantity: int
    remaining_quantity: int
    fill_price: float
    gross_value: float
    commission: float
    tax: float
    slippage_bps: float
    spread_bps: float
    reason: str
    details: Mapping[str, Any] = field(default_factory=dict)

    @property
    def net_cash_flow(self) -> float:
        """Positive for a buy cash outflow, negative for a sell inflow."""
        costs = self.commission + self.tax
        return self.gross_value + costs


def krx_tick_size(price: float) -> float:
    """Return the ordinary KRX price tick for a positive share price."""
    value = abs(float(price or 0.0))
    if value < 2_000:
        return 1.0
    if value < 5_000:
        return 5.0
    if value < 20_000:
        return 10.0
    if value < 50_000:
        return 50.0
    if value < 200_000:
        return 100.0
    if value < 500_000:
        return 500.0
    return 1_000.0


def round_to_tick(price: float, tick_size: float | None = None, *, side: str = "buy") -> float:
    """Round conservatively to a valid tick, avoiding optimistic prices."""
    value = float(price or 0.0)
    tick = float(tick_size or krx_tick_size(value))
    if value <= 0 or tick <= 0:
        return 0.0
    units = value / tick
    rounded = floor(units) if str(side).lower() == "buy" else -floor(-units)
    return round(rounded * tick, 8)


class ExecutionSimulator:
    def __init__(self, config: ExecutionConfig | None = None):
        self.config = config or ExecutionConfig()
        self._random = Random(self.config.seed)

    def execute(self, request: ExecutionRequest) -> ExecutionResult:
        side = str(request.side or "").lower()
        order_type = str(request.order_type or "market").lower()
        qty = max(0, int(request.quantity or 0))
        price = float(request.reference_price or 0.0)
        if side not in {"buy", "sell"}:
            return self._reject(qty, "invalid_side")
        if qty <= 0 or price <= 0:
            return self._reject(qty, "invalid_quantity_or_price")
        if request.halted:
            return self._reject(qty, "trading_halted")
        if request.api_rate_limited:
            return self._reject(qty, "api_rate_limit")

        tick = float(request.tick_size or krx_tick_size(price))
        bid = float(request.bid or 0.0)
        ask = float(request.ask or 0.0)
        quoted_spread_bps = (
            max(0.0, (ask - bid) / ((ask + bid) / 2.0) * 10_000)
            if bid > 0 and ask >= bid
            else max(0.0, float(self.config.spread_bps))
        )
        if order_type == "limit":
            execution_reference = price
        elif side == "buy":
            execution_reference = ask if ask > 0 else price * (1 + quoted_spread_bps / 20_000)
        else:
            execution_reference = bid if bid > 0 else price * (1 - quoted_spread_bps / 20_000)

        if request.limit_up > 0 and execution_reference > request.limit_up:
            return self._reject(qty, "limit_up_unavailable")
        if request.limit_down > 0 and execution_reference < request.limit_down:
            return self._reject(qty, "limit_down_unavailable")

        minimum = max(0.0, float(self.config.minimum_order_value))
        if minimum > 0 and qty * execution_reference < minimum:
            return self._reject(qty, "minimum_order_value")
        if side == "buy" and request.available_cash > 0 and qty * execution_reference > request.available_cash:
            return self._reject(qty, "insufficient_orderable_cash")
        if side == "sell" and request.available_quantity > 0 and qty > request.available_quantity:
            return self._reject(qty, "insufficient_sellable_quantity")
        if self._random.random() < max(0.0, min(1.0, self.config.order_failure_rate)):
            return self._reject(qty, "broker_rejected")
        if self._random.random() < max(0.0, min(1.0, self.config.timeout_rate)):
            return ExecutionResult(
                "unknown", qty, 0, qty, 0.0, 0.0, 0.0, 0.0,
                quoted_spread_bps, "api_timeout", {"retry_allowed": False},
            )

        available = max(0, int(float(request.bar_volume or request.adv or qty) * max(
            0.0, min(1.0, float(self.config.max_participation_rate))
        )))
        if available <= 0:
            available = qty
        filled = min(qty, available)
        remaining = qty - filled
        participation = filled / max(1.0, float(request.bar_volume or request.adv or filled))
        impact_bps = max(0.0, float(self.config.market_impact_bps)) * participation
        slip_bps = max(0.0, float(self.config.base_slippage_bps)) + impact_bps
        direction = 1.0 if side == "buy" else -1.0
        fill_price = execution_reference * (1 + direction * slip_bps / 10_000)
        fill_price = round_to_tick(fill_price, tick, side=side)
        gross = filled * fill_price
        commission = gross * max(0.0, float(self.config.commission_bps)) / 10_000
        tax = (
            gross * max(0.0, float(self.config.sell_tax_bps)) / 10_000
            if side == "sell" else 0.0
        )
        status = "filled" if remaining == 0 else "partial"
        return ExecutionResult(
            status, qty, filled, remaining, fill_price, gross, commission, tax,
            slip_bps, quoted_spread_bps,
            "filled" if status == "filled" else "liquidity_limited",
            {
                "tick_size": tick,
                "participation_rate": round(participation, 8),
                "available_quantity": available,
                "order_type": order_type,
            },
        )

    def cancel(self, remaining_quantity: int) -> dict[str, Any]:
        qty = max(0, int(remaining_quantity or 0))
        if qty == 0:
            return {"status": "canceled", "quantity": 0, "reason": "already_filled"}
        if self._random.random() < max(0.0, min(1.0, self.config.cancel_failure_rate)):
            return {"status": "unknown", "quantity": qty, "reason": "cancel_timeout"}
        return {"status": "canceled", "quantity": qty, "reason": "operator_cancel"}

    @staticmethod
    def _reject(quantity: int, reason: str) -> ExecutionResult:
        return ExecutionResult(
            "rejected", quantity, 0, quantity, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, reason, {},
        )
