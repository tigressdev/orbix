import argparse
import json
import os
import sys
import time
from pathlib import Path

from . import alerts, fx, importer, planner, report, trends
from .core import ROOT, connect, hosted, load_config, now_utc, to_utc
from .itineraries import build_trips, load_legs, manual_legs, merge_legs
from .providers import get_provider


def db_path(demo):
    if hosted():
        return ROOT / "data/deploy/quotes.sqlite"      # built by scripts/build_data.py and bundled read-only
    default = ROOT / ("data/demo.sqlite" if demo else "data/quotes.sqlite")
    return Path(os.getenv("FI_DB", default)) if not demo else default


def cmd_plan(a, cfg):
    jobs = planner.expand(cfg)
    print(json.dumps(planner.quota_summary(cfg, jobs), indent=2))
    by_stage = {}
    for j in jobs:
        by_stage[j.stage] = by_stage.get(j.stage, 0) + 1
    print("Jobs per stage:", by_stage)


def cmd_run(a, cfg):
    provider = get_provider(a.provider, cfg)
    conn = connect(db_path(a.provider == "fixture"))
    s = cfg["search"]
    jobs = planner.pick(conn, planner.expand(cfg), provider.name, a.budget or s["max_searches_per_run"],
                        0 if a.provider == "fixture" else s["min_refresh_hours"])
    ok = failed = saved = 0
    for j in jobs:
        sid = None
        try:
            offers = provider.search(j.origin, j.destination, j.date)
            cur = conn.execute("INSERT INTO searches(provider,origin,destination,date,searched_at,ok,n_offers) "
                               "VALUES (?,?,?,?,?,1,?)",
                               (provider.name, j.origin, j.destination, j.date, now_utc().isoformat(), len(offers)))
            sid = cur.lastrowid
            offers = [o for o in offers if o.origin in cfg["airports"] and o.destination in cfg["airports"]]
            for o in offers:
                conn.execute("INSERT INTO offers(search_id,origin,destination,dep_local,arr_local,dep_utc,arr_utc,"
                             "price,currency,duration_min,stops,airlines,flight_numbers,raw_json) "
                             "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                             (sid, o.origin, o.destination, o.dep_local, o.arr_local,
                              to_utc(o.dep_local, o.origin, cfg["airports"]).isoformat(),
                              to_utc(o.arr_local, o.destination, cfg["airports"]).isoformat(),
                              o.price, o.currency, o.duration_min, o.stops, o.airlines, o.flight_numbers,
                              json.dumps(o.raw, ensure_ascii=False)))
            conn.commit()
            ok += 1
            saved += len(offers)
            print(f"{j.origin}-{j.destination} {j.date}: {len(offers)} offers")
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            failed += 1
            conn.execute("INSERT INTO searches(provider,origin,destination,date,searched_at,ok,error) "
                         "VALUES (?,?,?,?,?,0,?)", (provider.name, j.origin, j.destination, j.date,
                                                    now_utc().isoformat(), str(e)[:200]))
            conn.commit()
            print(f"ERROR {j.origin}-{j.destination} {j.date}: {e}")
        if a.provider != "fixture":
            time.sleep(1)
    print(f"Done: {ok} ok, {failed} failed, {saved} offers saved.")
    if jobs and ok == 0:       # make CI go red instead of silently collecting nothing
        sys.exit(1)


def _trips(a, cfg):
    demo = a.demo
    conn = connect(db_path(demo))
    legs = merge_legs(load_legs(conn, cfg, ("fixture",) if demo else ("serpapi", "browser", "manual")), manual_legs(cfg))
    return conn, build_trips(legs, cfg, a.per_signature)


def cmd_build(a, cfg):
    _, trips = _trips(a, cfg)
    print(report.text_summary(trips, a.top))


def cmd_report(a, cfg):
    conn, trips = _trips(a, cfg)
    out = ROOT / "site/index.html"
    report.write_html(trips, out, now_utc().strftime("%Y-%m-%d %H:%M UTC"), synthetic=a.demo)
    print(f"Wrote {out} ({len(trips)} itineraries)")


def cmd_alert(a, cfg):
    conn, trips = _trips(a, cfg)
    msgs = alerts.check(conn, trips, cfg, notify=not a.dry_run)
    print(f"{len(msgs)} alert(s).")
    if a.dry_run:
        print("\n".join(msgs))


def cmd_import(a, cfg):
    observed = a.observed_at
    if not observed:
        import re as _re
        m = _re.search(r"(\d{4}-\d{2}-\d{2})", Path(a.file).name)
        observed = f"{m.group(1)}T12:00:00+00:00" if m else now_utc().isoformat()
    conn = connect(db_path(False))
    n, skipped, searches = importer.import_file(conn, cfg, a.file, observed, a.currency)
    miss = fx.ensure(conn, observed[:10])
    if miss:
        print(f"warning: no exchange rate for {observed[:10]} ({', '.join(miss)}); run `python trip.py fx --set BRL=... RUB=...`")
    print(f"Imported {n} offers in {searches} searches (provider=browser, observed {observed}); skipped {skipped} unknown-airport rows.")


