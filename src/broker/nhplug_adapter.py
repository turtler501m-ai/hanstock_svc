"""Normalize official NHPLUG domestic-stock responses to broker models."""

from datetime import date, datetime, timedelta
from typing import Any, Mapping

from src.broker.models import (AccountBalance, CancelOrderRequest, DailyBar, Holding,
    OrderRequest, OrderResult, OrderSide, OrderSnapshot, OrderStatus, Quote,
    ReviseOrderRequest, TradeExecution)
from src.broker.response import broker_order_accepted


def _num(value: Any) -> float:
    try: return float(str(value or 0).replace(",", ""))
    except (TypeError, ValueError): return 0.0

def _int(value: Any) -> int: return int(_num(value))

def _whole(value: Any) -> str:
    """Serialize broker numeric values without a trailing ``.0``."""
    return str(int(round(_num(value))))

def _rows(payload: Mapping[str, Any], key: str) -> list[Mapping[str, Any]]:
    value = payload.get(key) or []
    return [x for x in value if isinstance(x, Mapping)] if isinstance(value, list) else []

def _out(page: Any, key: str = "Output_0") -> Any:
    return getattr(page, "data", page).get(key, [])


class NHPlugBrokerAdapter:
    broker_name = "namuh"

    def __init__(self, client: Any, *, account: str = "", order_submission_enabled: bool = False,
                 read_fallback: Any | None = None) -> None:
        self.client, self.account = client, (account or getattr(client, "account", "")).strip()
        self.order_submission_enabled = bool(order_submission_enabled)
        self.read_fallback = read_fallback
        if not self.account:
            raise ValueError("NHPLUG account is required")

    def fetch_balance(self) -> AccountBalance:
        body = {
            "act_no": self.account, "bnc_bse_cd": "5", "ltg_aot_dit_cd": "9",
            "aet_bse": "2", "qut_dit_cd": "UNT"}
        pages = []
        cts = cts_flag = ""
        seen_cts = set()
        for _ in range(20):
            try:
                page = self.client.post(
                    "/krstock/inquiry/v1/balance", body, cts=cts, cts_flag=cts_flag
                )
            except Exception:
                if pages:
                    break
                raise
            pages.append(page)
            continuation = getattr(page, "continuation", {}) or {}
            next_cts = str(continuation.get("cts") or "").strip()
            next_flag = str(continuation.get("cts_flag") or "").strip()
            if not next_cts or next_flag.upper() == "N" or next_cts in seen_cts:
                break
            seen_cts.add(next_cts)
            cts, cts_flag = next_cts, next_flag
        first = pages[0]
        summary = _out(first) if isinstance(_out(first), Mapping) else {}
        rows = []
        for page in pages:
            payload = getattr(page, "data", page)
            rows.extend(_rows(payload, "Output_1"))
        holdings = tuple(
            self._holding(row)
            for row in rows
            if _int(row.get("itg_bnc_qty") or row.get("ny_stl_qty") or row.get("rsdl_qty"))
        )
        stock_value = sum(x.market_value for x in holdings)
        total = _num(summary.get("tot_aet_amt") or summary.get("tot_eal_amt"))
        # dca is the gross deposit figure in the mock response.  nxt2_dd_dca
        # is the settlement-adjusted cash component and reconciles with
        # tot_aet_amt - tot_eal_amt for the account overview.
        cash = _num(summary.get("nxt2_dd_dca") or summary.get("dca") or summary.get("orr_pbl_amt"))
        orderable_cash = _num(summary.get("orr_pbl_amt1") or summary.get("orr_pbl_amt"))
        return AccountBalance(holdings, cash, orderable_cash, total or cash + stock_value,
                              stock_value, _num(summary.get("tot_eal_pls")), raw=dict(getattr(page, "data", page)))

    @staticmethod
    def _holding(row: Mapping[str, Any]) -> Holding:
        qty = _int(row.get("itg_bnc_qty") or row.get("ny_stl_qty") or row.get("rsdl_qty"))
        sellable_qty = _int(row.get("itg_bnc_qty") or row.get("ny_stl_qty") or row.get("rsdl_qty"))
        price = _num(row.get("now_pr"))
        value = _num(row.get("eal_amt")) or qty * price
        return Holding(str(row.get("iem_cd") or ""), str(row.get("iem_nm") or ""), qty, sellable_qty,
                       _num(row.get("phs_pr")), price, value, _num(row.get("eal_pls_amt")),
                       _num(row.get("pft_rt")), raw=row)

    def fetch_quote(self, symbol: str) -> Quote:
        try:
            page = self.client.post("/krstock/quote/v1/currentPrice", {"iem_cd": symbol, "market_cd": "KRX"})
        except Exception:
            if self.read_fallback is None:
                raise
            return self.read_fallback.fetch_quote(symbol)
        row = _out(page) if isinstance(_out(page), Mapping) else {}
        return Quote(symbol, _num(row.get("stck_prpr")), _num(row.get("askp1") or row.get("askp")),
                     _num(row.get("bidp1") or row.get("bidp")), _num(row.get("hts_avls")), raw=row)

    def fetch_daily_bars(self, symbol: str, count: int = 60) -> list[DailyBar]:
        try:
            page = self.client.post("/krstock/quote/v1/currentDaily", {
                "market_cd": "KRX", "iem_cd": symbol, "array_cnt": str(max(1, count))})
            rows = _rows(getattr(page, "data", page), "Output_0")[:max(0, count)]
            return [DailyBar(str(r.get("bsop_date") or ""), _num(r.get("stck_oprc")), _num(r.get("stck_hgpr")),
                             _num(r.get("stck_lwpr")), _num(r.get("stck_clpr")), _num(r.get("acml_vol")), r)
                    for r in rows]
        except Exception as exc:
            if self.read_fallback is not None:
                return self.read_fallback.fetch_daily_bars(symbol, count)
            # NHPLUG mock accounts do not expose currentDaily. Historical
            # analysis is read-only, so use Yahoo's public KRX series in demo
            # mode while keeping all orders on the NHPLUG mock account.
            if self.client.environment != "mock" or "IGW40023" not in str(exc):
                raise
            import yfinance as yf

            frame = yf.download(f"{symbol}.KS", period="1y", interval="1d",
                                progress=False, auto_adjust=False)
            if frame is None or frame.empty:
                frame = yf.download(f"{symbol}.KQ", period="1y", interval="1d",
                                    progress=False, auto_adjust=False)
            if frame is None or frame.empty:
                return []
            if getattr(frame.columns, "nlevels", 1) > 1:
                frame.columns = frame.columns.get_level_values(0)
            result = []
            for index, row in frame.tail(max(0, count)).iterrows():
                result.append(DailyBar(
                    str(index.date()), _num(row.get("Open")), _num(row.get("High")),
                    _num(row.get("Low")), _num(row.get("Close")), _num(row.get("Volume")),
                    {"source": "yfinance", "symbol": symbol},
                ))
            return result

    def fetch_volume_rank(self, top_n: int = 50) -> list[str]:
        return []  # NHPLUG has no direct equivalent to the former ranking endpoint.

    def _order(self, path: str, request: OrderRequest | ReviseOrderRequest | CancelOrderRequest) -> OrderResult:
        if not self.order_submission_enabled:
            return OrderResult(True, "DRY_RUN", status=OrderStatus.SUBMITTED, dry_run=True)
        if isinstance(request, OrderRequest):
            body = {"act_no": self.account, "iem_cd": request.symbol, "orr_qty": request.quantity,
                    "nmn_pr_tp_cd": "05" if not request.price else "01", "orr_cnd_dit_cd": "00",
                    "ssl_nmn_pr_dit_cd": "00", "rmt_mkt_cd": request.exchange, "sor_mkt_sli_yn": "N"}
            if request.price: body["orr_pr"] = request.price
        elif isinstance(request, ReviseOrderRequest):
            body = {"act_no": self.account, "org_mkt_orr_no": request.order_id, "all_pat_dit_cd": "0",
                    "iem_cd": request.symbol, "cor_qty": request.quantity, "cor_pr": request.price,
                    "sop_cnd_pr": "", "rmt_mkt_cd": request.exchange, "sor_mkt_sli_yn": "N"}
        else:
            # NHPLUG's cancel endpoint declares org_mkt_orr_no as a numeric
            # field.  Sending the persisted string (including zero padding)
            # is rejected with IGW40011, while the numeric wire value is
            # accepted by both mock and live-compatible gateways.
            cancel_order_id = (
                int(request.order_id) if str(request.order_id).isdigit() else request.order_id
            )
            body = {"act_no": self.account, "org_mkt_orr_no": cancel_order_id, "all_pat_dit_cd": "0",
                    "iem_cd": request.symbol, "cor_qty": request.quantity}
        page = self.client.post(path, body, request_kind="order")
        data = getattr(page, "data", page); output = data.get("Output_0") or {}
        order_id = str(output.get("mkt_orr_no") or output.get("itg_orr_no") or "")
        success = broker_order_accepted(data)
        return OrderResult(success, str(data.get("rsp_msg") or data.get("message") or ""), order_id,
                           OrderStatus.SUBMITTED if success else OrderStatus.REJECTED, raw=data)

    def submit_order(self, request: OrderRequest) -> OrderResult:
        return self._order("/krstock/order/v1/cashBuy" if request.side == OrderSide.BUY else "/krstock/order/v1/cashSell", request)
    def submit_revision(self, request: ReviseOrderRequest) -> OrderResult:
        return self._order("/krstock/order/v1/modify", request)
    def submit_cancellation(self, request: CancelOrderRequest) -> OrderResult:
        return self._order("/krstock/order/v1/cancel", request)

    def fetch_trade_history(self, start_date: str, end_date: str) -> list[TradeExecution]:
        start = datetime.strptime(start_date.replace("-", ""), "%Y%m%d").date()
        end = datetime.strptime(end_date.replace("-", ""), "%Y%m%d").date()
        rows = []
        while start <= end:
            if start.weekday() < 5:
                page = self.client.post("/krstock/inquiry/v1/dailyOrderExecution", {
                    "orr_dt": start.strftime("%Y%m%d"), "act_no": self.account,
                    "orr_mkt_cd": "", "ost_cns_dit": "1"})
                payload = getattr(page, "data", page)
                # NHPLUG mock returns daily orders in Output_0, while some
                # live-compatible gateways use Output_1.
                rows.extend(_rows(payload, "Output_1") or _rows(payload, "Output_0"))
            start += timedelta(days=1)
        return [self._execution(r) for r in rows]

    @staticmethod
    def _execution(row: Mapping[str, Any]) -> TradeExecution:
        requested, filled = _int(row.get("orr_qty")), _int(row.get("tot_cns_qty"))
        text = str(row.get("sby_dit_cd_nm") or "")
        side = OrderSide.SELL if "매도" in text else OrderSide.BUY
        status = OrderStatus.FILLED if requested and filled >= requested else OrderStatus.PARTIAL if filled else OrderStatus.OPEN
        if "취소" in str(row.get("cor_can_dit_cd_nm") or ""): status = OrderStatus.CANCELED
        return TradeExecution(str(row.get("mkt_orr_no") or row.get("odno") or row.get("ord_no") or row.get("itg_orr_no") or ""), str(row.get("iem_cd") or ""), side,
            requested, filled, max(0, requested-filled), _num(row.get("cns_avg_uit_pr")), status,
            str(row.get("orr_dt") or row.get("orr_tm") or ""), row)

    def fetch_order_snapshot(self, order_id: str, order_date: str = "") -> OrderSnapshot:
        rows = self.fetch_trade_history(order_date, order_date)
        row = next((x for x in rows if x.order_id == str(order_id)), None)
        if not row: return OrderSnapshot(str(order_id), outcome_unknown=True, message="Order not found")
        return OrderSnapshot(row.order_id, row.status, row.requested_quantity, row.filled_quantity,
                             row.remaining_quantity, row.average_fill_price, raw=row.raw)

    # Existing application services consume these dictionary-shaped facades.
    # They deliberately translate only at this boundary; business code stays
    # independent of the NHPLUG field names.
    def get_balance(self) -> dict[str, Any]:
        value = self.fetch_balance()
        return {
            "rsp_cd": "00000",
            "rsp_msg": "완료",
            "output1": [{
                "pdno": h.symbol, "prdt_name": h.name, "hldg_qty": _whole(h.quantity),
                "ord_psbl_qty": _whole(h.sellable_quantity), "pchs_avg_pric": _whole(h.average_price),
                "prpr": _whole(h.current_price), "evlu_amt": _whole(h.market_value),
                "evlu_pfls_amt": _whole(h.profit_loss), "evlu_pfls_rt": str(h.profit_loss_rate),
                "fltt_rt": str(h.daily_change_rate),
            } for h in value.holdings],
            "output2": [{
                "dnca_tot_amt": _whole(value.cash), "ord_psbl_cash": _whole(value.orderable_cash),
                "tot_evlu_amt": _whole(value.total_equity), "scts_evlu_amt": _whole(value.stock_value),
                "evlu_pfls_smtl_amt": _whole(value.profit_loss),
            }],
            "_broker": "namuh",
            # Preserve the complete broker payload for operator diagnostics.
            # Domain code continues to consume the normalized output1/output2
            # fields above; the dashboard may render this read-only copy
            # without having to know NHPlug's evolving response schema.
            "_broker_response": dict(value.raw),
        }

    def get_quote(self, symbol: str) -> dict[str, float]:
        value = self.fetch_quote(symbol)
        return {"current": value.current_price, "ask1": value.ask_price,
                "bid1": value.bid_price, "market_cap": value.market_cap}

    def get_daily(self, symbol: str, n: int = 60) -> list[dict[str, Any]]:
        return [{"stck_bsop_date": x.date, "stck_oprc": str(x.open_price),
                 "stck_hgpr": str(x.high_price), "stck_lwpr": str(x.low_price),
                 "stck_clpr": str(x.close_price), "acml_vol": str(x.volume)}
                for x in self.fetch_daily_bars(symbol, n)]

    def get_index_daily(self, index_code: str, n: int = 90) -> list[dict[str, Any]]:
        # NHPLUG's domestic stock catalogue does not expose the former
        # broker-specific index endpoint. Keep regime calculations deterministic
        # with the existing public market-data fallback.
        import yfinance as yf
        ticker = {"0001": "^KS11", "1001": "^KQ11"}.get(index_code, index_code)
        frame = yf.download(ticker, period="2y", interval="1d", progress=False, auto_adjust=False)
        if frame is None or frame.empty:
            return []
        if getattr(frame.columns, "nlevels", 1) > 1:
            frame.columns = frame.columns.get_level_values(0)
        return [{"date": str(idx.date()), "open": float(row["Open"]), "high": float(row["High"]),
                 "low": float(row["Low"]), "close": float(row["Close"]), "volume": float(row["Volume"])}
                for idx, row in frame.tail(max(0, n)).iterrows()]

    def get_volume_rank(self, top_n: int = 50) -> list[str]:
        return self.fetch_volume_rank(top_n)


    def place_order(self, symbol: str, order_type: str, price: int, qty: int) -> dict[str, Any]:
        result = self.submit_order(OrderRequest(symbol, OrderSide(order_type), qty, price))
        return self._legacy_result(result)

    def cancel_order(self, order_no: str, *, qty: int = 0, exchange_id: str = "KRX", symbol: str = "", **_: Any) -> dict[str, Any]:
        return self._legacy_result(self.submit_cancellation(CancelOrderRequest(order_no, symbol, qty, exchange_id)))

    def revise_order(self, order_no: str, *, symbol: str = "", qty: int = 0, price: int = 0, exchange_id: str = "KRX", **_: Any) -> dict[str, Any]:
        return self._legacy_result(self.submit_revision(ReviseOrderRequest(order_no, symbol, qty, price, exchange_id)))

    def get_trade_history(self, start_date: str, end_date: str) -> list[dict[str, Any]]:
        return [dict(x.raw) for x in self.fetch_trade_history(start_date, end_date)]

    def get_order_snapshot(self, order_no: str, order_date: str = "", **_: Any) -> dict[str, Any]:
        value = self.fetch_order_snapshot(order_no, order_date)
        return {"status": value.status.value, "broker_order_id": value.broker_order_id,
                "cumulative_filled_qty": value.filled_quantity, "average_fill_price": value.average_fill_price,
                "requested_qty": value.requested_quantity, "remaining_qty": value.remaining_quantity,
                "message": value.message, "outcome_unknown": value.outcome_unknown, "payload": dict(value.raw)}

    @staticmethod
    def _legacy_result(value: OrderResult) -> dict[str, Any]:
        return {"rt_cd": "0" if value.success else "1",
                "rsp_cd": "00000" if value.success else "10000", "rsp_msg": value.message,
                "msg1": value.message, "output": {"ODNO": value.broker_order_id},
                "_broker": "namuh", "_dry_run": value.dry_run, "raw": dict(value.raw)}
