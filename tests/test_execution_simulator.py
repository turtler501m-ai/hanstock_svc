import unittest

from src.strategy.execution_simulator import (
    ExecutionConfig,
    ExecutionRequest,
    ExecutionSimulator,
    krx_tick_size,
    round_to_tick,
)


class ExecutionSimulatorTests(unittest.TestCase):
    def test_market_buy_uses_ask_spread_tick_and_costs(self):
        result = ExecutionSimulator(ExecutionConfig()).execute(ExecutionRequest(
            symbol="005930", side="buy", quantity=10, reference_price=70_000,
            bid=69_900, ask=70_100, bar_volume=10_000,
        ))

        self.assertEqual(result.status, "filled")
        self.assertEqual(result.filled_quantity, 10)
        self.assertGreaterEqual(result.fill_price, 70_000)
        self.assertEqual(result.fill_price % krx_tick_size(result.fill_price), 0)
        self.assertGreater(result.commission, 0)

    def test_low_liquidity_produces_partial_fill(self):
        result = ExecutionSimulator(ExecutionConfig(max_participation_rate=0.1)).execute(
            ExecutionRequest(
                symbol="005930", side="buy", quantity=100, reference_price=70_000,
                bar_volume=50,
            )
        )

        self.assertEqual(result.status, "partial")
        self.assertEqual(result.filled_quantity, 5)
        self.assertEqual(result.remaining_quantity, 95)

    def test_failure_timeout_and_cancel_are_explicit(self):
        failed = ExecutionSimulator(ExecutionConfig(order_failure_rate=1.0)).execute(
            ExecutionRequest(symbol="AAA", side="buy", quantity=1, reference_price=100)
        )
        unknown = ExecutionSimulator(ExecutionConfig(timeout_rate=1.0)).execute(
            ExecutionRequest(symbol="AAA", side="buy", quantity=1, reference_price=100)
        )
        canceled = ExecutionSimulator().cancel(3)

        self.assertEqual(failed.status, "rejected")
        self.assertEqual(unknown.status, "unknown")
        self.assertEqual(canceled["status"], "canceled")

    def test_invalid_market_conditions_are_rejected(self):
        simulator = ExecutionSimulator(ExecutionConfig(minimum_order_value=10_000))
        halted = simulator.execute(ExecutionRequest(
            symbol="AAA", side="buy", quantity=1, reference_price=100, halted=True,
        ))
        too_small = simulator.execute(ExecutionRequest(
            symbol="AAA", side="buy", quantity=1, reference_price=100,
        ))

        self.assertEqual(halted.reason, "trading_halted")
        self.assertEqual(too_small.reason, "minimum_order_value")

    def test_account_orderable_cash_and_quantity_are_used(self):
        simulator = ExecutionSimulator()
        cash = simulator.execute(ExecutionRequest(
            symbol="AAA", side="buy", quantity=10, reference_price=1_000,
            available_cash=5_000,
        ))
        quantity = simulator.execute(ExecutionRequest(
            symbol="AAA", side="sell", quantity=10, reference_price=1_000,
            available_quantity=5,
        ))

        self.assertEqual(cash.reason, "insufficient_orderable_cash")
        self.assertEqual(quantity.reason, "insufficient_sellable_quantity")

    def test_rate_limit_is_an_execution_outcome(self):
        result = ExecutionSimulator().execute(ExecutionRequest(
            symbol="AAA", side="buy", quantity=1, reference_price=100,
            api_rate_limited=True,
        ))
        self.assertEqual(result.reason, "api_rate_limit")

    def test_tick_rounding_is_conservative_by_side(self):
        self.assertEqual(round_to_tick(70_149, 100, side="buy"), 70_100)
        self.assertEqual(round_to_tick(70_149, 100, side="sell"), 70_200)


if __name__ == "__main__":
    unittest.main()
