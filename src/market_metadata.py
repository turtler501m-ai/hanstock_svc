from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Any


METADATA_PATH = Path("config/kr_stock_metadata.json")
PLACEHOLDER_STOCK_NAMES = {
    "",
    "-",
    "Unknown",
    "알 수 없는 종목",
    "우량 종목",
}
PLACEHOLDER_SECTORS = {
    "",
    "-",
    "미분류",
    "Unknown",
}
STOCK_SEARCH_ALIASES = {
    "010120": ("LS ELECTRIC", "LS일렉트릭"),
}


def normalize_kr_symbol(symbol: Any) -> str:
    value = str(symbol or "").strip().upper()
    if value.isdigit() and len(value) < 6:
        return value.zfill(6)
    return value


def normalize_kr_order_symbol(symbol: Any) -> str:
    """Return the six-character domestic balance/order symbol."""
    value = normalize_kr_symbol(symbol)
    if len(value) == 7 and value.startswith("Q") and value[1:].isdigit():
        return value[1:]
    return value


def is_placeholder_stock_name(name: Any, symbol: Any = "") -> bool:
    value = str(name or "").strip()
    return (
        value in PLACEHOLDER_STOCK_NAMES
        or bool(symbol and value == normalize_kr_symbol(symbol))
    )


def is_placeholder_sector(sector: Any) -> bool:
    return str(sector or "").strip() in PLACEHOLDER_SECTORS


@functools.lru_cache(maxsize=1)
def load_kr_stock_metadata() -> dict[str, dict[str, Any]]:
    try:
        payload = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return {}
    symbols = payload.get("symbols") if isinstance(payload, dict) else None
    if not isinstance(symbols, dict):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for symbol, item in symbols.items():
        if not isinstance(item, dict):
            continue
        normalized = normalize_kr_symbol(symbol)
        result[normalized] = {**item, "symbol": normalized}
    return result


def resolve_stock_name(symbol: Any, fallback: Any = None) -> str:
    normalized = normalize_kr_symbol(symbol)
    item = load_kr_stock_metadata().get(normalized, {})
    metadata_name = str(item.get("name") or "").strip()
    if metadata_name and not is_placeholder_stock_name(metadata_name, normalized):
        return metadata_name
    fallback_name = str(fallback or "").strip()
    if fallback_name and not is_placeholder_stock_name(fallback_name, normalized):
        return fallback_name
    return normalized


def resolve_stock_sector(symbol: Any, fallback: Any = None) -> str:
    normalized = normalize_kr_symbol(symbol)
    item = load_kr_stock_metadata().get(normalized, {})
    metadata_sector = str(item.get("sector") or "").strip()
    if metadata_sector and not is_placeholder_sector(metadata_sector):
        return metadata_sector
    fallback_sector = str(fallback or "").strip()
    if fallback_sector and not is_placeholder_sector(fallback_sector):
        return fallback_sector
    return "미분류"


def search_kr_stocks(query: Any, limit: int = 20) -> list[dict[str, Any]]:
    """Search checked-in KRX metadata by a partial name or symbol."""
    needle = str(query or "").strip().casefold()
    if not needle:
        return []
    safe_limit = max(1, min(int(limit or 20), 50))
    matches: list[tuple[tuple[int, int, str, str], dict[str, Any]]] = []
    for symbol, item in load_kr_stock_metadata().items():
        # The existing watchlist/order contract accepts six-digit domestic
        # symbols only. Do not offer newer alphanumeric metadata entries that
        # the add endpoint would immediately reject.
        if not symbol.isdigit() or len(symbol) != 6:
            continue
        name = str(item.get("name") or "").strip()
        symbol_key = symbol.casefold()
        name_key = name.casefold()
        aliases = tuple(
            str(alias).strip() for alias in (
                *STOCK_SEARCH_ALIASES.get(symbol, ()),
                *(item.get("aliases") or ()),
            ) if str(alias).strip()
        )
        alias_keys = tuple(alias.casefold() for alias in aliases)
        if (
            needle not in symbol_key
            and needle not in name_key
            and not any(needle in alias for alias in alias_keys)
        ):
            continue
        rank = (
            0 if needle in {symbol_key, name_key, *alias_keys} else 1,
            0 if symbol_key.startswith(needle) or name_key.startswith(needle)
            or any(alias.startswith(needle) for alias in alias_keys) else 1,
            name_key,
            symbol_key,
        )
        matches.append((rank, {
            "symbol": symbol,
            "name": name or symbol,
            "market": str(item.get("market") or "").strip(),
            "sector": resolve_stock_sector(symbol, item.get("sector")),
        }))
    matches.sort(key=lambda row: row[0])
    return [row for _, row in matches[:safe_limit]]
