from __future__ import annotations

import concurrent.futures
import hashlib
import json
import sqlite3
from typing import Callable


def run_with_timeout(func: Callable, timeout_seconds: float):
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = executor.submit(func)
    try:
        return future.result(timeout=timeout_seconds)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def get_balance_data(
    api,
    *,
    allow_cache: bool,
    balance_cache_ttl_seconds: float,
    fetch_timeout_seconds: float,
    cache_lock,
    load_cache: Callable[[], dict | None],
    cache_age: Callable[[dict], float | None],
    mark_cache_fresh: Callable[[dict], dict],
    parse_balance: Callable[[dict], dict],
    save_cache: Callable[[dict], None],
    run_timeout: Callable[[Callable, float], dict] = run_with_timeout,
    persist_equity: Callable[[dict, dict], None] | None = None,
    recoverable_errors: tuple[type[BaseException], ...] = (Exception,),
) -> dict:
    """Fetch an account balance with a short-lived cache and stale fallback."""
    cached = load_cache() if allow_cache else None

    def fresh(value):
        age = cache_age(value)
        return age is not None and age < balance_cache_ttl_seconds

    if cached is not None and fresh(cached):
        return mark_cache_fresh(cached)

    with cache_lock:
        if allow_cache:
            cached = load_cache()
            if cached is not None and fresh(cached):
                return mark_cache_fresh(cached)
        try:
            balance_data = run_timeout(api.get_balance, fetch_timeout_seconds)
        except concurrent.futures.TimeoutError:
            if cached is not None:
                return cached
            raise RuntimeError("Namuh balance API timed out")
        except recoverable_errors:
            if allow_cache:
                cached = load_cache()
                if cached is not None:
                    return cached
            raise

        try:
            parsed_balance = parse_balance(balance_data)
        except recoverable_errors:
            if allow_cache:
                cached = load_cache()
                if cached is not None:
                    return cached
            raise

        if persist_equity is not None:
            persist_equity(balance_data, parsed_balance)
        save_cache(balance_data)
        return balance_data


def persist_account_equity(balance_data: dict, parsed_balance: dict, recorder: Callable) -> None:
    """Persist a normalized equity point without making balance reads fail."""
    summary_hash = hashlib.sha256(
        json.dumps(
            balance_data.get("output2") or {},
            ensure_ascii=False,
            sort_keys=True,
            default=str,
        ).encode("utf-8")
    ).hexdigest()
    try:
        recorder(
            total_equity=float(parsed_balance.get("total_eval") or 0),
            cash=float(parsed_balance.get("cash") or 0),
            stock_value=float(parsed_balance.get("stock_eval") or 0),
            source="namuh_balance",
            raw_summary_hash=summary_hash,
        )
    except (sqlite3.Error, OSError, ValueError, TypeError):
        return
