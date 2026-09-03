from __future__ import annotations

from collections.abc import Callable, Iterable


def build_scan_universe(
    api,
    held_symbols: set[str],
    *,
    watchlist: Iterable[str],
    static_universe: Iterable[str],
    excluded_symbols: Callable[[], set[str]],
    scan_size: int,
    monitor_symbols: Callable[[str], Iterable[str]],
    logger,
) -> list[str]:
    """Build the buy-scan universe from monitor, volume, and static sources."""
    monitored_codes = list(dict.fromkeys(monitor_symbols("KR")))
    if monitored_codes:
        logger.info(f"[SCAN] 조건 모니터 {len(monitored_codes)}종목 수집 완료")
        base = monitored_codes
    else:
        volume_rank = api.fetch_volume_rank(top_n=scan_size)
        if volume_rank:
            logger.info(f"[SCAN] 나무 거래량 상위 {len(volume_rank)}종목 수집 완료")
            base = volume_rank
        else:
            static = list(static_universe)
            logger.info(f"[SCAN] 나무 거래량 API 실패 → KOSPI_UNIVERSE {len(static)}종목으로 폴백")
            base = static

    watch = list(watchlist)
    merged = list(dict.fromkeys(watch + list(base)))
    excluded = excluded_symbols()
    held = set(held_symbols)
    universe = [code for code in merged if code not in held and code not in excluded]
    logger.info(
        f"[SCAN] 최종 스캔 대상: {len(universe)}종목 "
        f"(WATCHLIST {len(watch)} + 동적 {len(base)}종목 병합)"
    )
    return universe
