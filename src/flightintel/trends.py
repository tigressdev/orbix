"""Price history and trends per route.

Every observation keeps the day it was read (searches.searched_at), so history builds up by itself: collect once a day
(a new data file dated that day, or the SerpApi run) and each route gets a new point. Prices are compared in USD, converted
with the exchange rate of the day each offer was observed. Nothing is invented: a route with a single snapshot is a
"baseline" and has no trend yet.

Route code: PRIMARY_AIRPORT(origin city)_PRIMARY_AIRPORT(destination city), e.g. MAD_PEK for Madrid -> Beijing.
Trend per departure date = latest snapshot vs the previous one; the route trend is the median of those changes.
"""
from collections import defaultdict
from datetime import date as Date
from statistics import median

from . import fx
from .core import city_of, load_cities

THRESHOLD = 3.0          # percent: moves smaller than this are "stable"


def route_code(cities, a_city, b_city):
    return f"{cities.get(a_city, {}).get('code', a_city[:3])}_{cities.get(b_city, {}).get('code', b_city[:3])}"


def collect(conn, cfg, providers=("serpapi", "browser", "manual")):
    """{(origin_city, dest_city, dep_date, day): stats} using only the latest search per key."""
    ap = cfg["airports"]
    tbl = fx.table(conn)
    q = ("SELECT o.*, s.id sid, s.searched_at, s.provider FROM offers o JOIN searches s ON s.id=o.search_id "
         f"WHERE s.ok=1 AND s.provider IN ({','.join('?' * len(providers))})")
    latest = {}
    rows = list(conn.execute(q, providers))
    for r in rows:
        if r["origin"] not in ap or r["destination"] not in ap:
            continue
        k = (city_of(r["origin"], ap), city_of(r["destination"], ap), r["dep_local"][:10], r["searched_at"][:10])
        if k not in latest or r["searched_at"] > latest[k][0]:
            latest[k] = (r["searched_at"], r["sid"])
    groups = defaultdict(list)
    for r in rows:
        if r["origin"] not in ap or r["destination"] not in ap:
            continue
        k = (city_of(r["origin"], ap), city_of(r["destination"], ap), r["dep_local"][:10], r["searched_at"][:10])
        if latest[k][1] != r["sid"]:
            continue
        native, day = r["currency"], r["searched_at"][:10]
        rn = fx.rate(tbl, native, day)
        if rn is None:
            continue
        groups[k].append({"usd": r["price"] / rn, "stops": r["stops"] or 0, "airlines": r["airlines"] or "", "dep": r["dep_local"],
                          "origin": r["origin"], "destination": r["destination"], "native": (r["price"], native), "observed_at": r["searched_at"]})
    out = {}
    for k, offers in groups.items():
        cheapest = min(offers, key=lambda o: o["usd"])
        nonstop = [o["usd"] for o in offers if o["stops"] == 0]
        out[k] = {"min_usd": cheapest["usd"], "median_usd": median(o["usd"] for o in offers), "n": len(offers),
                  "nonstop_min_usd": min(nonstop) if nonstop else None, "cheapest": cheapest}
    return out


def _status(pct):
    return "down" if pct <= -THRESHOLD else "up" if pct >= THRESHOLD else "flat"


def compute(conn, cfg, max_age_days=None):
    cities = load_cities()
    stats = collect(conn, cfg)
    by_route = defaultdict(lambda: defaultdict(dict))            # route -> dep_date -> day -> stats
    for (oc, dc, dep, day), v in stats.items():
        by_route[(oc, dc)][dep][day] = v
    all_days = sorted({k[3] for k in stats})
    today = Date.fromisoformat(all_days[-1]) if all_days else None
    max_age = max_age_days or cfg["search"]["max_offer_age_days"]
    routes = []
    for (oc, dc), deps in by_route.items():
        changes, per_date, hist = [], [], defaultdict(list)
        for dep, series in sorted(deps.items()):
            days = sorted(series)
            last = series[days[-1]]
            per_date.append({"dep_date": dep, "day": days[-1], "min_usd": last["min_usd"], "n": last["n"], "snapshots": len(days),
                             "airlines": last["cheapest"]["airlines"], "stops": last["cheapest"]["stops"]})
            for d in days:
                hist[d].append(series[d]["min_usd"])
            if len(days) >= 2:
                a, b = series[days[-2]]["min_usd"], series[days[-1]]["min_usd"]
                changes.append({"dep_date": dep, "pct": (b - a) / a * 100, "from_day": days[-2], "to_day": days[-1], "from_usd": a, "to_usd": b})
        latest_day = max(p["day"] for p in per_date)
        cheapest = min((p for p in per_date if p["day"] == latest_day), key=lambda p: p["min_usd"])
        history = [{"day": d, "min_usd": min(v), "dates": len(v)} for d, v in sorted(hist.items())]
        trend = {"status": "baseline", "pct": None}
        if changes:
            pct = median(c["pct"] for c in changes)
            ref = max(changes, key=lambda c: c["to_day"])
            trend = {"status": _status(pct), "pct": pct, "dates_compared": len(changes), "from_day": ref["from_day"], "to_day": ref["to_day"]}
        nonstop = [v["nonstop_min_usd"] for s in deps.values() for d, v in s.items() if d == latest_day and v["nonstop_min_usd"]]
        age = (today - Date.fromisoformat(latest_day)).days if today else 0
        routes.append({"code": route_code(cities, oc, dc), "from": cities.get(oc, {}).get("name", oc), "to": cities.get(dc, {}).get("name", dc),
                       "from_city": oc, "to_city": dc, "latest_day": latest_day, "age_days": age, "stale": age >= max_age,
                       "cheapest_usd": cheapest["min_usd"], "cheapest_dep": cheapest["dep_date"], "cheapest_airlines": cheapest["airlines"],
                       "cheapest_stops": cheapest["stops"], "nonstop_usd": min(nonstop) if nonstop else None,
                       "dates": per_date, "history": history, "trend": trend, "changes": changes,
                       "priority": bool(cities.get(dc, {}).get("priority") or cities.get(oc, {}).get("priority"))})
    routes.sort(key=lambda r: (not r["priority"], r["from_city"], r["to_city"]))
    snapshots = len(all_days)
    movers = sorted((r for r in routes if r["trend"]["status"] in ("down", "up")), key=lambda r: r["trend"]["pct"])
    return {"routes": routes, "days": all_days, "snapshots": snapshots,
            "summary": {"routes": len(routes), "offers": sum(v["n"] for v in stats.values()), "snapshot_days": snapshots,
                        "first_day": all_days[0] if all_days else None, "last_day": all_days[-1] if all_days else None,
                        "falling": sum(1 for r in routes if r["trend"]["status"] == "down"),
                        "rising": sum(1 for r in routes if r["trend"]["status"] == "up"),
                        "stable": sum(1 for r in routes if r["trend"]["status"] == "flat"),
                        "baseline": sum(1 for r in routes if r["trend"]["status"] == "baseline"),
                        "stale": sum(1 for r in routes if r["stale"]), "max_age_days": max_age,
                        "biggest_drops": [r["code"] for r in movers if r["trend"]["pct"] < 0][:5],
                        "biggest_rises": [r["code"] for r in reversed(movers) if r["trend"]["pct"] > 0][:5]}}
