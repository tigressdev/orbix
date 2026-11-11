"""Flexible Route Intelligence: quote coverage per date, chronologically compatible multi-leg combinations for a
corridor (e.g. Moscow -> Tel Aviv -> Madrid), and the search jobs needed to fill the gaps. Shared by Journey,
Explore, Sacred Atlas and Price Pulse through /api/flex/*. Standard library only.

Rules that never bend here:
  - only OBSERVED offers are combined; a missing fare is reported as missing, never as zero;
  - cash (flights, lodging, bags, transfers) is kept apart from risk, which is reported as flags;
  - a corridor through a research-only city (safety or permit) is never marked recommendable, whatever it costs.
"""
import urllib.parse
from datetime import timedelta

from .core import city_of, load_cities, now_utc, to_local
from .date_windows import DateWindow, propagate
from .planner import Job, merge_jobs

MAX_OPTIONS = 12


def airports_of(cfg, city):
    return [k for k, a in cfg["airports"].items() if a["city"] == city]


def research_only(cfg):
    """{city: reason} for places that may be researched and priced but never recommended as bookable."""
    return dict(cfg["constraints"].get("research_only_cities") or {})


def gf_url(names, o_city, d_city, date):
    q = urllib.parse.quote(f"Flights from {names.get(o_city, o_city.title())} to {names.get(d_city, d_city.title())} on {date} one way")
    return f"https://www.google.com/travel/flights?q={q}&curr=USD&hl=en&gl=br"


def _last_seen(conn, cfg, o_city, d_city, dates):
    """{date: last searched_at} for any airport pair of the two cities, fresh or not (to tell 'stale' from 'never quoted')."""
    A, B = airports_of(cfg, o_city), airports_of(cfg, d_city)
    if not (A and B and dates):
        return {}
    q = ("SELECT substr(o.dep_local,1,10) d, MAX(s.searched_at) t FROM offers o JOIN searches s ON s.id=o.search_id "
         f"WHERE s.ok=1 AND o.origin IN ({','.join('?' * len(A))}) AND o.destination IN ({','.join('?' * len(B))}) "
         f"AND substr(o.dep_local,1,10) IN ({','.join('?' * len(dates))}) GROUP BY 1")
    return {r["d"]: r["t"] for r in conn.execute(q, (*A, *B, *dates))}


def coverage(conn, ex, cfg, o_city, d_city, dates, preferred=None):
    """Per-date quote status for one leg: observed (fresh), stale (quoted, too old to use), missing, or protected."""
    names = {k: v["name"] for k, v in load_cities().items()}
    legs = [l for l in ex.by_city.get(o_city, ()) if city_of(l.destination, ex.ap) == d_city]
    seen = _last_seen(conn, cfg, o_city, d_city, dates)
    out = []
    for d in dates:
        day = [l for l in legs if l.dep_local[:10] == d]
        row = {"date": d, "preferred": d == preferred, "url": gf_url(names, o_city, d_city, d)}
        if d in ex.blocked:
            row.update(status="protected", note="Protected date: no flights")
        elif day:
            best = min(day, key=lambda l: l.price)
            row.update(status="observed", min_price=best.price, offers=len(day), airlines=best.airlines, stops=best.stops,
                       observed_at=max(l.observed_at or "" for l in day))
        elif d in seen:
            row.update(status="stale", observed_at=seen[d], note=f"Last quoted {seen[d][:10]}: too old to use, quote again")
        else:
            row.update(status="missing", note="Needs quotation")
        out.append(row)
    return out


def _combos(ex, chain, windows):
    """Every chronologically valid chain of observed legs: each onward flight leaves after the minimum stay and before the maximum."""
    home_city = ex.home_city
    found = []

    def walk(i, path):
        if i == len(chain) - 1:
            found.append(list(path))
            return
        o, d, dates = chain[i], chain[i + 1], set(windows[i]["dates"])
        for l in ex.by_city.get(o, ()):
            if city_of(l.destination, ex.ap) != d or l.dep_local[:10] not in dates:
                continue
            if l.dep_local[:10] in ex.blocked or l.arr_local[:10] in ex.blocked:
                continue
            if path:
                gap = (l.dep_utc - path[-1].arr_utc).total_seconds() / 3600
                r = ex._rule(o)
                if gap < r["min"] or gap > r["max"]:
                    continue
            if d == home_city and l.arr_utc > ex.latest_arr:
                continue
            walk(i + 1, path + [l])

    walk(0, [])
    return found


def _price(ex, cfg, path):
    """Cash cost of a corridor option: flights + lodging at intermediate stops + one bag per ticket + transfers. Risk is NOT added."""
    flights = sum(l.price for l in path)
    nights, hotel = {}, 0.0
    flags = []
    for a, b in zip(path, path[1:]):
        city = city_of(a.destination, ex.ap)
        n = ex._nights(a.arr_utc, b.dep_utc, a.destination)
        nights[city] = n
        hotel += n * ex._hotel(city)
        gap = (b.dep_utc - a.arr_utc).total_seconds() / 3600
        if gap < ex.c["self_transfer_short_layover_hours"]:
            flags.append(f"Short connection of {gap:.0f}h in {ex.meta(city)['name']} (separate tickets)")
        if a.destination != b.origin:
            flags.append(f"Airport change in {ex.meta(city)['name']}: {a.destination} to {b.origin}")
    bags = sum(ex._bag_cost(l) for l in path)
    transfers = ex._transfer() * sum(1 for l in path if l.destination != ex.home)
    last = path[-1]
    arr_local = to_local(last.arr_utc, last.destination, ex.ap)
    slack = (ex.latest_arr - last.arr_utc).total_seconds() / 3600 if city_of(last.destination, ex.ap) == ex.home_city else None
    pref = ex.c.get("preferred_home_arrival_by")
    fragile = bool(pref and slack is not None and arr_local.strftime("%Y-%m-%d") > pref)
    if fragile:
        flags.append(f"Lands in Madrid on {arr_local:%d %b}, after your preferred {pref[8:]}/{pref[5:7]} buffer before the flight home")
    from .explore import leg_dict
    return {"legs": [leg_dict(l) for l in path], "flights": flights, "hotel": hotel, "bags": bags, "transfers": transfers,
            "total": flights + hotel + bags + transfers, "nights": nights, "nights_total": sum(nights.values()),
            "depart_local": path[0].dep_local, "arrive_local": last.arr_local, "slack_hours_to_return": None if slack is None else round(slack),
            "fragile_return": fragile, "flags": flags,
            "observed_at": min((l.observed_at or "") for l in path)}


