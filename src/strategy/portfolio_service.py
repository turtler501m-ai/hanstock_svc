from __future__ import annotations

import math
from collections.abc import Callable


def generate_optimizer_plan(
    holdings: list[dict],
    total_eval: int,
    *,
    cash_buffer: float,
    max_single_weight: float,
    build_profile: Callable,
    volatility: Callable,
) -> dict:
    """Calculate score/inverse-volatility target weights and rebalance deltas."""
    investable_weight = max(0.0, 1 - cash_buffer)
    if total_eval <= 0 or not holdings:
        return {"method": "score_tilted_inverse_vol", "cash_weight": 1.0, "positions": []}

    weighted = []
    for item in holdings:
        prices = item.get("prices", [])
        profile = (
            build_profile(
                prices,
                item.get("highs", []),
                item.get("volumes", []),
                symbol=item.get("symbol", ""),
            )
            if prices else build_profile([], symbol=item.get("symbol", ""))
        )
        vol = volatility(prices) or 0.02
        weight_signal = max(0.1, 1 + profile["score"]) / vol
        weighted.append({**item, "profile": profile, "volatility": vol, "weight_signal": weight_signal})

    signal_sum = sum(item["weight_signal"] for item in weighted) or 1
    positions = []
    for item in weighted:
        price = float(item.get("price", 0))
        current_value = float(item.get("value", 0))
        current_weight = current_value / total_eval
        target_weight = min(max_single_weight, investable_weight * item["weight_signal"] / signal_sum)
        target_value = total_eval * target_weight
        delta_value = target_value - current_value
        rebalance_qty = math.floor(abs(delta_value) / price) if price > 0 else 0
        action = "hold" if rebalance_qty <= 0 else ("buy" if delta_value > 0 else "sell")
        positions.append({
            "symbol": item.get("symbol", ""),
            "name": item.get("name", item.get("symbol", "")),
            "price": int(price),
            "qty": int(item.get("qty", 0)),
            "current_value": round(current_value),
            "current_weight": round(current_weight, 4),
            "target_weight": round(target_weight, 4),
            "target_value": round(target_value),
            "delta_value": round(delta_value),
            "rebalance_action": action,
            "rebalance_qty": rebalance_qty,
            "score": round(item["profile"]["score"], 4),
            "volatility": round(item["volatility"], 4),
            "reasons": item["profile"].get("reasons", []),
        })
    return {"method": "score_tilted_inverse_vol", "cash_weight": cash_buffer, "positions": positions}
