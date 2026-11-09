"""Login for a small, fixed set of people. Standard library only.

Passwords are never stored: each user has a PBKDF2-HMAC-SHA256 hash. Users come from the FI_USERS environment variable (JSON, use this on Vercel)
or, locally, from config/users.local.json (git-ignored). Create entries with: python scripts/make_user.py <login> "<Display name>"

  {"helen": {"name": "Helen", "hash": "pbkdf2_sha256$...", "owner": true}, "demetrio": {"name": "Demetrio", "hash": "pbkdf2_sha256$..."}}

A session is a signed, HttpOnly cookie (HMAC-SHA256 with FI_SESSION_SECRET). Everyone signed in may READ any user's plans; only the owner of a
workspace can write to it (enforced on the server, not just in the UI). When no users are configured the app is open (local development).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from .core import ROOT

ITERATIONS = 200_000
COOKIE = "fi_session"
TTL_SECONDS = 30 * 24 * 3600
_b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")                  # noqa: E731
_unb64 = lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))               # noqa: E731


def hash_password(password, salt=None, iterations=ITERATIONS):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${_b64(salt)}${_b64(dk)}"


def verify_password(password, stored):
    try:
        _, it, salt, dk = stored.split("$")
        again = hashlib.pbkdf2_hmac("sha256", password.encode(), _unb64(salt), int(it))
        return hmac.compare_digest(again, _unb64(dk))
    except (ValueError, TypeError):
        return False


_DUMMY = hash_password("not-a-real-password", salt=b"0" * 16)      # equalises timing for unknown logins


def load_users():
    raw = os.getenv("FI_USERS")
    if not raw:
        f = ROOT / "config/users.local.json"
        raw = f.read_text(encoding="utf-8") if f.exists() else ""
    return json.loads(raw) if raw.strip() else {}


def enabled():
    return bool(load_users())


def public_user(users, uid):
    return {"id": uid, "name": users[uid].get("name", uid), "owner": bool(users[uid].get("owner"))}


def _secret():
    s = os.getenv("FI_SESSION_SECRET")
    if s:
        return s.encode()
    f = ROOT / "data/.session_secret"                              # local development only (git-ignored)
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(secrets.token_hex(32), encoding="utf-8")
    return f.read_text(encoding="utf-8").strip().encode()


def _sign(payload):
    return _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())


def make_cookie_value(uid):
    payload = f"{uid}.{int(time.time()) + TTL_SECONDS}"
    return f"{payload}.{_sign(payload)}"


def user_from_cookie(cookie_header):
    """-> user id when the session cookie is valid, signed and unexpired, and the user still exists."""
    for part in (cookie_header or "").split(";"):
        k, _, v = part.strip().partition("=")
        if k != COOKIE:
            continue
        pieces = v.split(".")
        if len(pieces) != 3:
            return None
        uid, exp, sig = pieces
        if not exp.isdigit() or int(exp) < time.time() or not hmac.compare_digest(sig, _sign(f"{uid}.{exp}")):
            return None
        return uid if uid in load_users() else None
    return None


# ---- brute-force damping (best effort: memory is per server instance) -----------------------------------------------------------
_fails = {}
MAX_FAILS, WINDOW = 8, 15 * 60


def blocked(key):
    n, first = _fails.get(key, (0, 0))
    if n and time.time() - first > WINDOW:
        _fails.pop(key, None)
        return False
    return n >= MAX_FAILS


def record_failure(key):
    n, first = _fails.get(key, (0, time.time()))
    _fails[key] = (n + 1, first)


def clear_failures(key):
    _fails.pop(key, None)


def login(username, password, client):
    """-> (user id or None, reason)."""
    key = f"{client}"
    if blocked(key):
        return None, "Too many attempts. Try again in a few minutes."
    users = load_users()
    uid = (username or "").strip().lower()
    stored = users.get(uid, {}).get("hash", _DUMMY)
    ok = verify_password(password or "", stored) and uid in users
    if not ok:
        record_failure(key)
        return None, "Wrong login or password."
    clear_failures(key)
    return uid, ""
