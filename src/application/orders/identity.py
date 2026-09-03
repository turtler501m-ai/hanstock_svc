from __future__ import annotations

import hashlib


def broker_account_scope_key(market: str) -> str:
    """Return a non-secret stable scope for the configured broker account."""
    from src.config import config

    market = str(market or "KR").upper()
    env = str(config.trading_env or "demo").lower()
    if market != "KR":
        raise ValueError("hanstock_svc supports domestic KR accounts only")
    account = (
        config.kiwoom_domestic_real_account if env == "real"
        else config.kiwoom_domestic_demo_account
    )
    raw = f"kiwoom:{env}:{market}:{str(account or '').strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]
