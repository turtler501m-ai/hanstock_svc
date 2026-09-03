# -*- coding: utf-8 -*-
"""Neutral narrative component for the domestic AI scoring pipeline."""
from __future__ import annotations

from typing import Any

from src.ai_stock.constants import MARKET_KR


def list_narratives(market: str) -> dict[str, Any]:
    return {"narratives": [{"market": MARKET_KR, "supported": False, "signals": [], "count": 0}]}


def narrative_score_for(market: str, symbol: str, name: str | None = None) -> dict[str, Any]:
    """종목의 내러티브 점수(0~100)와 연결 근거. 매칭 없으면 0."""
    if market != MARKET_KR:
        return {"narrative_score": 0.0, "related": [], "evidence": []}
    return {"narrative_score": 0.0, "related": [], "evidence": []}
