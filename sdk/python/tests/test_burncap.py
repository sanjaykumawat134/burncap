import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from burncap import BurnCap, BurnCapError, is_budget_error, new_run_id


class FakeSDKError(Exception):
    """Mimics openai.APIStatusError / anthropic.APIStatusError: status_code + parsed body."""

    def __init__(self, status_code, body):
        super().__init__("error")
        self.status_code = status_code
        self.body = body


class Handler(BaseHTTPRequestHandler):
    seen = []

    def _reply(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        Handler.seen.append((self.path, self.headers.get("x-bc-key"), body))
        self._reply(200, {"recorded": len(body["events"]), "agents": {"a": "paused"}})

    def do_GET(self):
        Handler.seen.append((self.path, self.headers.get("x-bc-key"), None))
        if "missing" in self.path:
            self._reply(401, {"type": "error", "error": {"type": "invalid_burncap_key", "message": "bad key"}})
        else:
            self._reply(200, {"agent_id": "a b", "status": "active", "reason": None})

    def log_message(self, *args):
        pass


class BurnCapTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.bc = BurnCap(key="bc_live_test", base_url=f"http://127.0.0.1:{cls.server.server_port}/")

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_base_urls_have_no_double_slash(self):
        port = self.server.server_port
        self.assertEqual(self.bc.openai_base_url, f"http://127.0.0.1:{port}/api/v1/openai/v1")
        self.assertEqual(self.bc.anthropic_base_url, f"http://127.0.0.1:{port}/api/v1/anthropic")

    def test_headers_only_include_given_fields(self):
        self.assertEqual(self.bc.headers(agent="a", run="r1"), {"x-bc-key": "bc_live_test", "x-bc-agent": "a", "x-bc-run": "r1"})

    def test_rejects_non_burncap_keys(self):
        with self.assertRaises(ValueError):
            BurnCap(key="sk-openai")

    def test_track_wraps_single_event_in_batch(self):
        out = self.bc.track({"provider": "openai", "model": "gpt-4.1", "agent_id": "a", "cost_usd": 1.5})
        self.assertEqual(out["agents"], {"a": "paused"})
        path, key, body = Handler.seen[-1]
        self.assertEqual((path, key), ("/api/v1/events", "bc_live_test"))
        self.assertEqual(body["events"][0]["cost_usd"], 1.5)

    def test_status_url_encodes_agent_and_customer(self):
        self.bc.status("a b", customer="cus/1")
        self.assertEqual(Handler.seen[-1][0], "/api/v1/agents/a%20b/status?customer=cus%2F1")

    def test_api_errors_raise_burncap_error(self):
        with self.assertRaises(BurnCapError) as ctx:
            self.bc.status("missing")
        self.assertEqual((ctx.exception.status, ctx.exception.type), (401, "invalid_burncap_key"))

    def test_is_budget_error_handles_both_body_shapes(self):
        # Whole response body (BurnCap's shape, as the Anthropic SDK keeps it)
        self.assertTrue(is_budget_error(FakeSDKError(402, {"type": "error", "error": {"type": "budget_exceeded"}})))
        # Inner error object only (as the OpenAI SDK may keep it)
        self.assertTrue(is_budget_error(FakeSDKError(429, {"type": "budget_throttled"})))
        # The provider's own rate limit is not a budget error
        self.assertFalse(is_budget_error(FakeSDKError(429, {"type": "error", "error": {"type": "rate_limit_error"}})))
        self.assertFalse(is_budget_error(ValueError("boom")))

    def test_new_run_id(self):
        self.assertRegex(new_run_id("pr"), r"^pr_[a-z0-9]{8}$")


if __name__ == "__main__":
    unittest.main()
