from __future__ import annotations

from collections.abc import Mapping, Sequence
from math import sqrt

from src.strategy.execution_simulator import ExecutionConfig, ExecutionRequest, ExecutionSimulator


def simulate_target_portfolio(
    target_weights_by_day: Sequence[Mapping[str, float]],
    returns_by_day: Sequence[Mapping[str, float]],
    *,
    initial_capital: float,
    commission_bps: float,
    slippage_bps: float,
    market_impact_bps: float,
    sell_tax_bps: float = 0.0,
    rebalance_threshold: float = 0.02,
    market_data_by_day: Sequence[Mapping[str, Mapping[str, float]]] | None = None,
    execution_config: ExecutionConfig | None = None,
    periods_per_year: int = 252,
) -> dict:
    """Simulate target-weight rebalancing with explicit trading costs.

    Each item represents one close-to-close holding period. Small target changes
    remain untraded so the result reflects an executable rebalance policy.
    """
    if len(target_weights_by_day) != len(returns_by_day):
        raise ValueError("target weights and returns must have the same length")
    if initial_capital <= 0:
        raise ValueError("initial_capital must be positive")

    threshold = max(0.0, float(rebalance_threshold))
    buy_cost_bps = max(0.0, commission_bps + slippage_bps + market_impact_bps)
    sell_cost_bps = max(0.0, buy_cost_bps + sell_tax_bps)
    current_weights: dict[str, float] = {}
    portfolio_value = float(initial_capital)
    equity_curve = [portfolio_value]
    peak = portfolio_value
    max_drawdown = 0.0
    trade_count = 0
    rebalance_count = 0
    buy_turnover = 0.0
    sell_turnover = 0.0
    total_cost_amount = 0.0
    gross_profit = 0.0
    gross_loss = 0.0
    winning_periods = 0
    losing_periods = 0
    execution_counts = {"filled": 0, "partial": 0, "rejected": 0, "unknown": 0, "canceled": 0}
    simulator = ExecutionSimulator(execution_config) if market_data_by_day is not None else None
    net_period_returns: list[float] = []

    for day_index, (raw_targets, period_returns) in enumerate(zip(target_weights_by_day, returns_by_day)):
        targets = {
            str(symbol): max(0.0, float(weight))
            for symbol, weight in raw_targets.items()
            if float(weight) > 0.0
        }
        target_total = sum(targets.values())
        if target_total > 1.0:
            targets = {symbol: weight / target_total for symbol, weight in targets.items()}

        executed_weights = dict(current_weights)
        period_buy_turnover = 0.0
        period_sell_turnover = 0.0
        period_trades = 0
        period_execution_cost = 0.0
        for symbol in set(current_weights) | set(targets):
            current = float(current_weights.get(symbol, 0.0))
            target = float(targets.get(symbol, 0.0))
            delta = target - current
            if abs(delta) < threshold:
                continue
            if simulator is not None:
                quote = dict((market_data_by_day[day_index] if day_index < len(market_data_by_day) else {}).get(symbol) or {})
                reference = float(quote.get("open") or quote.get("price") or quote.get("close") or 0.0)
                requested = max(1, int(round(portfolio_value * abs(delta) / reference))) if reference > 0 else 0
                result = simulator.execute(ExecutionRequest(
                    symbol=str(symbol), side="buy" if delta > 0 else "sell",
                    quantity=requested, reference_price=reference,
                    order_type=str(quote.get("order_type") or "market"),
                    bid=float(quote.get("bid") or 0.0), ask=float(quote.get("ask") or 0.0),
                    bar_volume=float(quote.get("volume") or 0.0), adv=float(quote.get("adv") or 0.0),
                    tick_size=float(quote.get("tick_size") or 0.0),
                    halted=bool(quote.get("halted", False)),
                    limit_up=float(quote.get("limit_up") or 0.0),
                    limit_down=float(quote.get("limit_down") or 0.0),
                    available_cash=float(quote.get("available_cash") or 0.0),
                    available_quantity=int(quote.get("available_quantity") or 0),
                    api_rate_limited=bool(quote.get("api_rate_limited", False)),
                ))
                execution_counts[result.status] = execution_counts.get(result.status, 0) + 1
                if result.remaining_quantity > 0 and simulator.config.cancel_unfilled:
                    cancellation = simulator.cancel(result.remaining_quantity)
                    execution_counts[cancellation["status"]] = execution_counts.get(cancellation["status"], 0) + 1
                fill_ratio = result.filled_quantity / requested if requested > 0 else 0.0
                actual_delta = delta * fill_ratio
                executed_weights[symbol] = current + actual_delta
                if result.filled_quantity > 0:
                    if delta > 0:
                        period_buy_turnover += abs(delta) * fill_ratio
                    else:
                        period_sell_turnover += abs(delta) * fill_ratio
                    period_execution_cost += result.commission + result.tax
                    period_execution_cost += result.gross_value * result.spread_bps / 20_000
                    period_execution_cost += result.gross_value * result.slippage_bps / 10_000
                if result.status in {"rejected", "unknown"}:
                    continue
            else:
                executed_weights[symbol] = target
            period_trades += 1
            if simulator is None and delta > 0:
                period_buy_turnover += delta
            elif simulator is None:
                period_sell_turnover += abs(delta)

        executed_weights = {
            symbol: weight for symbol, weight in executed_weights.items() if weight > 1e-12
        }
        trade_count += period_trades
        if period_trades:
            rebalance_count += 1
        buy_turnover += period_buy_turnover
        sell_turnover += period_sell_turnover

        cost_fraction = (
            period_buy_turnover * buy_cost_bps
            + period_sell_turnover * sell_cost_bps
        ) / 10_000.0
        cost_amount = period_execution_cost if simulator is not None else portfolio_value * cost_fraction
        total_cost_amount += cost_amount

        gross_return = sum(
            weight * float(period_returns.get(symbol, 0.0))
            for symbol, weight in executed_weights.items()
        )
        previous_value = portfolio_value
        portfolio_value = max(0.0, (portfolio_value - cost_amount) * (1.0 + gross_return))
        net_pnl = portfolio_value - previous_value
        net_period_returns.append(net_pnl / previous_value if previous_value > 0 else 0.0)
        if net_pnl > 0:
            winning_periods += 1
            gross_profit += net_pnl
        elif net_pnl < 0:
            losing_periods += 1
            gross_loss += abs(net_pnl)

        gross_denominator = 1.0 + gross_return
        if gross_denominator > 0:
            current_weights = {
                symbol: weight * (1.0 + float(period_returns.get(symbol, 0.0))) / gross_denominator
                for symbol, weight in executed_weights.items()
                if weight > 1e-12
            }
        else:
            current_weights = {}

        equity_curve.append(portfolio_value)
        peak = max(peak, portfolio_value)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - portfolio_value) / peak)

    active_periods = winning_periods + losing_periods
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
    performance = _performance_metrics(equity_curve, net_period_returns, periods_per_year)
    return {
        "equity_curve": equity_curve,
        "metrics": {
            "trade_count": trade_count,
            "rebalance_count": rebalance_count,
            "win_rate": round(winning_periods / active_periods, 3) if active_periods else 0.0,
            "profit_factor": round(profit_factor, 2),
            "total_return_pct": round((portfolio_value / initial_capital - 1.0) * 100.0, 2),
            "max_drawdown_pct": round(max_drawdown * 100.0, 2),
            "buy_turnover_pct": round(buy_turnover * 100.0, 2),
            "sell_turnover_pct": round(sell_turnover * 100.0, 2),
            "total_turnover_pct": round((buy_turnover + sell_turnover) * 100.0, 2),
            **performance,
        },
        "costs": {
            "commission_bps": float(commission_bps),
            "slippage_bps": float(slippage_bps),
            "market_impact_bps": float(market_impact_bps),
            "sell_tax_bps": float(sell_tax_bps),
            "rebalance_threshold_pct": round(threshold * 100.0, 3),
            "total_cost_amount": round(total_cost_amount, 2),
            "total_cost_pct_initial": round(total_cost_amount / initial_capital * 100.0, 3),
            "modeled": True,
            "applied_to_returns": True,
            "execution_model": "microstructure" if simulator is not None else "aggregate_cost",
            "execution_counts": execution_counts,
            "spread_bps": float(execution_config.spread_bps) if execution_config else 0.0,
            "max_participation_rate": (
                float(execution_config.max_participation_rate) if execution_config else 1.0
            ),
        },
    }


