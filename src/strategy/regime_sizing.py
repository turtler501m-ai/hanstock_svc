"""Market-regime sizing for generated execution-plan rows."""

from __future__ import annotations


def apply_market_regime_sizing(
    plan: list[dict],
    *,
    multiplier: float,
    block_reason: str | None = None,
) -> list[dict]:
    """Scale only new-risk rows; reductions and exits remain untouched."""
    normalized = max(0.0, min(1.0, float(multiplier)))
    for row in plan:
        if str(row.get("action") or "").lower() != "buy":
            continue
        original_qty = int(float(row.get("qty") or 0))
        scaled_qty = int(original_qty * normalized)
        row["qty"] = scaled_qty
        if row.get("estimated_cost") is not None and original_qty > 0:
            row["estimated_cost"] = float(row["estimated_cost"]) * scaled_qty / original_qty
        row.setdefault("metadata", {})["market_regime_sizing"] = {
            "original_qty": original_qty,
            "multiplier": normalized,
            "scaled_qty": scaled_qty,
            "block_reason": block_reason,
        }
    return plan
