import unittest

from src.strategy.portfolio_service import generate_optimizer_plan


class PortfolioServiceTests(unittest.TestCase):
    def test_empty_portfolio_keeps_allocation_contract(self):
        result = generate_optimizer_plan(
            [], 0, cash_buffer=0.2, max_single_weight=0.5,
            build_profile=lambda *_args, **_kwargs: {"score": 0},
            volatility=lambda _prices: 0.1,
        )
        self.assertEqual(result, {"method": "score_tilted_inverse_vol", "cash_weight": 1.0, "positions": []})

    def test_target_weight_and_rebalance_quantity_are_calculated(self):
        result = generate_optimizer_plan(
            [{"symbol": "005930", "price": 100, "value": 200, "qty": 2, "prices": [90, 100]}],
            1000,
            cash_buffer=0.2,
            max_single_weight=0.5,
            build_profile=lambda *_args, **_kwargs: {"score": 3, "reasons": ["test"]},
            volatility=lambda _prices: 0.1,
        )
        position = result["positions"][0]
        self.assertEqual(position["target_weight"], 0.5)
        self.assertEqual(position["rebalance_action"], "buy")
        self.assertEqual(position["rebalance_qty"], 3)


if __name__ == "__main__":
    unittest.main()