def _performance_metrics(
    equity_curve: Sequence[float],
    period_returns: Sequence[float],
    periods_per_year: int,
) -> dict[str, float | int]:
    """Calculate annualized metrics without inventing a daily return series."""
    periods = len(period_returns)
    years = periods / max(1, int(periods_per_year))
    total_return = (equity_curve[-1] / equity_curve[0] - 1.0) if equity_curve and equity_curve[0] else 0.0
    cagr = (equity_curve[-1] / equity_curve[0]) ** (1 / years) - 1 if years > 0 and equity_curve[-1] >= 0 else -1.0
    mean = sum(period_returns) / periods if periods else 0.0
    variance = sum((value - mean) ** 2 for value in period_returns) / max(1, periods - 1)
    std = sqrt(max(0.0, variance))
    downside = [min(0.0, value) for value in period_returns]
    downside_dev = sqrt(sum(value * value for value in downside) / max(1, periods))
    sharpe = mean / std * sqrt(max(1, int(periods_per_year))) if std > 0 else 0.0
    sortino = mean / downside_dev * sqrt(max(1, int(periods_per_year))) if downside_dev > 0 else 0.0
    mdd = 0.0
    peak = equity_curve[0] if equity_curve else 0.0
    for value in equity_curve:
        peak = max(peak, value)
        if peak > 0:
            mdd = max(mdd, (peak - value) / peak)
    wins = [value for value in period_returns if value > 0]
    losses = [abs(value) for value in period_returns if value < 0]
    expectancy = (sum(wins) / len(wins) if wins else 0.0) * (len(wins) / periods if periods else 0.0) - (
        sum(losses) / len(losses) if losses else 0.0
    ) * (len(losses) / periods if periods else 0.0)
    return {
        "cagr_pct": round(cagr * 100, 3),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "calmar_ratio": round(cagr / mdd, 3) if mdd > 0 else 0.0,
        "expectancy_pct": round(expectancy * 100, 4),
        "average_period_return_pct": round(mean * 100, 4),
        "maximum_consecutive_losses": _maximum_consecutive_losses(period_returns),
    }


def _maximum_consecutive_losses(values: Sequence[float]) -> int:
    longest = current = 0
    for value in values:
        if value < 0:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest
