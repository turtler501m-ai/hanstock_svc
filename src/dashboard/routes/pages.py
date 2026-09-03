# -*- coding: utf-8 -*-
from fastapi import APIRouter
from fastapi.responses import FileResponse

from src.dashboard.core import WEB_DIR


router = APIRouter(tags=["pages"])


@router.get("/", response_class=FileResponse)
def read_root():
    return FileResponse(WEB_DIR / "templates" / "index.html")


@router.get("/env-settings", response_class=FileResponse)
def read_env_settings():
    return FileResponse(WEB_DIR / "templates" / "env_settings.html")
