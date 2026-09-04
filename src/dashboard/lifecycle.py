"""Dashboard startup and shutdown orchestration.

Kept separate from route registration so recovery work can be tested without
importing every dashboard endpoint.
"""

from contextlib import asynccontextmanager
import os
import socket
import subprocess

from src import trader
from src.utils.logger import logger


def runtime_revision() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            check=False,
            text=True,
            timeout=2,
        )
        return result.stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def log_server_lifecycle(event: str) -> None:
    flags = trader.runtime_flags()
    logger.info(
        "[SERVER_LIFECYCLE] service=hanstock_svc event={} pid={} host={} revision={} "
        "trading_env={} dry_run={} order_submission_enabled={} real_orders_enabled={} "
        "online_access_blocked={}",
        event,
        os.getpid(),
        socket.gethostname(),
        runtime_revision(),
        flags.trading_env,
        flags.dry_run,
        flags.order_submission_enabled,
        flags.real_orders_enabled,
        flags.online_access_blocked,
    )


def create_dashboard_lifespan(*, settings_module, stock_order_module):
    @asynccontextmanager
    async def dashboard_lifespan(_app):
        log_server_lifecycle("startup")
        from src.application.orders.recovery import run_startup_recovery
        from src.db.repository import connect_db, init_db

        init_db()
        from src.application.orders.legacy_bridge import backfill_active_legacy_orders

        backfill = backfill_active_legacy_orders(connect_db)
        logger.info(
            "[ORDER_BACKFILL] checked={} imported={} skipped={}",
            backfill["checked_count"], backfill["imported_count"], backfill["skipped_count"],
        )
        recovery = run_startup_recovery(connect_db)
        logger.info("[ORDER_RECOVERY] state={} reason={}", recovery["state"], recovery["reason"])
        resumed = stock_order_module.resume_cancel_pending_confirmations()
        logger.info("[ORDER_CANCEL_RECOVERY] resumed={}", resumed)
        settings_module.run_dashboard_startup_tasks()
        try:
            yield
        finally:
            log_server_lifecycle("shutdown")

    return dashboard_lifespan
