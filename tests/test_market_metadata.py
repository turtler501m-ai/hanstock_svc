import unittest
from unittest.mock import patch

from src.market_metadata import (
    normalize_kr_symbol,
    normalize_kr_order_symbol,
    resolve_stock_name,
    resolve_stock_sector,
    search_kr_stocks,
)


class MarketMetadataTests(unittest.TestCase):
    def test_normalize_kr_symbol_pads_numeric_codes(self):
        self.assertEqual(normalize_kr_symbol("5930"), "005930")
        self.assertEqual(normalize_kr_symbol("q530107"), "Q530107")

    def test_normalize_kr_order_symbol_removes_market_prefix(self):
        self.assertEqual(normalize_kr_order_symbol("Q530107"), "530107")
        self.assertEqual(normalize_kr_order_symbol("005930"), "005930")

    def test_resolve_stock_name_replaces_placeholder_from_metadata(self):
        with patch(
            "src.market_metadata.load_kr_stock_metadata",
            return_value={"005930": {"name": "삼성전자", "sector": "반도체"}},
        ):
            self.assertEqual(resolve_stock_name("005930", "우량 종목"), "삼성전자")

    def test_resolve_stock_sector_uses_metadata_before_placeholder(self):
        with patch(
            "src.market_metadata.load_kr_stock_metadata",
            return_value={"005930": {"name": "삼성전자", "sector": "반도체"}},
        ):
            self.assertEqual(resolve_stock_sector("005930", "미분류"), "반도체")

    def test_resolve_stock_name_keeps_non_placeholder_fallback(self):
        with patch("src.market_metadata.load_kr_stock_metadata", return_value={}):
            self.assertEqual(resolve_stock_name("123456", "사용자입력명"), "사용자입력명")

    def test_search_kr_stocks_supports_partial_name_and_symbol(self):
        metadata = {
            "005930": {"name": "삼성전자", "market": "유가", "sector": "전기전자"},
            "000660": {"name": "SK하이닉스", "market": "유가", "sector": "전기전자"},
        }
        with patch("src.market_metadata.load_kr_stock_metadata", return_value=metadata):
            self.assertEqual(search_kr_stocks("삼성")[0]["symbol"], "005930")
            self.assertEqual(search_kr_stocks("000660")[0]["name"], "SK하이닉스")

    def test_search_kr_stocks_supports_ls_electric_alias(self):
        metadata = {
            "010120": {
                "name": "엘에스일렉트릭", "market": "유가", "sector": "전기전자",
            },
        }
        with patch("src.market_metadata.load_kr_stock_metadata", return_value=metadata):
            result = search_kr_stocks("LS ELECTRIC")
        self.assertEqual(result[0]["symbol"], "010120")
        self.assertEqual(result[0]["name"], "엘에스일렉트릭")

    def test_search_kr_stocks_prefers_exact_match_and_limits_results(self):
        metadata = {
            "000001": {"name": "테스트", "market": "유가", "sector": "기타"},
            "000002": {"name": "테스트전자", "market": "코스닥", "sector": "기타"},
        }
        with patch("src.market_metadata.load_kr_stock_metadata", return_value=metadata):
            results = search_kr_stocks("테스트", limit=1)
        self.assertEqual(results, [{
            "symbol": "000001", "name": "테스트", "market": "유가", "sector": "기타",
        }])

    def test_search_kr_stocks_omits_symbols_watchlist_cannot_register(self):
        metadata = {
            "0162Z0": {"name": "문자코드 ETF", "market": "ETP", "sector": "ETF/ETN"},
            "005930": {"name": "삼성전자", "market": "유가", "sector": "전기전자"},
        }
        with patch("src.market_metadata.load_kr_stock_metadata", return_value=metadata):
            self.assertEqual(search_kr_stocks("문자코드"), [])


if __name__ == "__main__":
    unittest.main()
