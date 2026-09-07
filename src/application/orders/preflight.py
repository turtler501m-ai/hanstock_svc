"""Authoritative, fail-closed capacity checks immediately before submission."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import json
import math
import os
from typing import Any, Callable

from src.broker.models import AccountBalance, Holding


@dataclass(frozen=True, slots=True)
class OrderCapacityDecision:
    allowed: bool
    code: str
    reason: str
    requested_quantity: int
    approved_quantity: int
    broker_sellable_quantity: int = 0
    locally_reserved_quantity: int = 0
    broker_orderable_cash: float = 0.0
    locally_reserved_cash: float = 0.0
    estimated_order_value: float = 0.0
    reference_price: float = 0.0
    evidence: dict[str, Any] = field(default_factory=dict)


_LOCAL_CAPACITY_STATUSES = (
    "approval_pending", "risk_approved", "approved", "submitting", "broker_unknown",
)


def _positive_int(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, number)


def _active_local_reservations(
    connect: Callable,
    *,
    account_key: str,
    market: str,
    symbol: str,
    exclude_order_id: int | None,
) -> tuple[int, float]:
    """Return capacity not guaranteed to be reflected in broker balances.

    Submitted/open/partial orders are deliberately excluded: Namuh's fresh
    sellable quantity and orderable cash already account for accepted orders.
    Outcome-unknown submissions remain reserved until reconciled because the
    broker snapshot may not have incorporated them yet.
    """
    placeholders = ",".join("?" for _ in _LOCAL_CAPACITY_STATUSES)
    params: list[Any] = [account_key, market, *_LOCAL_CAPACITY_STATUSES]
    excluded = ""
    if exclude_order_id is not None:
        excluded = " AND id<>?"
        params.append(int(exclude_order_id))
    with connect() as conn:
        conn.row_factory = __import__("sqlite3").Row
        rows = conn.execute(
            f"""SELECT id,symbol,side,requested_qty,filled_qty,order_price,status
                FROM orders
                WHERE account_key=? AND market=? AND status IN ({placeholders})
                {excluded}""",
            tuple(params),
        ).fetchall()
        reference_prices: dict[int, float] = {}
        for row in rows:
            if str(row["side"]) != "buy" or float(row["order_price"] or 0) > 0:
                continue
            event = conn.execute(
                """SELECT payload_json FROM order_events
                   WHERE order_id=? AND event_type='capacity_confirmed'
                   ORDER BY id DESC LIMIT 1""",
                (int(row["id"]),),
            ).fetchone()
            if event:
                try:
                    reference_prices[int(row["id"])] = max(
                        0.0, float(json.loads(event[0] or "{}").get("reference_price") or 0)
                    )
                except (TypeError, ValueError, json.JSONDecodeError):
                    pass
    sell_quantity = 0
    buy_cash = 0.0
    for row in rows:
        remaining = max(0, _positive_int(row["requested_qty"]) - _positive_int(row["filled_qty"]))
        if str(row["side"]) == "sell" and str(row["symbol"]) == symbol:
            sell_quantity += remaining
        elif str(row["side"]) == "buy":
            reserve_price = max(
                0.0,
                float(row["order_price"] or 0),
                reference_prices.get(int(row["id"]), 0.0),
            )
            buy_cash += remaining * reserve_price
    return sell_quantity, buy_cash


def _fetch_balance(api: Any) -> AccountBalance:
    if hasattr(api, "fetch_balance"):
        balance = api.fetch_balance()
        if isinstance(balance, AccountBalance):
            # The NHPLUG demo account can expose the whole position through
            # settlement fields while its integrated balance quantity is zero.
            # The dashboard adapter applies the same compatibility rule; the
            # submission preflight must use it too or every sell is rejected
            # after the UI has shown it as sellable. Never enable this for a
            # normal/live broker response.
            demo_response = "모의투자" in str(
                (balance.raw or {}).get("rsp_msg")
                or (balance.raw or {}).get("response_msg")
                or ""
            )
            if demo_response:
                holdings = []
                for holding in balance.holdings:
                    if holding.sellable_quantity > 0:
                        holdings.append(holding)
                        continue
                    raw = holding.raw if isinstance(holding.raw, dict) else {}
                    settlement_qty = max(
                        _positive_int(raw.get("ny_stl_qty")),
                        _positive_int(raw.get("rsdl_qty")),
                    )
                    if settlement_qty >= _positive_int(holding.quantity):
                        holdings.append(replace(
                            holding, sellable_quantity=_positive_int(holding.quantity)
                        ))
                    else:
                        holdings.append(holding)
                balance = replace(balance, holdings=tuple(holdings))
            return balance
    if not hasattr(api, "get_balance"):
        raise RuntimeError("broker adapter does not provide a fresh balance")
    raw = api.get_balance()
    if not isinstance(raw, dict):
        raise RuntimeError("broker returned an invalid balance")
    holdings = []
    for row in raw.get("output1", []) or []:
        quantity = _positive_int(row.get("hldg_qty"))
        holdings.append(Holding(
            symbol=str(row.get("pdno") or ""), name=str(row.get("prdt_name") or ""),
            quantity=quantity,
            sellable_quantity=min(quantity, _positive_int(row.get("ord_psbl_qty"))),
        ))
    summary = (raw.get("output2") or [{}])[0] or {}
    return AccountBalance(
        holdings=tuple(holdings),
        cash=max(0.0, float(summary.get("dnca_tot_amt") or 0)),
        orderable_cash=max(0.0, float(summary.get("ord_psbl_cash") or 0)),
    )


def _reference_buy_price(api: Any, symbol: str, requested_price: int) -> float:
    if requested_price > 0:
        return float(requested_price)
    if not hasattr(api, "fetch_quote"):
        raise RuntimeError("market buy requires a fresh quote")
    quote = api.fetch_quote(symbol)
    price = float(getattr(quote, "ask_price", 0) or getattr(quote, "current_price", 0) or 0)
    if not math.isfinite(price) or price <= 0:
        raise RuntimeError("market buy reference price is unavailable")
    buffer_pct = max(0.0, float(os.environ.get("HANSTOCK_MARKET_BUY_BUFFER_PCT", "3")))
    return price * (1.0 + buffer_pct / 100.0)


def evaluate_order_capacity(
    *,
    api: Any,
    connect: Callable,
    account_key: str,
    symbol: str,
    side: str,
    quantity: int,
    price: int = 0,
    market: str = "KR",
    exclude_order_id: int | None = None,
) -> OrderCapacityDecision:
    """Evaluate the quantity against a fresh broker snapshot and local holds."""
    symbol = str(symbol or "").strip()
    side = str(side or "").strip().lower()
    quantity = _positive_int(quantity)
    if not symbol or side not in {"buy", "sell"} or quantity <= 0:
        return OrderCapacityDecision(
            False, "INVALID_ORDER", "symbol, side and positive whole quantity are required",
            quantity, 0,
        )

    balance = _fetch_balance(api)
    reserved_sell, reserved_cash = _active_local_reservations(
        connect, account_key=account_key, market=market, symbol=symbol,
        exclude_order_id=exclude_order_id,
    )
    if side == "sell":
        holding = next((item for item in balance.holdings if str(item.symbol) == symbol), None)
        broker_sellable = _positive_int(getattr(holding, "sellable_quantity", 0))
        available = max(0, broker_sellable - reserved_sell)
        approved = min(quantity, available)
        return OrderCapacityDecision(
            approved == quantity,
            "OK" if approved == quantity else "INSUFFICIENT_SELLABLE_QUANTITY",
            "sell capacity confirmed" if approved == quantity else
            f"requested {quantity} shares but only {available} are safely sellable",
            quantity, approved, broker_sellable_quantity=broker_sellable,
            locally_reserved_quantity=reserved_sell,
            evidence={"holding_quantity": _positive_int(getattr(holding, "quantity", 0))},
        )

    reference_price = _reference_buy_price(api, symbol, int(price))
    estimated_value = quantity * reference_price
    broker_cash = max(0.0, float(balance.orderable_cash or 0))
    available_cash = max(0.0, broker_cash - reserved_cash)
    approved = quantity if estimated_value <= available_cash else int(available_cash // reference_price)
    return OrderCapacityDecision(
        approved >= quantity,
        "OK" if approved >= quantity else "INSUFFICIENT_ORDERABLE_CASH",
        "buying power confirmed" if approved >= quantity else
        f"estimated order value {estimated_value:.0f} exceeds safe available cash {available_cash:.0f}",
        quantity, min(quantity, approved), broker_orderable_cash=broker_cash,
        locally_reserved_cash=reserved_cash, estimated_order_value=estimated_value,
        reference_price=reference_price,
    )


def require_order_capacity(**kwargs: Any) -> OrderCapacityDecision:
    decision = evaluate_order_capacity(**kwargs)
    if not decision.allowed:
        raise RuntimeError(f"{decision.code}: {decision.reason}")
    return decision
