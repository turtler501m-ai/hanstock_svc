# -*- coding: utf-8 -*-
from fastapi import HTTPException, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.dashboard.core import app
from src.dashboard.lifecycle import create_dashboard_lifespan

# Import all route modules so decorators register on app
import src.dashboard.routes.pages as pages
import src.dashboard.routes.account as account
import src.dashboard.routes.settings as settings
import src.dashboard.routes.stock as stock
import src.dashboard.routes.stock_order as stock_order
import src.dashboard.routes.market_regime as market_regime

for route_module in [
    pages,
    account,
    settings,
    stock,
    market_regime,
]:
    app.include_router(route_module.router)


app.router.lifespan_context = create_dashboard_lifespan(
    settings_module=settings,
    stock_order_module=stock_order,
)


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException):
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def _request_validation_exception_handler(request: Request, exc: RequestValidationError):
    return await request_validation_exception_handler(request, exc)

# Dynamically expose all names from core and all route files for backward compatibility
import src.dashboard.core as _core

for mod in [_core, pages, account, settings, stock, market_regime]:
    globals().update({k: v for k, v in mod.__dict__.items() if not k.startswith("__")})
