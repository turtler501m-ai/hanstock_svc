"""Shared normalization for Namuh order responses."""

from __future__ import annotations

from collections.abc import Mapping


SUCCESS_RESPONSE_CODES = frozenset({"00000", "00166", "00221", "13578"})


def broker_order_accepted(payload: Mapping[str, object] | None) -> bool:
    """Return whether an order response means the broker accepted the order."""
    if not isinstance(payload, Mapping):
        return False
    if str(payload.get("rt_cd") or "").strip() == "0":
        return True
    if str(payload.get("rsp_cd") or "").strip() in SUCCESS_RESPONSE_CODES:
        return True

    message = str(
        payload.get("rsp_msg") or payload.get("msg1") or payload.get("message") or ""
    ).strip()
    output = payload.get("output") or payload.get("Output_0") or {}
    if not isinstance(output, Mapping):
        output = {}
    order_id = (
        payload.get("broker_order_id") or payload.get("ODNO") or payload.get("odno")
        or output.get("ODNO") or output.get("odno")
        or output.get("mkt_orr_no") or output.get("itg_orr_no")
    )
    completion = "주문" in message and ("완료" in message or "접수" in message)
    return bool(order_id and completion)