def cmd_fx(a, cfg):
    conn = connect(db_path(False))
    days = set(fx.observation_days(conn)) | {a.date} | {cfg["fixed"].get("purchased_ticket", {}).get("fx_day", a.date)}
    for item in a.set or []:
        cur, _, v = item.partition("=")
        fx.set_manual(conn, a.date, cur.upper(), float(v))
    for d in sorted(days):
        miss = fx.ensure(conn, d)
        if miss:
            print(f"{d}: could not fetch {', '.join(miss)}")
    if a.export:
        import json as _json
        rows = [dict(r) for r in conn.execute("SELECT day, currency, per_usd, rate_date, source FROM fx_rates ORDER BY day, currency")]
        (ROOT / "data/fx.json").write_text(_json.dumps(rows, indent=1), encoding="utf-8")
        print(f"wrote data/fx.json ({len(rows)} rates)")
    for r in conn.execute("SELECT day, currency, per_usd, rate_date, source FROM fx_rates ORDER BY day, currency"):
        print(f"{r['day']}  1 USD = {r['per_usd']:.4f} {r['currency']}   (rate of {r['rate_date']}, {r['source']})")


def cmd_trends(a, cfg):
    t = trends.compute(connect(db_path(False)), cfg)
    sm = t["summary"]
    print(f"{sm['routes']} routes · {sm['offers']} offers · {sm['snapshot_days']} snapshot day(s): {sm.get('first_day')} .. {sm.get('last_day')}")
    print(f"falling {sm['falling']} · rising {sm['rising']} · stable {sm['stable']} · baseline only {sm['baseline']} · stale (> {sm['max_age_days']} days) {sm['stale']}")
    for r in t["routes"]:
        tr = r["trend"]
        arrow = {"down": "v", "up": "^", "flat": "=", "baseline": "."}[tr["status"]]
        pct = f"{tr['pct']:+.1f}%" if tr["pct"] is not None else "baseline"
        print(f"{r['code']:<10} {arrow} {pct:>9}  from US${r['cheapest_usd']:,.0f} (dep {r['cheapest_dep']}, quoted {r['latest_day']})  {r['from']} -> {r['to']}")


def cmd_urls(a, cfg):
    """One Google Flights URL per planned search (USD, Brazilian market), highest priority first."""
    import urllib.parse
    from .core import load_cities
    names = {k: v["name"] for k, v in load_cities().items()}
    ap = cfg["airports"]
    jobs = sorted(planner.expand(cfg), key=lambda j: (-j.priority, j.date, j.origin, j.destination))
    seen = set()
    for j in jobs[: a.limit]:
        o = names[ap[j.origin.split(",")[0]]["city"]]
        d = names[ap[j.destination.split(",")[0]]["city"]]
        if (o, d, j.date) in seen:
            continue
        seen.add((o, d, j.date))
        q = urllib.parse.quote(f"Flights from {o} to {d} on {j.date} one way")
        print(f"{o}|{d}|{j.date}|p{j.priority}|https://www.google.com/travel/flights?q={q}&curr=USD&hl=en&gl=br")


def cmd_flex(a, cfg):
    """Coverage of a corridor over a flexible window, and the Google Flights URLs for the dates that still need a quote."""
    from . import flexible
    from .explore import Explorer
    conn = connect(db_path(a.demo))
    legs = merge_legs(load_legs(conn, cfg, ("fixture",) if a.demo else ("serpapi", "browser", "manual"), keep=40, currency="USD"), manual_legs(cfg))
    ex = Explorer(cfg, legs)
    chains = [{"chain": [x.upper() for x in a.chain]}] if a.chain else flexible.default_return_corridors(cfg)
    res = flexible.compare(conn, ex, cfg, chains, a.date, a.flex)
    for c in res["corridors"]:
        best = c["best"]
        label = " -> ".join(c["chain"])                       # plain ASCII: Windows consoles cannot print arrows
        print(f"\n{label}  [{c['status']}]  " +(f"best observed ${best['total']:,.0f} ({best['depart_local'][:10]} -> {best['arrive_local'][:10]})" if best else "no complete observed combination"))
        for leg in c["legs"]:
            print(f"  {leg['from_name']} -> {leg['to_name']}  {leg['earliest']}..{leg['latest']}")
            for d in leg["days"]:
                tail = f"${d['min_price']:,.0f} ({d['offers']} offers)" if d["status"] == "observed" else d["url"] if d["status"] in ("missing", "stale") else ""
                print(f"    {d['date']}  {d['status']:<9} {tail}")


