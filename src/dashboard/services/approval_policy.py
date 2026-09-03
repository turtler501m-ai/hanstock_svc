"""Pure approval retry policy for dashboard order handlers."""

from __future__ import annotations

from collections.abc import Callable


RETRYABLE_TRADE_STATUSES = frozenset(
    {"failed", "submitted", "accepted", "open", "partial", "partially_filled"}
)


def is_retry_eligible(
    approval: dict,
    trade: dict | None,
    *,
    today: Callable[[], str],
) -> bool:
    """Return whether a same-day sell approval can be retried."""
    if str(approval.get("action") or "").lower() != "sell":
        return False
    created_at = str(approval.get("created_at") or "").strip()
    if created_at and created_at[:10] != today():
        return False
    if str(approval.get("status") or "") == "pending":
        return False
    trade_status = str((trade or {}).get("order_status") or "").lower()
    approval_status = str(approval.get("status") or "").lower()
    return trade_status in RETRYABLE_TRADE_STATUSES or approval_status == "failed"
