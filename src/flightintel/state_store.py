"""Where the studio keeps its state (scenarios, branches, notes, preferences).

  local     SQLite table app_state in the local database                     (python trip.py serve)
  upstash   Upstash Redis over its REST API (free tier; Vercel Marketplace)  env UPSTASH_REDIS_REST_URL / _TOKEN, or Vercel KV's KV_REST_API_URL / _TOKEN
  browser   hosted without a store: state lives only in the visitor's browser (localStorage), nothing is written on the server

The quotes themselves are NOT stored here: they live in git as text files and are baked into a read-only SQLite at deploy time.
"""
import json
import os
import urllib.request

from .core import hosted, now_utc

KEY = "flight-intelligence:studio:v1"
UPSTASH_MAX_BYTES = 900_000          # stay under Upstash's request-size limit


def _upstash():
    url = os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN")
    return (url.rstrip("/"), token) if url and token else None


def backend():
    if _upstash():
        return "upstash"
    return "browser" if hosted() else "local"


def _call(command):
    url, token = _upstash()
    req = urllib.request.Request(url, data=json.dumps(command).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        out = json.load(r)
    if "error" in out:
        raise RuntimeError(out["error"])
    return out.get("result")


def get(conn, user="local", legacy=False):
    """The workspace of `user`. legacy=True also accepts the single-user record saved before logins existed."""
    b = backend()
    if b == "upstash":
        raw = _call(["GET", f"{KEY}:{user}"])
        return json.loads(raw) if raw else None
    if b == "local":
        for k in (f"studio:{user}", "studio") if legacy else (f"studio:{user}",):
            r = conn.execute("SELECT value FROM app_state WHERE key=?", (k,)).fetchone()
            if r:
                return json.loads(r["value"])
    return None


def put(conn, raw, user="local"):
    """raw = JSON text. Raises PermissionError when the deployment has nowhere to write."""
    b = backend()
    if b == "upstash":
        if len(raw.encode()) > UPSTASH_MAX_BYTES:
            raise ValueError("state too large for the Redis store")
        _call(["SET", f"{KEY}:{user}", raw])
        return
    if b == "local":
        conn.execute("INSERT INTO app_state(key,value,updated_at) VALUES (?,?,?) "
                     "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", (f"studio:{user}", raw, now_utc().isoformat()))
        conn.commit()
        return
    raise PermissionError("This deployment has no state store: your scenarios stay in this browser. Add an Upstash Redis database to sync them.")
