"""NHPLUG REST transport for the Namuh domestic-stock API."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import threading
import time
from typing import Any, Mapping

import requests

LIVE_BASE_URL = "https://api.nhplug.com:8443"
MOCK_BASE_URL = "https://moapi.nhplug.com:8443"
AUTH_BASE_URL = LIVE_BASE_URL


class NHPlugApiError(RuntimeError):
    """Raised for transport, authentication, or NHPLUG business errors."""


@dataclass(frozen=True, slots=True)
class NHPlugPage:
    data: Mapping[str, Any]
    continuation: Mapping[str, Any] | None = None


class NHPlugRestClient:
    """Small dependency-injectable client following the official NHPLUG wire format."""

    _tokens: dict[tuple[str, str], tuple[str, datetime]] = {}
    _lock = threading.Lock()
    _last_call = 0.0
    _throttle_lock = threading.Lock()

    def __init__(self, app_key: str, app_secret: str, *, environment: str = "mock",
                 account: str = "", session: requests.Session | None = None,
                 timeout: float = 15.0, min_interval: float = 0.25) -> None:
        if environment not in {"mock", "live"}:
            raise ValueError("environment must be 'mock' or 'live'")
        self.app_key = app_key.strip()
        self._app_secret = app_secret.strip()
        self.account = account.strip()
        self.environment = environment
        self.base_url = MOCK_BASE_URL if environment == "mock" else LIVE_BASE_URL
        self._session = session or requests.Session()
        self.timeout = timeout
        self.min_interval = max(0.0, float(min_interval))
        self._token = ""
        self._expires_at: datetime | None = None

    @classmethod
    def clear_token_cache(cls) -> None:
        with cls._lock:
            cls._tokens.clear()

    def _cache_key(self) -> tuple[str, str]:
        return self.app_key, hashlib.sha256(self._app_secret.encode()).hexdigest()

    def access_token(self) -> str:
        now = datetime.now(timezone.utc)
        if self._token and self._expires_at and now < self._expires_at - timedelta(seconds=60):
            return self._token
        with self._lock:
            cached = self._tokens.get(self._cache_key())
        if cached and now < cached[1] - timedelta(seconds=60):
            self._token, self._expires_at = cached
            return self._token
        response = self._session.post(
            f"{AUTH_BASE_URL}/oauth2/token",
            data={"appkey": self.app_key, "appsecretkey": self._app_secret,
                  "grant_type": "client_credentials", "scope": "oob"},
            headers={"content-type": "application/x-www-form-urlencoded"},
            timeout=self.timeout,
        )
        payload = self._decode(response, "token")
        token = str(payload.get("access_token") or payload.get("token") or "")
        if not token:
            raise NHPlugApiError("NHPLUG token response did not contain access_token")
        expires = float(payload.get("expires_in") or 86400)
        self._token, self._expires_at = token, now + timedelta(seconds=expires)
        with self._lock:
            self._tokens[self._cache_key()] = (self._token, self._expires_at)
        return token

    def post(self, path: str, body: Mapping[str, Any] | None = None,
             *, request_kind: str = "query") -> NHPlugPage:
        if request_kind not in {"query", "order"}:
            raise ValueError("request_kind must be 'query' or 'order'")
        with self._throttle_lock:
            delay = self.min_interval - (time.monotonic() - self._last_call)
            if delay > 0:
                time.sleep(delay)
            type(self)._last_call = time.monotonic()
        headers = {
            "Authorization": f"Bearer {self.access_token()}",
            "x-client-id": self.app_key,
            "x-client-secret": self._app_secret,
            "content-type": "application/json;charset=UTF-8",
        }
        payload = {"Input_0": dict(body or {})}
        response = self._session.post(f"{self.base_url}/{path.lstrip('/')}",
                                      json=payload, headers=headers, timeout=self.timeout)
        try:
            data = self._decode(response, path)
        except NHPlugApiError:
            if request_kind == "query" and response.status_code == 401:
                self._token = ""; self._expires_at = None
                return self.post(path, body, request_kind=request_kind)
            raise
        return NHPlugPage(data, {
            "cts": response.headers.get("cts", ""),
            "cts_flag": response.headers.get("cts_flag", ""),
        })

    @staticmethod
    def _decode(response: Any, operation: str) -> Mapping[str, Any]:
        try:
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise NHPlugApiError(f"NHPLUG {operation} request failed") from exc
        if not isinstance(payload, Mapping):
            raise NHPlugApiError(f"NHPLUG {operation} returned invalid JSON")
        code = str(payload.get("rsp_cd") or "")
        msg = str(payload.get("rsp_msg") or payload.get("message") or "")
        if code and code not in {"00000", "00166", "00221", "13578"} and "완료" not in msg:
            raise NHPlugApiError(f"NHPLUG {operation} failed [{code}] {msg}")
        return payload
