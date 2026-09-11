import tempfile
import unittest
from pathlib import Path

from src.application.orders.models import OrderIntent
from src.application.orders.preflight import evaluate_order_capacity
from src.application.orders.repository import OrderLedgerRepository
from src.broker.models import AccountBalance, Holding, Quote
from src.db.connection import open_sqlite
from src.db.migrations import apply_migrations


class _Broker:
    def __init__(self, *, sellable=0, held=0, cash=0, ask=1000):
        self.balance = AccountBalance(
            holdings=(Holding("005930", quantity=held, sellable_quantity=sellable),),
            orderable_cash=cash,
        )
        self.quote = Quote("005930", current_price=ask, ask_price=ask)
        self.fetch_balance_kwargs = []

    def fetch_balance(self, **kwargs):
        self.fetch_balance_kwargs.append(kwargs)
        return self.balance

    def fetch_sellable_quantity(self, _symbol):
        return self.balance.holdings[0].sellable_quantity

    def fetch_quote(self, _symbol):
        return self.quote


class OrderCapacityPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "orders.sqlite"

        def connect():
            return open_sqlite(self.path)

        self.connect = connect
        with self.connect() as conn:
            apply_migrations(conn)

    def tearDown(self):
        self.temp.cleanup()

    def _order(self, key, *, side, qty, price=0, status="submitting"):
        repo = OrderLedgerRepository(self.connect)
        return repo.create(OrderIntent(
            client_order_key=key, correlation_id=key, account_key="A", symbol="005930",
            side=side, quantity=qty, price=price,
        ), initial_status=status)

    def test_sell_uses_sellable_not_total_holding(self):
        result = evaluate_order_capacity(
            api=_Broker(held=10, sellable=3), connect=self.connect,
            account_key="A", symbol="005930", side="sell", quantity=4,
        )
        self.assertFalse(result.allowed)
        self.assertEqual(result.approved_quantity, 3)
        self.assertEqual(result.code, "INSUFFICIENT_SELLABLE_QUANTITY")

    def test_unsubmitted_sell_is_reserved_but_broker_open_order_is_not_double_counted(self):
        pending = self._order("pending", side="sell", qty=2, status="approval_pending")
        self._order("accepted", side="sell", qty=4, status="open")
        result = evaluate_order_capacity(
            api=_Broker(held=10, sellable=6), connect=self.connect,
            account_key="A", symbol="005930", side="sell", quantity=5,
            exclude_order_id=None,
        )
        self.assertFalse(result.allowed)
        self.assertEqual(result.locally_reserved_quantity, 2)
        self.assertEqual(result.approved_quantity, 4)
        self.assertGreater(pending["id"], 0)

    def test_limit_buys_share_orderable_cash(self):
        broker = _Broker(cash=10_000)
        self._order("first", side="buy", qty=6, price=1000, status="approved")
        result = evaluate_order_capacity(
            api=broker, connect=self.connect,
            account_key="A", symbol="005930", side="buy", quantity=5, price=1000,
        )
        self.assertFalse(result.allowed)
        self.assertEqual(result.locally_reserved_cash, 6000)
        self.assertEqual(result.approved_quantity, 4)
        self.assertEqual(broker.fetch_balance_kwargs, [{"enrich_sellable": False}])

    def test_market_buy_uses_fresh_ask_with_configured_buffer(self):
        result = evaluate_order_capacity(
            api=_Broker(cash=2059, ask=1000), connect=self.connect,
            account_key="A", symbol="005930", side="buy", quantity=2, price=0,
        )
        self.assertFalse(result.allowed)
        self.assertEqual(result.reference_price, 1030)
        self.assertEqual(result.approved_quantity, 1)

    def test_excluded_order_does_not_reserve_against_itself(self):
        order = self._order("self", side="sell", qty=3, status="submitting")
        result = evaluate_order_capacity(
            api=_Broker(held=3, sellable=3), connect=self.connect,
            account_key="A", symbol="005930", side="sell", quantity=3,
            exclude_order_id=order["id"],
        )
        self.assertTrue(result.allowed)


class OrderIntentRealityTests(unittest.TestCase):
    def test_fractional_domestic_stock_quantity_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "whole number"):
            OrderIntent(
                client_order_key="k", correlation_id="c", symbol="005930",
                side="buy", quantity=1.5,
            )

    def test_invalid_price_and_time_in_force_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "price"):
            OrderIntent(
                client_order_key="k", correlation_id="c", symbol="005930",
                side="buy", quantity=1, price=float("nan"),
            )
        with self.assertRaisesRegex(ValueError, "time_in_force"):
            OrderIntent(
                client_order_key="k2", correlation_id="c2", symbol="005930",
                side="buy", quantity=1, time_in_force="BAD",
            )


if __name__ == "__main__":
    unittest.main()
