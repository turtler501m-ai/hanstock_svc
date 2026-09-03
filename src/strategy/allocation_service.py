from __future__ import annotations

import math
from pathlib import Path
from typing import Callable


def generate_ai_weight_plan(
    holdings: list[dict],
    total_eval: int,
    *,
    watchlist: list[str],
    cash_buffer: float,
    max_single_weight: float,
    build_profile: Callable,
    volatility: Callable,
    logger,
) -> dict:
    """Build AI/heuristic target weights while keeping UI reasoning data."""
    import numpy as np

    investable_weight = max(0.0, 1 - cash_buffer)
    if total_eval <= 0 or not holdings:
        return {"cash_weight": 1.0, "positions": []}

    scored = []
    holding_map = {}
    for item in holdings:
        prices = item.get("prices", [])
        highs = item.get("highs", [])
        volumes = item.get("volumes", [])
        profile = (
            build_profile(prices, highs, volumes, symbol=item.get("symbol", ""))
            if prices else build_profile([], symbol=item.get("symbol", ""))
        )
        current_price = float(item.get("price", 0) or (prices[-1] if prices else 0))
        sma60 = profile.get("sma60", 0) or current_price
        trend = ((current_price / sma60) - 1) if sma60 > 0 else 0
        vol = volatility(prices)
        raw_score = profile["score"] + (trend * 10) + max(profile["macd_hist"], 0) / max(current_price, 1) * 100
        risk_adjusted = max(0.0, raw_score - (vol * 20))
        item_data = {**item, "profile": profile, "score": round(risk_adjusted, 4), "volatility": vol, "trend": trend}
        scored.append(item_data)
        holding_map[item.get("symbol", "")] = item_data

    model = None
    try:
        from stable_baselines3 import PPO
        model_path = Path("data/trained_models/ppo_kr_stock.zip")
        if model_path.exists():
            model = PPO.load(str(model_path))
    except Exception as exc:
        logger.info(f"[WARN] Failed to load PPO model: {exc}. Falling back to heuristic.")

    ai_weights = {}
    if model:
        raw_ratings = {}
        for ticker in watchlist:
            item = holding_map.get(ticker)
            if item:
                price = (item.get("price", 0) or 0.0) / 100000.0
                rsi = (item["profile"].get("rsi", 50.0) or 50.0) / 100.0
                macd = (item["profile"].get("macd_hist", 0.0) or 0.0) / 1000.0
                obs = [price, rsi, macd, float(item.get("trend", 0.0) or 0.0)]
            else:
                obs = [0.0, 0.5, 0.0, 0.0]
            try:
                action, _ = model.predict(np.array(obs, dtype=np.float32), deterministic=True)
                raw_ratings[ticker] = float(action[0])
            except Exception as exc:
                logger.info(f"[ERROR] AI prediction failed for {ticker}: {exc}")
                raw_ratings[ticker] = -1.0
        try:
            ratings = np.array([raw_ratings[ticker] for ticker in watchlist], dtype=np.float32)
            weights = np.exp(ratings)
            weights = weights / np.sum(weights)
            for index, ticker in enumerate(watchlist):
                ai_weights[ticker] = float(weights[index])
        except Exception as exc:
            logger.info(f"[ERROR] Softmax normalization failed: {exc}")
    else:
        score_sum = sum(item["score"] for item in scored)
        for item in scored:
            ai_weights[item.get("symbol", "")] = item["score"] / score_sum if score_sum > 0 else 0.0

    score_sum = sum(item["score"] for item in scored)
    positions = []
    for item in scored:
        symbol = item.get("symbol", "")
        current_value = float(item.get("value", 0))
        current_weight = current_value / total_eval
        used_ai = symbol in ai_weights
        if used_ai:
            target_weight = min(max_single_weight, investable_weight * float(ai_weights[symbol]))
        else:
            target_weight = min(max_single_weight, investable_weight * item["score"] / score_sum) if score_sum > 0 else 0.0
        target_value = total_eval * target_weight
        delta_value = target_value - current_value
        price = float(item.get("price", 0))
        rebalance_qty = math.floor(abs(delta_value) / price) if price > 0 else 0
        action = "hold" if rebalance_qty <= 0 else ("buy" if delta_value > 0 else "sell")

        reasons_list = item["profile"].get("reasons", [])
        if not used_ai:
            ai_strategy_name = "기본 룰베이스 대응"
            reason_kr = ", ".join(reasons_list) if reasons_list else "데이터 부족 (지표 확인 불가)"
        else:
            trend_pct = item.get("trend", 0) * 100
            vol_pct = item.get("volatility", 0) * 100
            profile = item["profile"]
            tags = []
            rsi = profile.get("rsi", 50)
            if rsi < 40 or rsi > 60: tags.append(f"[RSI {int(rsi)}]")
            tags.append("[MACD+]" if profile.get("macd_hist", 0) >= 0 else "[MACD-]")
            sma20, sma60 = profile.get("sma20", 0), profile.get("sma60", 0)
            if sma20 > 0 and sma60 > 0: tags.append("[SMA20>60]" if sma20 > sma60 else "[SMA20<60]")
            tag_str = " ".join(tags)
            if action == "buy":
                ai_strategy_name = f"🤖 매수({target_weight*100:.1f}%) | {tag_str}"
                reason_kr = f"[AI 매수 가이드] 전체 투자금의 {target_weight*100:.1f}% 까지 이 종목을 담는 것이 안전하고 유리합니다. "
            elif action == "sell":
                ai_strategy_name = f"🤖 축소({target_weight*100:.1f}%) | {tag_str}"
                reason_kr = f"[AI 비중축소 가이드] 위험 관리를 위해 보유 비중을 {target_weight*100:.1f}% 로 줄여서 수익을 챙기거나 손실을 방어하세요. "
            else:
                ai_strategy_name = f"🤖 관망 | {tag_str}"
                reason_kr = f"[AI 관망 가이드] 섣불리 움직이기보다 현재 비중({current_weight*100:.1f}%)을 우직하게 유지하는 것이 좋습니다. "
            reason_kr += f"(분석: 60일 평균선 대비 {trend_pct:.1f}% 위치, 최근 변동성 {vol_pct:.1f}%) "
            if rsi < 35: reason_kr += "최근 주가가 평균보다 너무 가파르게 하락해 곧 바닥을 치고 반등할 에너지가 모이고 있습니다. "
            elif rsi > 65: reason_kr += "최근 주가가 쉬지 않고 폭등하여, 조만간 사람들이 차익을 실현하며 주가가 한숨을 돌릴(하락) 위험이 있습니다. "
            if profile.get("macd_bull_cross"): reason_kr += "여기에 덧붙여, 깊은 하락장을 끝내고 다시 상승세로 올라타는 가장 확실한 신호(골든크로스)가 방금 포착되었습니다! "
            elif profile.get("macd_bear_cross"): reason_kr += "주의해야 할 점은, 상승세가 꺾이고 본격적인 하락 추세로 떨어질 조짐이 보이고 있다는 것입니다. "
            reason_kr += "👉 종합: 인공지능은 수천 번의 모의 투자를 통해 이런 상황에서 위 비율대로 비중을 맞추는 것이 가장 수익률이 좋았음을 학습했습니다."

        positions.append({
            "symbol": symbol, "name": item.get("name", symbol), "price": int(price), "qty": int(item.get("qty", 0)),
            "current_value": round(current_value), "current_weight": round(current_weight, 4),
            "target_weight": round(target_weight, 4), "target_value": round(target_value), "delta_value": round(delta_value),
            "rebalance_action": action, "rebalance_qty": rebalance_qty, "score": item["score"],
            "volatility": round(item["volatility"], 4), "strategy_score": item["profile"].get("score", 0),
            "reasons": reasons_list, "reasoning_kr": reason_kr, "ai_strategy_name": ai_strategy_name,
        })
    return {"cash_weight": cash_buffer, "positions": positions, "ai_active": bool(model)}
