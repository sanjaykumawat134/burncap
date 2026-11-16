"""BurnCap client helper. Zero dependencies; Python 3.9+.

    from openai import OpenAI
    from burncap import BurnCap, is_budget_error, new_run_id

    bc = BurnCap(key=os.environ["BURNCAP_KEY"], base_url="https://burncap.dev")
    client = OpenAI(base_url=bc.openai_base_url, default_headers=bc.headers(agent="researcher"))

Works the same with Anthropic, LangChain (``ChatOpenAI(base_url=..., default_headers=...)``),
CrewAI and AutoGen, since they all accept a base URL and default headers.
"""

from __future__ import annotations

import json
import secrets
import string
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Mapping, Optional, Union

__all__ = ["BurnCap", "BurnCapError", "is_budget_error", "new_run_id"]
__version__ = "0.1.0"

BUDGET_ERROR_TYPES = frozenset({"budget_exceeded", "budget_throttled"})


class BurnCapError(Exception):
    """Raised when a BurnCap API call (track/status) fails."""

    def __init__(self, message: str, status: int, type: str) -> None:
        super().__init__(message)
        self.status = status
        self.type = type


class BurnCap:
    def __init__(self, key: str, base_url: str = "https://burncap.dev", timeout: float = 10.0) -> None:
        if not key or not key.startswith("bc_"):
            raise ValueError("BurnCap: key must start with bc_")
        self._key = key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    @property
    def openai_base_url(self) -> str:
        """Pass as ``base_url`` to the OpenAI SDK (and LangChain, CrewAI, AutoGen, LiteLLM…)."""
        return f"{self.base_url}/api/v1/openai/v1"

    @property
    def anthropic_base_url(self) -> str:
        """Pass as ``base_url`` to the Anthropic SDK."""
        return f"{self.base_url}/api/v1/anthropic"

    def headers(self, agent: Optional[str] = None, run: Optional[str] = None, customer: Optional[str] = None) -> Dict[str, str]:
        """Headers for the provider SDK's ``default_headers`` (or ``extra_headers`` per request)."""
        h = {"x-bc-key": self._key}
        if agent:
            h["x-bc-agent"] = agent
        if run:
            h["x-bc-run"] = run
        if customer:
            h["x-bc-customer"] = customer
        return h

    def track(self, events: Union[Mapping[str, Any], List[Mapping[str, Any]]]) -> Dict[str, Any]:
        """Report usage for calls that didn't go through the proxy.

        Each event needs ``provider`` ("openai" | "anthropic") and ``model``; add ``agent_id``, ``run_id``,
        ``customer_id``, token counts, and optionally ``cost_usd``. Returns
        ``{"recorded": n, "agents": {agent_id: "active" | "throttled" | "paused"}}``.
        """
        batch = [dict(events)] if isinstance(events, Mapping) else [dict(e) for e in events]
        return self._request("POST", "/api/v1/events", {"events": batch})

    def status(self, agent: str, customer: Optional[str] = None) -> Dict[str, Any]:
        """Whether an agent may run: ``status`` is "active", "throttled" or "paused", with ``reason`` and spend."""
        path = f"/api/v1/agents/{urllib.parse.quote(agent, safe='')}/status"
        if customer:
            path += "?" + urllib.parse.urlencode({"customer": customer})
        return self._request("GET", path)

    def _request(self, method: str, path: str, body: Optional[Any] = None) -> Dict[str, Any]:
        req = urllib.request.Request(
            self.base_url + path,
            method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"content-type": "application/json", "x-bc-key": self._key, "user-agent": f"burncap-python/{__version__}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read() or b"{}").get("error", {})
            except ValueError:
                err = {}
            raise BurnCapError(err.get("message", f"HTTP {e.code}"), e.code, err.get("type", "http_error")) from None


def _error_types(err: BaseException) -> List[str]:
    """Collects candidate error types from OpenAI/Anthropic SDK exceptions, whichever body shape they keep."""
    types: List[str] = []
    t = getattr(err, "type", None)
    if isinstance(t, str):
        types.append(t)
    body = getattr(err, "body", None)
    if isinstance(body, Mapping):
        if isinstance(body.get("type"), str):
            types.append(body["type"])
        inner = body.get("error")
        if isinstance(inner, Mapping) and isinstance(inner.get("type"), str):
            types.append(inner["type"])
    return types


def is_budget_error(err: BaseException) -> bool:
    """True when a provider SDK error came from a BurnCap budget limit, not from the provider itself.

    402 means the agent is paused (stop). 429 with ``budget_throttled`` means it's over a throttle budget;
    the SDKs retry 429s automatically, so you usually only see it once retries are exhausted.
    """
    status = getattr(err, "status_code", None) or getattr(err, "status", None)
    return status in (402, 429) and any(t in BUDGET_ERROR_TYPES for t in _error_types(err))


_ALPHABET = string.ascii_lowercase + string.digits


def new_run_id(prefix: str = "run") -> str:
    """A short random run id, e.g. ``run_k3j9x2ab``."""
    return f"{prefix}_{''.join(secrets.choice(_ALPHABET) for _ in range(8))}"
