"""Cost-aware walk-forward validation for the deterministic technical strategy."""

from __future__ import annotations

from typing import Callable


def run_technical_walk_forward(
    prices: list[float],
    highs: list[float],
    volumes: list[float],
    *,
    profile_builder: Callable[[list[float], list[float], list[float]], dict],
    min_score: float = 4.0,
    folds: int = 3,
    warmup: int = 60,
    stop_loss_pct: float = 10.0,
    trailing_activation_pct: float = 10.0,
    trailing_stop_pct: float = 7.0,
    cost_bps: float = 10.0,
    opens: list[float] | None = None,
    lows: list[float] | None = None,
    take_profit_pct: float | None = None,
) -> dict:
    size = min(len(prices), len(highs), len(volumes))
    if size < warmup + max(20, folds * 5):
        return {"ok": False, "passed": False, "reason": "insufficient_data", "folds": []}

    start = warmup
    fold_size = max(5, (size - start) // max(1, folds))
    results = []
    all_pnls = []
    opens = list(opens or prices)
    lows = list(lows or prices)
    stop_fill_counts = {"gap": 0, "intrabar": 0, "close": 0, "target": 0}
    equity = 1.0
    equity_curve = [equity]
    cost_rate = max(0.0, cost_bps) / 10_000

    for fold_index in range(max(1, folds)):
        fold_start = start + fold_index * fold_size
        fold_end = size if fold_index == folds - 1 else min(size, fold_start + fold_size)
        position = None
        fold_start_equity = equity
        fold_trades = []
        for index in range(fold_start, fold_end):
            current = float(prices[index])
            current_open = float(opens[index]) if index < len(opens) and float(opens[index] or 0) > 0 else current
            current_low = float(lows[index]) if index < len(lows) and float(lows[index] or 0) > 0 else current
            current_high = float(highs[index]) if index < len(highs) and float(highs[index] or 0) > 0 else current
            # A signal using today's close cannot also fill at that same close.
            # Build the decision from the completed previous bar and execute at
            # the next available bar supplied by ``current``.
            history_prices = prices[:index]
            profile = profile_builder(history_prices, highs[:index], volumes[:index])
            if position is None:
                if float(profile.get("score") or 0) >= min_score:
                    entry = current_open * (1 + cost_rate)
                    position = {"entry": entry, "peak": current_high}
                equity_curve.append(equity)
                continue

            position["peak"] = max(position["peak"], current_high)
            return_pct = (current / position["entry"] - 1) * 100
            drawdown_pct = (current / position["peak"] - 1) * 100
            peak_return_pct = (position["peak"] / position["entry"] - 1) * 100
            exit_reason = ""
            stop_price = position["entry"] * (1 - abs(stop_loss_pct) / 100)
            exit_price_before_cost = current
            if current_open <= stop_price or current_low <= stop_price:
                exit_reason = "fixed_stop"
                if current_open <= stop_price:
                    exit_price_before_cost = current_open
                    stop_fill_counts["gap"] += 1
                elif current_low <= stop_price:
                    exit_price_before_cost = stop_price
                    stop_fill_counts["intrabar"] += 1
                else:
                    stop_fill_counts["close"] += 1
            elif peak_return_pct >= trailing_activation_pct and (
                current_open <= position["peak"] * (1 - abs(trailing_stop_pct) / 100)
                or current_low <= position["peak"] * (1 - abs(trailing_stop_pct) / 100)
            ):
                exit_reason = "trailing_stop"
                trailing_price = position["peak"] * (1 - abs(trailing_stop_pct) / 100)
                if current_open <= trailing_price:
                    exit_price_before_cost = current_open
                    stop_fill_counts["gap"] += 1
                elif current_low <= trailing_price:
                    exit_price_before_cost = trailing_price
                    stop_fill_counts["intrabar"] += 1
            elif take_profit_pct is not None and position["entry"] > 0:
                target_price = position["entry"] * (1 + abs(float(take_profit_pct)) / 100)
                if current_open >= target_price:
                    exit_reason = "take_profit"
                    exit_price_before_cost = current_open
                    stop_fill_counts["target"] += 1
                elif current_high >= target_price:
                    exit_reason = "take_profit"
                    exit_price_before_cost = target_price
                    stop_fill_counts["target"] += 1
            elif profile.get("sma_dead_cross"):
                exit_reason = "dead_cross"
            if exit_reason:
                exit_price = exit_price_before_cost * (1 - cost_rate)
                pnl = exit_price / position["entry"] - 1
                equity *= 1 + pnl
                equity_curve.append(equity)
                fold_trades.append({"pnl": pnl, "reason": exit_reason})
                all_pnls.append(pnl)
                position = None
            else:
                # Mark open risk to market.  Realized-only curves materially
                # understate drawdown while a position is underwater.
                mark_to_market = equity * (current / position["entry"]) if position["entry"] > 0 else equity
                equity_curve.append(max(0.0, mark_to_market))

        if position is not None:
            final_index = fold_end - 1
            final_close = float(prices[final_index])
            exit_price = final_close * (1 - cost_rate)
            pnl = exit_price / position["entry"] - 1
            equity *= 1 + pnl
            fold_trades.append({"pnl": pnl, "reason": "fold_end"})
            all_pnls.append(pnl)
        results.append({
            "fold": fold_index + 1,
            "trade_count": len(fold_trades),
            "return_pct": round((equity / fold_start_equity - 1) * 100, 2),
        })

    wins = [pnl for pnl in all_pnls if pnl > 0]
    losses = [pnl for pnl in all_pnls if pnl < 0]
    peak = equity_curve[0]
    max_drawdown = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - value) / peak)
    profit_factor = sum(wins) / abs(sum(losses)) if losses else (999.0 if wins else 0.0)
    positive_folds = sum(1 for row in results if row["return_pct"] > 0)
    win_mean = sum(wins) / len(wins) if wins else 0.0
    loss_mean = sum(losses) / len(losses) if losses else 0.0
    metrics = {
        "trade_count": len(all_pnls),
        "win_rate": round(len(wins) / len(all_pnls), 3) if all_pnls else 0.0,
        "average_win_pct": round(win_mean * 100, 3),
        "average_loss_pct": round(loss_mean * 100, 3),
        "average_payoff_ratio": round(
            win_mean / abs(loss_mean), 3
        ) if wins and losses else 0.0,
        "profit_factor": round(profit_factor, 2),
        "total_return_pct": round((equity - 1) * 100, 2),
        "max_drawdown_pct": round(max_drawdown * 100, 2),
        "positive_fold_ratio": round(positive_folds / len(results), 3) if results else 0.0,
        "expectancy_pct": round(
            (win_mean * len(wins) + loss_mean * len(losses))
            / len(all_pnls) * 100, 4
        ) if all_pnls else 0.0,
        "maximum_consecutive_losses": _maximum_consecutive_losses(all_pnls),
    }
    passed = (
        metrics["trade_count"] >= 3
        and metrics["profit_factor"] >= 1.05
        and metrics["max_drawdown_pct"] <= 20
        and metrics["positive_fold_ratio"] >= 0.5
    )
    return {
        "ok": True,
        "passed": passed,
        "metrics": metrics,
        "folds": results,
        "costs": {"round_trip_bps": cost_bps * 2, "modeled": True},
        "execution_model": {
            "signal_lag_bars": 1,
            "signal_source": "previous_completed_bar",
            "fill_source": "next_bar_ohlc_with_gap_and_intrabar_stops",
            "lookahead_protected": True,
            "stop_fill_counts": stop_fill_counts,
            "take_profit_mode": "enabled" if take_profit_pct is not None else "disabled",
        },
    }


def _maximum_consecutive_losses(values: list[float]) -> int:
    longest = current = 0
    for value in values:
        if value < 0:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest
