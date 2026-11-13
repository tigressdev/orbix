"""Studio server (stdlib only). Locally it binds to 127.0.0.1 only (python trip.py serve); on Vercel api/index.py calls dispatch()."""
import hmac
import json
import mimetypes
import re
import os
import threading
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import auth, fx, insights, state_store, trends
from .cli import db_path
from .core import ROOT, connect, hosted, load_cities, load_config, now_utc, to_utc
from .explore import Explorer
from .itineraries import load_legs, manual_legs, merge_legs

WEB = ROOT / "public"
PROVIDERS_REAL = ("serpapi", "browser", "manual")
MAX_STATE_BYTES = 1_500_000
CENTRAL = "USD"      # the engine, the API and the stored budget all speak US dollars; the UI converts for display


def airline_meta():
    d = json.loads((ROOT / "config/airlines.json").read_text(encoding="utf-8"))
    return {"codes": d["airlines"], "connections": d["connection_airports"]}


def airport_names(cfg):
    names = dict(airline_meta()["connections"])
    names.update({k: v.get("name", k) for k, v in cfg["airports"].items()})
    return names


class App:
    def __init__(self, demo):
        self.demo = demo
        self._lock = threading.Lock()
        self._cache, self._thread = None, None

    @property
    def cfg(self):          # re-read only when a config file changed: edits apply without restarting
        stamp = tuple((ROOT / f).stat().st_mtime_ns for f in ("config/trip.json", "config/airports.json"))
        if getattr(self, "_cfg_stamp", None) != stamp:
            self._cfg, self._cfg_stamp = load_config(), stamp
        return self._cfg

    def conn(self):
        return connect(db_path(self.demo), readonly=hosted())

    def providers(self):
        return ("fixture",) if self.demo else PROVIDERS_REAL

    def legs(self, conn, keep):
        cfg = self.cfg
        legs = load_legs(conn, cfg, self.providers(), keep=keep, currency=CENTRAL)
        return merge_legs(legs, manual_legs(cfg))

    def cost_scale(self, conn):
        """Config cost estimates are written in costs_currency (BRL); the engine works in USD."""
        cc = self.cfg.get("costs_currency", self.cfg["search"]["currency"])
        if cc == CENTRAL:
            return 1.0
        day, rates = fx.latest(fx.table(conn))
        return 1.0 / rates[cc] if rates.get(cc) else 1.0

    def explorer(self, conn, params=None, keep=8):
        return Explorer(self.cfg, self.legs(conn, keep), params, self.cost_scale(conn))

    # -- endpoints ---------------------------------------------------------------------------
    def meta(self, user=None):
        conn = self.conn()
        cfg, ex = self.cfg, self.explorer(conn)
        scale = self.cost_scale(conn)
        cities = load_cities()
        by_city = {}
        for code, a in cfg["airports"].items():
            by_city.setdefault(a["city"], []).append(a)
        out_cities = {}
        for city, aps in by_city.items():
            m = cities.get(city, {"name": city.title(), "country": "", "tag": "", "interest": 3})
            out_cities[city] = {**m, "lat": sum(a["lat"] for a in aps) / len(aps), "lon": sum(a["lon"] for a in aps) / len(aps),
                                "airports": [k for k, a in cfg["airports"].items() if a["city"] == city]}
        fxd = cfg["fixed"]
        tbl = fx.table(conn)
        fx_day, fx_latest = fx.latest(tbl)
        brl_latest = fx_latest.get("BRL")
        users = auth.load_users()
        is_owner = (not users) or bool(users.get(user or "", {}).get("owner"))
        ticket = dict(fxd.get("purchased_ticket", {})) if is_owner else {}
        t_rate = fx.rate(tbl, "BRL", ticket.get("fx_day", fx_day or "")) if ticket else None
        if ticket and t_rate:
            ticket["total_usd"] = ticket["total_brl"] / t_rate
        stats = [dict(r) for r in conn.execute(
            "SELECT s.provider p, COUNT(DISTINCT s.id) searches, COUNT(o.id) offers, MIN(s.searched_at) first, "
            "MAX(s.searched_at) last FROM searches s LEFT JOIN offers o ON o.search_id=s.id WHERE s.ok=1 GROUP BY 1")]
        return {"trip": cfg["trip"], "demo": self.demo, "home": ex.home, "home_city": ex.home_city, "cities": out_cities,
                "bookings": [
                    {"id": "in", "kind": "confirmed", "flight": fxd["inbound_to_europe"]["flight"], "origin": "GRU", "destination": "MAD",
                     "dep_local": fxd["inbound_to_europe"]["depart_local"].replace("T", " "),
                     "arr_local": fxd["inbound_to_europe"]["arrive_local"].replace("T", " "), "airline": "Air China"},
                    {"id": "out", "kind": "confirmed", "flight": fxd["outbound_home"]["flight"], "origin": "MAD", "destination": "GRU",
                     "dep_local": fxd["outbound_home"]["depart_local"].replace("T", " "),
                     "arr_local": fxd["outbound_home"]["arrive_local"].replace("T", " "), "airline": "Air China"}],
                "purchased_ticket": ticket,
                "currency": CENTRAL, "fx": {"latest_day": fx_day, "latest": fx_latest, "days": tbl},
                "latest_arrival_local": (ex.latest_arr + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M"),
                "required": sorted(ex.required), "birthday": cfg.get("birthday", {}),
                "protected_dates": sorted(cfg["constraints"].get("no_travel_dates", [])),
                "default_budget": (cfg.get("studio", {}).get("default_budget_brl", 15000) / brl_latest) if brl_latest else 3000,
                "hotel_night": {k: v * scale for k, v in cfg["costs_brl"]["hotel_night"].items()}, "lodging": cfg.get("lodging_usd", {}), "wishlist": cfg.get("wishlist", []),
                "stay_rules_hours": cfg["constraints"]["stay_rules_hours"],
                "costs": {"bag": cfg["costs_brl"]["extra_checked_bag_per_separate_ticket"] * scale,
                          "transfer": cfg["costs_brl"].get("airport_transfer_per_arrival", 0) * scale},
                "airports": {k: v["city"] for k, v in cfg["airports"].items()}, "airport_names": airport_names(cfg),
                "hosted": hosted(), "state_backend": state_store.backend(), "auth_required": bool(users), "is_owner": is_owner,
                "airlines": airline_meta()["codes"], "data": stats}

    def options(self, body):
        ex = self.explorer(self.conn(), body.get("params"))
        try:
            path = ex.resolve(body.get("path", []))
        except KeyError as e:
            raise ValueError(f"unknown leg {e}; the data changed, reload the page")
        return ex.options(path, bool(body.get("show_all")))

    def evaluate(self, body):
        """Summary + metrics for many branches at once. Unknown legs report stale=True instead of failing."""
        ex = self.explorer(self.conn(), body.get("params"))
        out = []
        for keys in body.get("paths", [])[:400]:
            try:
                path = ex.resolve(keys)
            except KeyError:
                out.append({"stale": True})
                continue
            out.append({"stale": False, "summary": ex.summary(path), "metrics": ex.metrics(path)})
        return {"results": out}

    # -- flexible route intelligence ---------------------------------------------------------
    def flex_coverage(self, body):
        """Quote coverage for one leg over a flexible window: {from, to, preferred, flex, hard_min?, hard_max?}."""
        from . import flexible
        from .date_windows import DateWindow, span
        conn = self.conn()
        ex = self.explorer(conn, body.get("params"), keep=40)
        o, d = body["from"], body["to"]
        if not flexible.airports_of(self.cfg, o) or not flexible.airports_of(self.cfg, d):
            raise ValueError("unknown city")
        flex = max(0, min(int(body.get("flex", 2)), 7))
        win = DateWindow(body["preferred"], flex, flex, body.get("hard_min"), body.get("hard_max"))
        lo, hi = win.bounds()
        days = flexible.coverage(conn, ex, self.cfg, o, d, span(lo, hi), body["preferred"])      # protected dates stay visible, marked as such
        return {"from": o, "to": d, "from_name": ex.meta(o)["name"], "to_name": ex.meta(d)["name"], "preferred": body["preferred"], "flex": flex,
                "days": days, "research_only": flexible.research_only(self.cfg).get(d) or flexible.research_only(self.cfg).get(o)}

    def flex_corridors(self, body):
        """Compare corridors between the same ends: {corridors?: [{chain, label?}], preferred, flex}. Defaults to the configured return corridors."""
        from . import flexible
        conn = self.conn()
        ex = self.explorer(conn, body.get("params"), keep=40)
        cors = body.get("corridors") or flexible.default_return_corridors(self.cfg)
        known = {a["city"] for a in self.cfg["airports"].values()}
        cors = [c for c in cors[:8] if 2 <= len(c.get("chain", [])) <= 5 and all(x in known for x in c["chain"])]
        if not cors:
            raise ValueError("no valid corridor")
        flex = max(0, min(int(body.get("flex", 2)), 7))
        out = flexible.compare(conn, ex, self.cfg, cors, body["preferred"], flex, body.get("hard_min"), body.get("hard_max"))
        out["collection"] = "manual" if not hosted() else "read_only"
        out["jobs"] = sum(len(flexible.jobs(self.cfg, c)) for c in out["corridors"])
        return out

    # -- route discovery and quote requests --------------------------------------------------------------------------------------
    REQUESTS = ROOT / "data/queue/requests.jsonl"

    def _requests(self):
        p = self.REQUESTS
        if not p.exists():
            return []
        out = []
        for line in p.read_text(encoding="utf-8").splitlines():
            try:
                out.append(json.loads(line))
            except ValueError:
                continue
        return out

    def discover(self, body):
        """Next-destination candidates from a branch, quoted or not: {path: [leg keys], params, flex?, preferred?, city?}."""
        from . import discovery
        conn = self.conn()
        ex = self.explorer(conn, body.get("params"), keep=40)
        try:
            path = ex.resolve(body.get("path", []))
        except KeyError as e:
            raise ValueError(f"unknown leg {e}; the data changed, reload the page")
        flex = max(0, min(int(body.get("flex", 2)), 7))
        out = discovery.discover(conn, ex, self.cfg, path, flex, body.get("preferred"), self._requests(), body.get("city"))
        out["requests_writable"] = not hosted()
        return out

    def quote_requests(self, body=None):
        """GET: searches requested so far. POST {jobs: [{origin_city, dest_city, date}], context?}: record them for the collector.

        Only a request to search is stored (no price). The hosted deployment is read-only: the app then keeps the request in the browser
        and offers to copy it for the collector (docs/CODEX_FARE_COLLECTION.md)."""
        if body is None:
            return {"requests": self._requests(), "writable": not hosted()}
        if hosted():
            raise PermissionError("This deployment is read-only: the request is kept in your browser. Copy it for the collector.")
        cities = {a["city"] for a in self.cfg["airports"].values()}
        have = {(r.get("origin_city"), r.get("dest_city"), r.get("date")) for r in self._requests()}
        new = []
        for j in (body.get("jobs") or [])[:200]:
            o, d, day = j.get("origin_city"), j.get("dest_city"), str(j.get("date", ""))
            if o not in cities or d not in cities or o == d or not re.match(r"^2027-\d{2}-\d{2}$", day):
                raise ValueError(f"invalid request {j!r}")
            if (o, d, day) in have:
                continue
            have.add((o, d, day))
            new.append({"origin_city": o, "dest_city": d, "date": day, "requested_at": now_utc().isoformat(timespec="seconds"),
                        "context": (body.get("context") or {}).get("label", "")[:120]})
        if new:
            self.REQUESTS.parent.mkdir(parents=True, exist_ok=True)
            with self.REQUESTS.open("a", encoding="utf-8") as f:
                for r in new:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
        return {"saved": len(new), "file": "data/queue/requests.jsonl", "total": len(have)}

    def _stamp(self):
        """Identifies the quote set an analysis was computed from: number of searches and the latest one."""
        row = self.conn().execute("SELECT COUNT(*), MAX(searched_at) FROM searches WHERE ok=1").fetchone()
        return f"{row[0]}|{row[1]}"

    def _precomputed_fresh(self, pre):
        """The build-time analysis is still valid if it was computed from the same quotes and the trip/city config is not newer than it."""
        try:
            data = json.loads(pre.read_text(encoding="utf-8"))
            cfg_newer = max((ROOT / "config/trip.json").stat().st_mtime, (ROOT / "config/cities.json").stat().st_mtime) > pre.stat().st_mtime
            return data.get("status") == "ready" and data.get("stamp") == self._stamp() and not cfg_newer
        except Exception:  # noqa: BLE001
            return False

    def analysis(self):
        pre = ROOT / "data/precomputed/insights.json"
        if pre.exists() and (hosted() or self._precomputed_fresh(pre)):
            return json.loads(pre.read_text(encoding="utf-8"))   # computed by scripts/build_data.py (about a minute): never recomputed per request when it is up to date
        stamp = (db_path(self.demo).stat().st_mtime_ns, (ROOT / "config/trip.json").stat().st_mtime_ns,
                 (ROOT / "config/cities.json").stat().st_mtime_ns)
        with self._lock:
            if self._cache and self._cache[0] == stamp:
                return self._cache[1]
            if not self._thread or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._run_analysis, args=(stamp,), daemon=True)
                self._thread.start()
        return {"status": "computing"}

    def _run_analysis(self, stamp):
        try:
            conn = self.conn()
            cfg = self.cfg
            ex = self.explorer(conn)
            result = insights.compute(cfg, ex, self.legs(conn, cfg["search"]["keep_cheapest_per_route_date"]))
        except Exception as e:  # noqa: BLE001
            result = {"status": "error", "error": f"{type(e).__name__}: {e}"}
        with self._lock:
            self._cache = (stamp, result)

    def trends(self):
        conn = self.conn()
        return trends.compute(conn, self.cfg) if not self.demo else {"routes": [], "days": [], "snapshots": 0, "summary": {"routes": 0, "offers": 0, "snapshot_days": 0}}

    def get_state(self, user, target=None):
        """A workspace as JSON. Everyone signed in may read anyone's (read-only); `target` defaults to your own."""
        users = auth.load_users()
        target = target or user
        if users and target not in users:
            raise KeyError("unknown user")
        conn = self.conn() if state_store.backend() == "local" else None
        owner_id = next((k for k, v in users.items() if v.get("owner")), None)
        return {"state": state_store.get(conn, target, legacy=(target == owner_id or not users)), "backend": state_store.backend(),
                "user": target, "read_only": target != user}

    def put_state(self, user, body):
        """Writes ONLY the signed-in user's own workspace (the target is never taken from the request)."""
        raw = json.dumps(body.get("state"), ensure_ascii=False)
        if len(raw.encode()) > MAX_STATE_BYTES:
            raise ValueError("state too large")
        state_store.put(self.conn() if state_store.backend() == "local" else None, raw, user)
        return {"ok": True, "backend": state_store.backend()}

    def add_manual(self, b):
        if hosted():
            raise PermissionError("Adding fares is disabled in the hosted read-only deployment: add them to data/quotes/*.txt and redeploy.")
        cfg = self.cfg
        ap = cfg["airports"]
        o, d = str(b.get("origin", "")).upper(), str(b.get("destination", "")).upper()
        if o not in ap or d not in ap or o == d:
            raise ValueError("origin/destination must be known, different airport codes: " + ", ".join(sorted(ap)))
        dep, arr = str(b.get("dep_local", "")).replace("T", " "), str(b.get("arr_local", "")).replace("T", " ")
        du, au = to_utc(dep, o, ap), to_utc(arr, d, ap)       # raises ValueError on bad dates
        if au <= du:
            raise ValueError("arrival must be after departure (local times)")
        price = float(b["price"])
        if not 0 < price < 2_000_000:
            raise ValueError("price out of range")
        currency = str(b.get("currency") or CENTRAL).upper()
        if currency not in fx.CURRENCIES:
            raise ValueError("currency must be USD, BRL or RUB")
        conn = self.conn()
        fx.ensure(conn, now_utc().strftime("%Y-%m-%d"))
        sid = conn.execute("INSERT INTO searches(provider,origin,destination,date,searched_at,ok,n_offers) "
                           "VALUES ('manual',?,?,?,?,1,1)", (o, d, dep, now_utc().isoformat())).lastrowid
        conn.execute("INSERT INTO offers(search_id,origin,destination,dep_local,arr_local,dep_utc,arr_utc,price,currency,"
                     "duration_min,stops,airlines,flight_numbers,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                     (sid, o, d, dep, arr, du.isoformat(), au.isoformat(), price, currency,
                      int((au - du).total_seconds() // 60), int(b.get("stops") or 0), str(b.get("airlines", ""))[:80],
                      "", json.dumps({"source": "manual_ui"})))
        conn.commit()
        return {"ok": True}


