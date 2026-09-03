"""Domestic-stock broker selection and construction."""

import os
from typing import Any

from src.broker.base import DomesticStockBroker
SUPPORTED_DOMESTIC_STOCK_BROKERS = frozenset({"namuh"})


def selected_domestic_stock_broker(value: str | None = None) -> str:
    selected = (value or os.environ.get("DOMESTIC_STOCK_BROKER", "namuh")).strip().lower()
    if selected not in SUPPORTED_DOMESTIC_STOCK_BROKERS:
        allowed = ", ".join(sorted(SUPPORTED_DOMESTIC_STOCK_BROKERS))
        raise ValueError(f"Unsupported domestic stock broker: {selected!r}. Expected one of: {allowed}")
    return selected


def create_domestic_stock_broker(
    broker: str | None = None,
    *,
    client: Any | None = None,
    notify_errors: bool = False,
    settings: Any | None = None,
    order_submission_enabled: bool = False,
) -> DomesticStockBroker:
    selected = selected_domestic_stock_broker(broker)
    from src.broker.nhplug_adapter import NHPlugBrokerAdapter
    from src.broker.nhplug_client import NHPlugRestClient

    if client is None:
        if settings is None:
            from src.config import config
            settings = config
        trading_env = str(getattr(settings, "trading_env", "demo") or "demo").lower()
        nh_env = str(getattr(settings, "nhplug_environment", "mock") or "mock").lower()
        expected = "live" if trading_env == "real" else "mock"
        if nh_env != expected:
            raise ValueError("NHPLUG_ENVIRONMENT must match TRADING_ENV before broker activation")
        app_key = str(getattr(settings, "nhplug_app_key", "") or "").strip()
        app_secret = str(getattr(settings, "nhplug_app_secret", "") or "").strip()
        account = str(getattr(settings, "nhplug_account", "") or "").strip()
        if not app_key or not app_secret or not account:
            raise ValueError("NHPLUG app key, app secret, and account are required")
        client = NHPlugRestClient(app_key, app_secret, environment=nh_env, account=account)
    return NHPlugBrokerAdapter(client, account=getattr(client, "account", ""), order_submission_enabled=order_submission_enabled)
