"""Vercel entrypoint: every /api/* request lands here (see the rewrite in vercel.json).

The function is read-only: quotes come from data/deploy/quotes.sqlite (built by scripts/build_data.py and committed),
the slow itinerary analysis is precomputed in data/precomputed/, and app state goes to Upstash Redis when its env vars
exist (otherwise it stays in the visitor's browser). Set FI_ACCESS_TOKEN to require a shared key on every /api call.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
os.environ.setdefault("FI_HOSTED", "1")

from flightintel.webapp import App, dispatch  # noqa: E402

_app = App(demo=False)


def _path(raw_path, query):
    """The rewrite sends /api/<x> here as /api/index?__route=<x>; fall back to the path itself for direct calls."""
    route = parse_qs(query or "").get("__route")
    return "/api/" + route[0].lstrip("/") if route else raw_path


def app(environ, start_response):                       # WSGI
    n = int(environ.get("CONTENT_LENGTH") or 0)
    body = environ["wsgi.input"].read(n) if n else b""
    headers = {k[5:].replace("_", "-").lower(): v for k, v in environ.items() if k.startswith("HTTP_")}
    path = _path(environ.get("PATH_INFO", "/"), environ.get("QUERY_STRING"))
    if "?" not in path and environ.get("QUERY_STRING") and "__route" not in environ["QUERY_STRING"]:
        path += "?" + environ["QUERY_STRING"]
    code, ctype, data, extra = dispatch(_app, environ["REQUEST_METHOD"], path, headers, body, allowed_hosts=None, static=False)
    start_response(f"{code} OK", [("Content-Type", ctype), ("Content-Length", str(len(data))), ("Cache-Control", "no-store"), *extra])
    return [data]


class handler(BaseHTTPRequestHandler):                  # classic Vercel Python handler (same logic)
    def _serve(self, method):
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else b""
        path = _path(u.path, u.query)
        if "?" not in path and u.query and "__route" not in u.query:
            path += "?" + u.query
        code, ctype, data, extra = dispatch(_app, method, path, dict(self.headers), body, allowed_hosts=None, static=False)
        self.send_response(code)
        for k, v in extra:
            self.send_header(k, v)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._serve("GET")

    def do_POST(self):
        self._serve("POST")

    def do_PUT(self):
        self._serve("PUT")
