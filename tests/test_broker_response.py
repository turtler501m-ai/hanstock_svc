import unittest

from src.broker.response import broker_order_accepted


class BrokerResponseTests(unittest.TestCase):
    def test_namuh_completed_demo_order_with_00048_is_accepted(self):
        self.assertTrue(broker_order_accepted({
            "rt_cd": "1", "rsp_cd": "00048",
            "rsp_msg": "모의투자 매수주문이완료되었습니다.",
            "output": {"ODNO": "8"},
        }))

    def test_order_without_completion_or_order_id_is_not_accepted(self):
        self.assertFalse(broker_order_accepted({
            "rt_cd": "1", "rsp_cd": "00048", "rsp_msg": "주문 처리 실패"
        }))

    def test_standard_success_code_is_accepted(self):
        self.assertTrue(broker_order_accepted({"rsp_cd": "00000"}))


if __name__ == "__main__":
    unittest.main()
