"""Compatibility router support for bounded stock route modules.

The stock route modules still expose a few names from the legacy aggregate
module.  Keeping that bridge in one place avoids four subtly different router
wrappers while the remaining callers migrate to explicit services.
"""

from __future__ import annotations

import functools
import inspect
from types import ModuleType
from typing import Any

from fastapi import APIRouter


def refresh_dependencies(
    namespace: dict[str, Any],
    dependencies: tuple[ModuleType, ...],
    *,
    protected: frozenset[str] = frozenset(),
) -> None:
    """Refresh legacy names without overwriting the bounded router state."""
    protected_names = {
        "router",
        "_refresh_legacy_dependencies",
        "_CompatRouter",
        "_stock",
        "_order",
        "_performance",
        "_analysis",
        "_plan",
    } | set(protected)
    for module in dependencies:
        namespace.update({
            name: value
            for name, value in vars(module).items()
            if name not in protected_names and not name.startswith("__")
        })


class CompatRouter(APIRouter):
    """APIRouter that refreshes legacy dependencies per request."""

    def __init__(self, *, namespace: dict[str, Any], dependencies: tuple[ModuleType, ...], **kwargs):
        super().__init__(**kwargs)
        self._namespace = namespace
        self._dependencies = dependencies

    def _refresh(self) -> None:
        refresh_dependencies(self._namespace, self._dependencies)

    def api_route(self, path: str, **kwargs):
        register = super().api_route(path, **kwargs)

        def decorator(endpoint):
            if inspect.iscoroutinefunction(endpoint):
                @functools.wraps(endpoint)
                async def dispatch(*args, **inner_kwargs):
                    self._refresh()
                    return await endpoint(*args, **inner_kwargs)
            else:
                @functools.wraps(endpoint)
                def dispatch(*args, **inner_kwargs):
                    self._refresh()
                    return endpoint(*args, **inner_kwargs)
            register(dispatch)
            return endpoint

        return decorator
