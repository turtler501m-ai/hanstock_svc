"""NHPLUG REST transport for the Namuh domestic-stock API."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
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

    _tokens: dict[tuple[str, str, str], tuple[str, datetime]] = {}
    _lock = threading.Lock()
    _token_issue_lock = threading.Lock()
    _last_call = 0.0
    _throttle_lock = threading.Lock()

    def __init__(self, app_key: str, app_secret: str, *, environment: str = "mock",
                 account: str = "", session: requests.Session | None = None,
                 timeout: float = 15.0, min_interval: float | None = None) -> None:
        if environment not in {"mock", "live"}:
            raise ValueError("environment must be 'mock' or 'live'")
        self.app_key = app_key.strip()
        self._app_secret = app_secret.strip()
        self.account = account.strip()
        self.environment = environment
        self.base_url = MOCK_BASE_URL if environment == "mock" else LIVE_BASE_URL
        self._session = session or requests.Session()
        self.timeout = timeout
        configured_interval = (
            min_interval
            if min_interval is not None
            else os.environ.get("NHPLUG_MIN_INTERVAL_SECONDS", "1.0")
        )
        self.min_interval = max(0.0, float(configured_interval))
        self._token_cache_path = Path(
            os.environ.get("NHPLUG_TOKEN_CACHE_FILE", ".runtime/nhplug-token-cache.json")
        )
        self._token = ""
        self._expires_at: datetime | None = None

    @classmethod
    def clear_token_cache(cls) -> None:
        with cls._lock:
            cls._tokens.clear()
        # This method is used by tests and operational recovery. Remove the
        # restart-persistent cache as well so an explicitly cleared token
        # cannot be restored by the next client instance.
        cache_path = Path(os.environ.get("NHPLUG_TOKEN_CACHE_FILE", ".runtime/nhplug-token-cache.json"))
        try:
            cache_path.unlink(missing_ok=True)
        except OSError:
            pass

    def _cache_key(self) -> tuple[str, str, str]:
        return self.environment, self.app_key, hashlib.sha256(self._app_secret.encode()).hexdigest()

    def _persistent_cache_key(self) -> str:
        return hashlib.sha256(repr(self._cache_key()).encode()).hexdigest()

    def _load_persistent_token(self) -> tuple[str, datetime] | None:
        try:
            payload = json.loads(self._token_cache_path.read_text(encoding="utf-8"))
            item = payload.get(self._persistent_cache_key())
            if not isinstance(item, Mapping):
                return None
            token = str(item.get("token") or "")
            expires_at = datetime.fromisoformat(str(item.get("expires_at") or ""))
            if token and expires_at.tzinfo is not None:
                return token, expires_at
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return None
        return None

    def _save_persistent_token(self, token: str, expires_at: datetime) -> None:
        path = self._token_cache_path
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                payload = {}
            if not isinstance(payload, dict):
                payload = {}
            payload[self._persistent_cache_key()] = {
                "token": token,
                "expires_at": expires_at.isoformat(),
            }
            temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
            temporary.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")
            os.replace(temporary, path)
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
        except OSError:
            # A read-only runtime directory must not prevent API operation.
            pass

    def access_token(self) -> str:
        now = datetime.now(timezone.utc)
        if self._token and self._expires_at and now < self._expires_at - timedelta(seconds=60):
            return self._token
        with self._lock:
            cached = self._tokens.get(self._cache_key())
        if cached and now < cached[1] - timedelta(seconds=60):
            self._token, self._expires_at = cached
            return self._token
        with self._token_issue_lock:
            # Another request may have issued the token while this request was
            # waiting. Always re-check both caches before calling OAuth again.
            now = datetime.now(timezone.utc)
            if self._token and self._expires_at and now < self._expires_at - timedelta(seconds=60):
                return self._token
            with self._lock:
                cached = self._tokens.get(self._cache_key())
            if cached and now < cached[1] - timedelta(seconds=60):
                self._token, self._expires_at = cached
                return self._token
            cached = self._load_persistent_token()
            if cached and now < cached[1] - timedelta(seconds=60):
                self._token, self._expires_at = cached
                with self._lock:
                    self._tokens[self._cache_key()] = cached
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
            self._expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires)
            self._token = token
            with self._lock:
                self._tokens[self._cache_key()] = (self._token, self._expires_at)
            self._save_persistent_token(self._token, self._expires_at)
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
        except NHPlugApiError as exc:
            if request_kind == "query" and (
                response.status_code == 401 or "IGW40043" in str(exc)
            ):
                # Refresh once; rejected credentials must not cause recursion.
                self._token = ""; self._expires_at = None
                with self._lock:
                    self._tokens.pop(self._cache_key(), None)
                try:
                    payload = json.loads(self._token_cache_path.read_text(encoding="utf-8"))
                    if isinstance(payload, dict):
                        payload.pop(self._persistent_cache_key(), None)
                        self._token_cache_path.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")
                except (OSError, ValueError, TypeError, json.JSONDecodeError):
                    pass
                headers["Authorization"] = f"Bearer {self.access_token()}"
                response = self._session.post(f"{self.base_url}/{path.lstrip('/')}",
                                              json=payload, headers=headers, timeout=self.timeout)
                return NHPlugPage(self._decode(response, path), {
                    "cts": response.headers.get("cts", ""),
                    "cts_flag": response.headers.get("cts_flag", ""),
                })
            raise
        return NHPlugPage(data, {
            "cts": response.headers.get("cts", ""),
            "cts_flag": response.headers.get("cts_flag", ""),
        })

    @staticmethod
    def _decode(response: Any, operation: str) -> Mapping[str, Any]:
        try:
            response.raise_for_status()
        except requests.RequestException as exc:
            code, message = NHPlugRestClient._response_error(response)
            detail = f" HTTP {response.status_code}"
            if code:
                detail += f" [{code}]"
            if message:
                detail += f" {message}"
            raise NHPlugApiError(f"NHPLUG {operation} request failed{detail}") from exc
        try:
            payload = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise NHPlugApiError(
                f"NHPLUG {operation} returned invalid JSON (HTTP {response.status_code})"
            ) from exc
        if not isinstance(payload, Mapping):
            raise NHPlugApiError(f"NHPLUG {operation} returned invalid JSON")
        code = str(payload.get("rsp_cd") or "")
        msg = str(payload.get("rsp_msg") or payload.get("message") or "")
        if code and code not in {"00000", "00166", "00221", "13578"} and "완료" not in msg:
            raise NHPlugApiError(f"NHPLUG {operation} failed [{code}] {msg}")
        return payload

    @staticmethod
    def _response_error(response: Any) -> tuple[str, str]:
        """Extract bounded broker diagnostics without logging the full payload."""
        try:
            payload = response.json()
        except (requests.RequestException, ValueError):
            return "", ""
        if not isinstance(payload, Mapping):
            return "", ""
        code = str(payload.get("rsp_cd") or payload.get("rt_cd") or "").strip()
        message = str(payload.get("rsp_msg") or payload.get("msg1") or
                      payload.get("message") or "").strip()
        return code[:40], message[:240]