def _json(code, obj, headers=None):
    return code, "application/json", json.dumps(obj, ensure_ascii=False).encode(), headers or []


def _cookie(value, secure, max_age):
    flags = f"Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}" + ("; Secure" if secure else "")
    return ("Set-Cookie", f"{auth.COOKIE}={value}; {flags}")


def dispatch(app, method, path, headers, body=b"", allowed_hosts=None, static=True):
    """One router for every entry point -> (status, content_type, bytes, extra_headers).
    allowed_hosts guards the local server against DNS rebinding."""
    h = {k.lower(): v for k, v in headers.items()}
    if allowed_hosts is not None and h.get("host") not in allowed_hosts:
        return _json(403, {"error": "bad host"})
    if method in ("POST", "PUT"):
        origin = h.get("origin")
        if origin and urlparse(origin).netloc != h.get("host"):
            return _json(403, {"error": "bad origin"})
    users = auth.load_users()
    if hosted() and not users and urlparse(path).path.startswith("/api/"):       # fail closed: never serve personal data without a login
        return _json(503, {"error": "Login is not configured on this deployment (set FI_USERS and FI_SESSION_SECRET, then redeploy)."})
    user = auth.user_from_cookie(h.get("cookie", "")) if users else "local"
    secure = h.get("x-forwarded-proto") == "https"
    url = urlparse(path)
    path, query = url.path, parse_qs(url.query)
    try:
        if users and method == "POST" and path == "/api/login":
            data = json.loads(body or b"{}")
            client = (h.get("x-forwarded-for") or "local").split(",")[0].strip()
            uid, why = auth.login(data.get("username"), data.get("password"), client)
            if not uid:
                return _json(401, {"error": why})
            return _json(200, {"user": auth.public_user(users, uid), "users": [auth.public_user(users, k) for k in users]},
                         [_cookie(auth.make_cookie_value(uid), secure, auth.TTL_SECONDS)])
        if method == "POST" and path == "/api/logout":
            return _json(200, {"ok": True}, [_cookie("", secure, 0)])
        if method == "GET" and path == "/api/session":
            if users and not user:
                return _json(401, {"error": "login required", "auth": True})
            return _json(200, {"auth": bool(users), "user": auth.public_user(users, user) if users else {"id": "local", "name": "You", "owner": True},
                               "users": [auth.public_user(users, k) for k in users]})
        if path.startswith("/api/") and users and not user:
            return _json(401, {"error": "login required", "auth": True})
        if method == "GET":
            if path == "/api/meta":
                return _json(200, app.meta(user))
            if path == "/api/analysis":
                return _json(200, app.analysis())
            if path == "/api/state":
                return _json(200, app.get_state(user, (query.get("user") or [None])[0]))
            if path == "/api/quote-requests":
                return _json(200, app.quote_requests())
            if path == "/api/trends":
                return _json(200, app.trends())
            if static and (path == "/" or path.startswith("/assets/")):
                rel = "index.html" if path == "/" else path.lstrip("/")
                p = (WEB / rel).resolve()
                if WEB.resolve() not in p.parents or not p.is_file():
                    return _json(404, {"error": "not found"})
                ctype = "text/javascript" if p.suffix == ".js" else mimetypes.guess_type(p.name)[0] or "application/octet-stream"
                return 200, ctype + "; charset=utf-8", p.read_bytes(), []
            return _json(404, {"error": "not found"})
        if method in ("POST", "PUT"):
            data = json.loads(body or b"{}")
            routes = {("POST", "/api/options"): app.options, ("POST", "/api/evaluate"): app.evaluate, ("POST", "/api/manual"): app.add_manual,
                      ("POST", "/api/flex/coverage"): app.flex_coverage, ("POST", "/api/flex/corridors"): app.flex_corridors,
                      ("POST", "/api/discover"): app.discover, ("POST", "/api/quote-requests"): app.quote_requests}
            if (method, path) == ("PUT", "/api/state"):
                return _json(200, app.put_state(user, data))
            fn = routes.get((method, path))
            return _json(200, fn(data)) if fn else _json(404, {"error": "not found"})
        return _json(405, {"error": "method not allowed"})
    except PermissionError as e:
        return _json(501, {"error": str(e)})
    except (ValueError, KeyError, TypeError) as e:
        return _json(400, {"error": str(e)})
    except Exception as e:  # noqa: BLE001
        return _json(500, {"error": f"{type(e).__name__}: {e}"})


def make_handler(app, port):
    allowed_hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _serve(self, method):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(min(n, MAX_STATE_BYTES + 1000)) if n else b""
            code, ctype, data, extra = dispatch(app, method, self.path, dict(self.headers), body, allowed_hosts)
            self.send_response(code)
            for k, v in extra:
                self.send_header(k, v)
            self.send_header("Content-Type", ctype if "charset" in ctype else ctype + "; charset=utf-8")
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

    return H


def serve(port=8765, demo=False):
    app = App(demo)
    srv = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app, port))
    print(f"Flight Intelligence studio on http://localhost:{port}  ({'SYNTHETIC demo data' if demo else 'real observed quotes'}). Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
