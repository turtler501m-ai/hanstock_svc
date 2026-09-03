"""Pure strategy-ownership reconciliation calculations."""

from __future__ import annotations

from collections.abc import Callable

from src.strategy_ids import BROKER_BASELINE_STRATEGY_ID, resolve_order_strategy_id


def balance_sync_strategy_id(trade: dict) -> str:
    return resolve_order_strategy_id(
        trade.get("strategy_id"),
        reason=str(trade.get("reason") or ""),
    )


def strategy_position_quantities(
    trades: list[dict],
    *,
    account_trades: Callable[[list[dict]], list[dict]],
    trade_is_ok: Callable[[dict], bool],
    attributed_reason: str,
) -> dict[str, dict[str, int]]:
    """Return positive, recorded strategy quantities by symbol."""
    positions: dict[str, dict[str, int]] = {}
    position_trades = account_trades(trades)
    position_trades.extend(
        trade for trade in trades
        if trade_is_ok(trade)
        and str(trade.get("reason") or "").strip() == attributed_reason
    )
    for trade in position_trades:
        symbol = str(trade.get("symbol") or "").strip()
        strategy_id = balance_sync_strategy_id(trade)
        action = str(trade.get("action") or "").strip().lower()
        if not symbol or not strategy_id or action not in {"buy", "sell"}:
            continue
        qty = int(trade.get("qty") or 0)
        if qty <= 0:
            continue
        by_strategy = positions.setdefault(symbol, {})
        delta = qty if action == "buy" else -qty
        by_strategy[strategy_id] = by_strategy.get(strategy_id, 0) + delta
    return {
        symbol: {strategy_id: qty for strategy_id, qty in by_strategy.items() if qty > 0}
        for symbol, by_strategy in positions.items()
    }


def allocate_strategy_reconciliation(
    qty: int,
    strategy_quantities: dict[str, int],
    *,
    action: str,
) -> list[tuple[str | None, int]]:
    """Allocate a broker balance adjustment without losing known ownership."""
    qty = max(0, int(qty))
    owners = sorted(
        ((str(strategy_id), int(owner_qty)) for strategy_id, owner_qty in strategy_quantities.items()
         if str(strategy_id).strip() and int(owner_qty) > 0),
        key=lambda item: item[0],
    )
    if qty <= 0:
        return []
    if not owners:
        return [(BROKER_BASELINE_STRATEGY_ID, qty)] if action == "buy" else [(None, qty)]

    allocatable = min(qty, sum(owner_qty for _, owner_qty in owners)) if action == "sell" else qty
    total_weight = sum(owner_qty for _, owner_qty in owners)
    allocations = []
    assigned = 0
    remainders = []
    for strategy_id, owner_qty in owners:
        numerator = allocatable * owner_qty
        allocated = numerator // total_weight
        if action == "sell":
            allocated = min(allocated, owner_qty)
        allocations.append([strategy_id, allocated])
        assigned += allocated
        remainders.append((numerator % total_weight, strategy_id, owner_qty))

    remaining = allocatable - assigned
    for _, strategy_id, owner_qty in sorted(remainders, key=lambda item: (-item[0], item[1])):
        if remaining <= 0:
            break
        allocation = next(item for item in allocations if item[0] == strategy_id)
        if action != "sell" or allocation[1] < owner_qty:
            allocation[1] += 1
            remaining -= 1

    result = [(strategy_id, allocated) for strategy_id, allocated in allocations if allocated > 0]
    unattributed = qty - allocatable
    if unattributed > 0:
        result.append((None, unattributed))
    return result