def pareto(options):
    """Non-dominated options over (cash, extra nights, return slack). Money and time stay separate dimensions."""
    def dom(a, b):
        sa, sb = a["slack_hours_to_return"] or 0, b["slack_hours_to_return"] or 0
        le = a["total"] <= b["total"] and a["nights_total"] <= b["nights_total"] and sa >= sb
        lt = a["total"] < b["total"] or a["nights_total"] < b["nights_total"] or sa > sb
        return le and lt
    return [o for o in options if not any(dom(p, o) for p in options if p is not o)]


def corridor(conn, ex, cfg, chain, preferred, flex=2, hard_min=None, hard_max=None, stay_hours=None, label=None):
    """Windows, coverage and best observed combinations for one corridor. `chain` is a list of city ids."""
    c = cfg["constraints"]
    rules = dict(c["stay_rules_hours"])
    rules.update(stay_hours or {})
    first = DateWindow(preferred, flex, flex, hard_min, hard_max, tuple(sorted(ex.blocked)))
    deadline = None
    if chain[-1] == ex.home_city:
        deadline = to_local(ex.latest_arr, ex.home, ex.ap).strftime("%Y-%m-%d")
    wins = propagate(chain, first, rules, deadline, tuple(sorted(ex.blocked)))
    legs = []
    for i, w in enumerate(wins):
        days = coverage(conn, ex, cfg, w["from"], w["to"], w["dates"], preferred if i == 0 else None)
        legs.append({**w, "from_name": ex.meta(w["from"])["name"], "to_name": ex.meta(w["to"])["name"], "days": days,
                     "observed": sum(1 for d in days if d["status"] == "observed"),
                     "needs_quote": sum(1 for d in days if d["status"] in ("missing", "stale"))})
    options = sorted((_price(ex, cfg, p) for p in _combos(ex, chain, wins)), key=lambda o: o["total"])
    front = pareto(options)
    for o in options:
        o["pareto"] = any(o is p for p in front)
    ro = research_only(cfg)
    restricted = {x: ro[x] for x in chain if x in ro}
    uncovered = [l for l in legs if not l["observed"]]
    if restricted:
        status = "research_only"
    elif not options:
        status = "incomplete"
    else:
        status = "comparable"
    return {"id": ">".join(chain), "label": label or " → ".join(ex.meta(x)["name"] for x in chain), "chain": chain,
            "preferred": preferred, "flex": flex, "legs": legs, "options": options[:MAX_OPTIONS], "option_count": len(options),
            "best": options[0] if options else None, "status": status, "restricted": restricted,
            "recommendable": bool(options) and not restricted and not options[0]["fragile_return"],
            "missing_legs": [f"{l['from_name']} → {l['to_name']}" for l in uncovered],
            "unpriced": ["Ground transfers between airport and city", "Entrance fees and local transport"],
            "evaluated_at": now_utc().isoformat(timespec="seconds")}


def compare(conn, ex, cfg, corridors, preferred, flex=2, hard_min=None, hard_max=None):
    """Several corridors between the same two ends, with the difference of each complete option against the cheapest safe one."""
    out = [corridor(conn, ex, cfg, c["chain"], preferred, flex, hard_min, hard_max, c.get("stay_hours"), c.get("label")) for c in corridors]
    base = min((c["best"]["total"] for c in out if c["best"] and c["status"] == "comparable"), default=None)
    for c in out:
        c["delta_vs_best_safe"] = None if not c["best"] or base is None else c["best"]["total"] - base
    return {"corridors": out, "baseline_total": base, "preferred": preferred, "flex": flex}


def jobs(cfg, corridor_result, priority=3, stage="flex"):
    """Search jobs for every date of the corridor that still needs a quote, grouped by city airports (one search covers PEK+PKX)."""
    out = []
    for leg in corridor_result["legs"]:
        o, d = ",".join(airports_of(cfg, leg["from"])), ",".join(airports_of(cfg, leg["to"]))
        for day in leg["days"]:
            if day["status"] in ("missing", "stale"):
                out.append(Job(o, d, day["date"], stage, priority + (1 if day.get("preferred") else 0)))
    return merge_jobs(out)


def default_return_corridors(cfg):
    """Corridors compared for the way back from Moscow, from config (constraints.return_corridors) with a safe default."""
    home = city_of(cfg["constraints"]["home_airport"], cfg["airports"])
    conf = cfg["constraints"].get("return_corridors")
    if conf:
        return conf
    return [{"chain": ["MOSCOW", "ISTANBUL", home]}, {"chain": ["MOSCOW", "BELGRADE", home]}, {"chain": ["MOSCOW", home]}]
