"""Pure cache policy helpers used by the dashboard.

This module deliberately has no broker, database, or FastAPI dependency.  It
keeps timestamp parsing and freshness metadata out of the dashboard
orchestrator so the policy can be tested independently.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable, Mapping


def cache_age_seconds(
    payload: Mapping[str, Any],
    *,
    now: Callable[[], datetime],
) -> float | None:
    """Return cache age in seconds, or ``None`` when metadata is unusable."""
    metadata = payload.get("_cache") or {}
    if not isinstance(metadata, Mapping):
        return None
    captured_at = str(metadata.get("cached_at") or "")
    if not captured_at:
        return None
    try:
        return (now() - datetime.fromisoformat(captured_at)).total_seconds()
    except (TypeError, ValueError, OverflowError):
        return None


def mark_cache_fresh(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Copy a cache payload and mark its metadata as fresh."""
    result = dict(payload)
    metadata = dict(result.get("_cache") or {})
    metadata["stale"] = False
    result["_cache"] = metadata
    return result