def _explorer(a, cfg):
    from .explore import Explorer
    conn = connect(db_path(a.demo))
    legs = merge_legs(load_legs(conn, cfg, ("fixture",) if a.demo else ("serpapi", "browser", "manual"), keep=8),
                      manual_legs(cfg))
    return Explorer(cfg, legs)


def cmd_outbound(a, cfg):
    rows = _explorer(a, cfg).outbound_table()
    print(f"{'Parada':<12}{'Noites':>7}{'Voos':>9}{'Hotel':>8}{'Total':>9}  Chega em Pequim   Trechos")
    for r in rows[: a.top]:
        legs = " + ".join(f"{l['origin']}>{l['destination']} {l['dep_local'][5:]} R${l['price']:,.0f}" for l in r["legs"])
        print(f"{r['stopover']:<12}{r['stop_nights']:>7}{r['flights']:>9,.0f}{r['hotel']:>8,.0f}{r['adjusted']:>9,.0f}  "
              f"{r['arrive_local'][5:]:<16}  {legs}")


def cmd_serve(a, cfg):
    from .webapp import serve
    serve(a.port, a.demo)


def cmd_demo(a, cfg):
    """Seed SYNTHETIC offers into data/demo.sqlite and print the ranking. Not real fares."""
    a.provider, a.budget, a.demo = "fixture", 100000, True
    cmd_run(a, cfg)
    a.top, a.per_signature = 8, 1
    print("\n=== SYNTHETIC DEMO ranking (not real fares) ===")
    cmd_build(a, cfg)
    cmd_report(a, cfg)


def main():
    p = argparse.ArgumentParser(prog="trip", description="China trip 2027 flight optimizer")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("plan").set_defaults(fn=cmd_plan)
    r = sub.add_parser("run")
    r.add_argument("--provider", default="serpapi", choices=["serpapi", "fixture"])
    r.add_argument("--budget", type=int)
    r.set_defaults(fn=cmd_run)
    for name, fn in (("build", cmd_build), ("report", cmd_report), ("alert", cmd_alert)):
        s = sub.add_parser(name)
        s.add_argument("--demo", action="store_true", help="use synthetic demo DB")
        s.add_argument("--top", type=int, default=10)
        s.add_argument("--per-signature", type=int, default=1)
        if name == "alert":
            s.add_argument("--dry-run", action="store_true")
        s.set_defaults(fn=fn)
    sub.add_parser("demo").set_defaults(fn=cmd_demo)
    i = sub.add_parser("import", help="import observed quotes from a text file (provider=browser)")
    i.add_argument("file")
    i.add_argument("--observed-at")
    i.add_argument("--currency", help="quote currency of the file (default: header #!currency=XXX or the config currency)")
    i.set_defaults(fn=cmd_import)
    o = sub.add_parser("outbound", help="compare MAD -> [stopover] -> Beijing from stored quotes")
    o.add_argument("--demo", action="store_true")
    o.add_argument("--top", type=int, default=30)
    o.set_defaults(fn=cmd_outbound)
    sub.add_parser("trends", help="price history and trends per route").set_defaults(fn=cmd_trends)
    up = sub.add_parser("urls", help="Google Flights URLs for today's collection routine")
    up.add_argument("--limit", type=int, default=400)
    up.set_defaults(fn=cmd_urls)
    fl = sub.add_parser("flex", help="flexible-date coverage of a corridor (default: the return corridors from Moscow) and URLs to quote")
    fl.add_argument("--date", required=True, help="preferred departure date of the first leg, e.g. 2027-03-20")
    fl.add_argument("--flex", type=int, default=2)
    fl.add_argument("--chain", nargs="*", help="city ids, e.g. MOSCOW TEL_AVIV MADRID")
    fl.add_argument("--demo", action="store_true")
    fl.set_defaults(fn=cmd_flex)
    fxp = sub.add_parser("fx", help="fetch/show daily exchange rates (USD is the central currency)")
    fxp.add_argument("--date", default=now_utc().strftime("%Y-%m-%d"))
    fxp.add_argument("--set", nargs="*", metavar="CUR=RATE")
    fxp.add_argument("--export", action="store_true", help="write data/fx.json (used to rebuild the deploy database offline)")
    fxp.set_defaults(fn=cmd_fx)
    sv = sub.add_parser("serve", help="local interactive app at http://localhost:8765")
    sv.add_argument("--port", type=int, default=8765)
    sv.add_argument("--demo", action="store_true")
    sv.set_defaults(fn=cmd_serve)
    a = p.parse_args()
    a.demo = getattr(a, "demo", False)
    a.fn(a, load_config())
