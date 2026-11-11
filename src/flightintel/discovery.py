"""Route discovery: which next destinations make sense from where a branch stands, on which dates, and what is still unquoted.

The flight engine (explore.py) can only rank flights that were already observed. This module answers the questions that come BEFORE a
fare exists, so that "Add next", the collection queue and Sacred Atlas can show a destination as "needs quotation" instead of hiding it:

  plan_graph()        city graph of the planned searches, with dates propagated forward (earliest departure from each city) and
                      backward (latest arrival in each city that still reaches Madrid before the confirmed flight home)
  feasible_dates()    planned (origin city, destination city, date) that can belong to at least one valid itinerary
  departure_window()  useful departure dates from a branch's current city to one candidate, with the reason for every excluded date
  discover()          candidates from a branch (planned routes, remaining required cities, same-country cities, wishlist), each with
                      a state (observed / stale / missing / temporally_blocked / research_only / confirmed), day-by-day coverage and the
                      search jobs that would fill the gaps

Every date test here is deliberately LENIENT (a flight may land the day it leaves and take up to ~2 days; minimum stays are rounded
down to whole days): a date that could be useful is never dropped. Exact validation happens on real timestamps once a fare is
observed (Explorer.options applies every rule to the actual departure and arrival times). Nothing here invents a fare.
"""
from collections import defaultdict
from datetime import date as Date, datetime, timedelta

from . import planner
from .core import city_of, load_cities, to_local

STATES = ("observed", "stale", "missing", "temporally_blocked", "research_only", "confirmed")
INF = 10 ** 9
MAX_FLIGHT_DAYS = 2            # a one-way itinerary may land up to two calendar days after it leaves (30 h max duration)
MAX_WINDOW_DAYS = 21           # never list more than three weeks of candidate dates for one destination


def _ord(iso):
    return Date.fromisoformat(str(iso)[:10]).toordinal()


def _iso(o):
    return Date.fromordinal(o).isoformat()


def airports_of(cfg, city):
    return [k for k, a in cfg["airports"].items() if a["city"] == city]


def min_days(cfg, city):
    rules = cfg["constraints"]["stay_rules_hours"]
    return int(rules.get(city, rules["default"])["min"] // 24)


def trip_bounds(cfg):
    """(home city, first possible departure ordinal, last ordinal on which Madrid must be reached, protected ordinals)."""
    c = cfg["constraints"]
    home_city = cfg["airports"][c["home_airport"]]["city"]
    arrive_home = datetime.fromisoformat(cfg["fixed"]["inbound_to_europe"]["arrive_local"])
    first_dep = (arrive_home + timedelta(hours=c["min_madrid_buffer_hours"])).date().toordinal()
    deadline = (datetime.fromisoformat(cfg["fixed"]["outbound_home"]["depart_local"])
                - timedelta(hours=c["must_be_at_madrid_before_hours_of_departure"])).date().toordinal()
    protected = {_ord(d) for d in c.get("no_travel_dates", [])}
    return home_city, first_dep, deadline, protected


def plan_graph(cfg, jobs=None):
    """City graph of the planned searches with forward/backward date propagation.

    ed[city]  earliest day one can LEAVE the city (arrival as early as the plan allows + minimum stay)
    la[city]  latest day one can ARRIVE in the city and still complete the remaining planned legs before the Madrid deadline
    """
    ap, c = cfg["airports"], cfg["constraints"]
    jobs = jobs if jobs is not None else planner.expand(cfg)
    home_city, first_dep, deadline, protected = trip_bounds(cfg)
    windows = {city: (_ord(w[0]), _ord(w[1])) for city, w in (c.get("arrival_windows") or {}).items()}
    edges = defaultdict(set)
    for j in jobs:
        u, v = ap[j.origin.split(",")[0]]["city"], ap[j.destination.split(",")[0]]["city"]
        d = _ord(j.date)
        if u != v and d not in protected:
            edges[(u, v)].add(d)
    cities = {x for e in edges for x in e} | {home_city}
    lands_ok = lambda v, d: v not in windows or windows[v][0] - MAX_FLIGHT_DAYS <= d <= windows[v][1]

    ed = {x: INF for x in cities}
    ed[home_city] = first_dep
    for _ in range(len(cities) + 2):
        changed = False
        for (u, v), ds in edges.items():
            if ed[u] >= INF or v == home_city:
                continue
            ok = [d for d in ds if d >= ed[u] and lands_ok(v, d)]
            if ok and min(ok) + min_days(cfg, v) < ed[v]:
                ed[v] = min(ok) + min_days(cfg, v)
                changed = True
        if not changed:
            break

    la = {x: -INF for x in cities}
    la[home_city] = deadline
    for _ in range(len(cities) + 2):
        changed = False
        for (u, v), ds in edges.items():
            if la[v] <= -INF or u == home_city:
                continue
            ok = [d for d in ds if d <= la[v] and d >= ed[u] and lands_ok(v, d)]
            if not ok:
                continue
            new = max(ok) - min_days(cfg, u)
            if u in windows:
                new = min(new, windows[u][1])
            if new > la[u]:
                la[u] = new
                changed = True
        if not changed:
            break
    return {"edges": edges, "ed": ed, "la": la, "windows": windows, "home_city": home_city, "first_dep": first_dep,
            "deadline": deadline, "protected": protected, "lands_ok": lands_ok}


def feasible_dates(cfg, jobs=None, graph=None):
    """{(origin_city, dest_city, date)} of the planned grid that can belong to at least one valid itinerary."""
    g = graph or plan_graph(cfg, jobs)
    out = set()
    for (u, v), ds in g["edges"].items():
        for d in ds:
            if d < g["ed"][u] or g["la"][v] <= -INF or d > g["la"][v] or not g["lands_ok"](v, d):
                continue
            out.add((u, v, _iso(d)))
    # "Russia first" is an opt-in outbound (Madrid > Moscow > Beijing) where Moscow's arrival window does not apply: keep those two legs
    first_china = cfg["constraints"].get("first_china_city")
    for (u, v), ds in g["edges"].items():
        if (u == g["home_city"] and v in g["windows"]) or (u in g["windows"] and v == first_china):
            out.update((u, v, _iso(d)) for d in ds if d >= g["first_dep"])
    return out


def departure_window(cfg, graph, here_city, arrive_local, visited, dest, is_first=False, russia_first=False):
    """Useful departure dates from `here_city` to `dest` for a branch that reached `here_city` at `arrive_local` (naive local datetime).

    Returns (dates, excluded) where `excluded` maps a reason to the dates it removed, so the UI can say WHY a date does not work.
    """
    c = cfg["constraints"]
    home_city, first_dep, deadline, protected = graph["home_city"], graph["first_dep"], graph["deadline"], graph["protected"]
    rules = c["stay_rules_hours"]
    rule = rules.get(here_city, rules["default"])
    stay_min = c["min_madrid_buffer_hours"] if is_first else rule["min"]
    stay_max = rule["max"] if not is_first else rules.get(home_city, rules["default"])["max"]
    lo = (arrive_local + timedelta(hours=stay_min)).date().toordinal()
    hi = (arrive_local + timedelta(hours=stay_max)).date().toordinal()
    excluded = defaultdict(list)
    reasons_only = []
    seq = c.get("required_sequence") or []
    if dest in seq and not (russia_first and dest == "MOSCOW"):
        missing = [x for x in seq[:seq.index(dest)] if x not in visited]
        if missing:
            reasons_only.append("Order: first " + ", ".join(missing))
            return [], {reasons_only[0]: []}
    window = graph["windows"].get(dest) if not (russia_first and dest == "MOSCOW") else None
    la_dest = deadline if dest == home_city else graph["la"].get(dest, -INF)
    no_onward = dest != home_city and la_dest <= -INF
    if no_onward:
        la_dest = deadline - min_days(cfg, dest)                 # no planned onward route yet: keep it open, the UI says so
    span_lo, span_hi = min(lo, hi), min(max(lo, hi), lo + MAX_WINDOW_DAYS)
    dates = []
    for d in range(span_lo, span_hi + 1):
        why = None
        if d < max(lo, first_dep):
            why = "Before the minimum stay ends"
        elif d in protected:
            why = "Protected day: no flights"
        elif d > deadline:
            why = "After the latest return to Madrid"
        elif d > la_dest:
            why = "Too late to finish the remaining route before the return to Madrid"
        elif window and not (window[0] - MAX_FLIGHT_DAYS <= d <= window[1]):
            why = f"Outside the arrival window ({_iso(window[0])[5:]} to {_iso(window[1])[5:]})"
        if why:
            excluded[why].append(_iso(d))
        else:
            dates.append(_iso(d))
    if hi < lo:
        excluded["Maximum stay already exceeded"].append(_iso(lo))
    if no_onward:
        excluded["No onward route planned from here yet (dates kept open)"] = []
    return dates, dict(excluded)


def _neighbour(dates, d, flex):
    o = _ord(d)
    return any(abs(_ord(x) - o) <= flex for x in dates)


def discover(conn, ex, cfg, path, flex=2, preferred=None, requests=(), only=None):
    """Next-destination candidates from the end of `path` (list of Leg), observed or not, with day-level coverage and search jobs."""
    from . import flexible, scheduler
    ap, c = cfg["airports"], cfg["constraints"]
    names = load_cities()
    graph = plan_graph(cfg)
    home = c["home_airport"]
    home_city = graph["home_city"]
    here_ap = path[-1].destination if path else home
    here = city_of(here_ap, ap)
    t_arr = path[-1].arr_utc if path else ex.arrive
    arrive_local = to_local(t_arr, here_ap, ap).replace(tzinfo=None)
    visited = {home_city} | {city_of(l.destination, ap) for l in path}
    required = set(c["required_cities"])
    remaining = sorted(required - visited)
    research = c.get("research_only_cities") or {}
    russia_first = bool(ex.params.get("russia_first"))

    cands = {}
    for (u, v) in graph["edges"]:
        if u == here:
            cands.setdefault(v, "Planned route")
    for r in remaining:
        cands.setdefault(r, "Required destination")
    country = names.get(here, {}).get("country")
    for city, m in names.items():
        if country and m.get("country") == country and airports_of(cfg, city):
            cands.setdefault(city, f"Elsewhere in {country}")
    for w in cfg.get("wishlist", []):
        if airports_of(cfg, w):
            cands.setdefault(w, "On your wishlist")
    if not remaining:
        cands[home_city] = "Return to Madrid"
    for x in list(cands):
        if x == here or (x in visited and x != home_city) or not airports_of(cfg, x) or x == "SAO_PAULO":
            cands.pop(x, None)
        elif x == home_city and remaining:
            cands.pop(x, None)
    if only:
        cands = {k: v for k, v in cands.items() if k == only}

    opts = ex.options(path, show_all=True)
    groups = {g["city"]: g for g in opts["groups"]}
    requested = {(r.get("origin_city"), r.get("dest_city"), r.get("date")) for r in requests}
    fresh_edge = defaultdict(set)
    for city, legs in ex.by_city.items():
        for l in legs:
            fresh_edge[(city, city_of(l.destination, ap))].add(l.dep_local[:10])
    out = []
    for dest, why_listed in cands.items():
        dates, excluded = departure_window(cfg, graph, here, arrive_local, visited, dest, is_first=not path, russia_first=russia_first)
        g = groups.get(dest)
        by_day = defaultdict(list)
        for o in (g["options"] if g else []):
            by_day[o["dep_local"][:10]].append(o)
        last_seen = flexible._last_seen(conn, cfg, here, dest, dates) if conn is not None and dates else {}
        pref = preferred if preferred in dates else (dates[0] if dates else None)
        days = []
        for d in dates:
            row = {"date": d, "in_flex": bool(pref) and abs(_ord(d) - _ord(pref)) <= flex, "preferred": d == pref,
                   "url": flexible.gf_url({k: v["name"] for k, v in names.items()}, here, dest, d)}
            ok = [o for o in by_day.get(d, []) if o["ok"]]
            if ok:
                best = min(ok, key=lambda o: o["price"])
                row.update(status="observed", min_price=best["price"], offers=len(ok), best_key=best["key"],
                           observed_at=max(o.get("observed_at") or "" for o in ok))
            elif by_day.get(d):
                row.update(status="observed_blocked", offers=len(by_day[d]), reasons=sorted({w for o in by_day[d] for w in o["why"]})[:3])
            elif d in last_seen:
                row.update(status="stale", observed_at=last_seen[d])
            else:
                row.update(status="missing")
            days.append(row)
        if dest in research:
            state = "research_only"
        elif not dates:
            state = "temporally_blocked"
        elif any(d["status"] == "observed" for d in days):
            state = "observed"
        elif any(d["status"] == "stale" for d in days):
            state = "stale"
        elif all(d["status"] == "observed_blocked" for d in days):
            state = "temporally_blocked"
        else:
            state = "missing"
        observed_dates = [d["date"] for d in days if d["status"] == "observed"]
        jobs = []
        for d in days:
            if d["status"] not in ("missing", "stale") or not d["in_flex"] and pref:
                continue
            jobs.append(scheduler.job(
                cfg, here, dest, d["date"], d["status"], sources=["context"],
                completes=dest in required or dest == home_city, edge_fresh_days=len(fresh_edge.get((here, dest), ())),
                near_observed=_neighbour(observed_dates or sorted(fresh_edge.get((here, dest), ())), d["date"], flex),
                context_hit=True, requested=(here, dest, d["date"]) in requested, research_only=dest in research,
                interest=names.get(dest, {}).get("interest", 3), last_quoted=d.get("observed_at", ""),
                origin_interest=names.get(here, {}).get("interest", 3), priority=5 if dest in required or dest == home_city else 3))
        meta = names.get(dest, {})
        out.append({
            "city": dest, "name": meta.get("name", dest.title()), "country": meta.get("country", ""), "tag": meta.get("tag", ""),
            "interest": meta.get("interest", 3), "why_listed": why_listed, "state": state, "required": dest in required,
            "research_only": research.get(dest), "dates": days, "excluded": excluded, "preferred": pref, "flex": flex,
            "observed_count": len(observed_dates), "min_price": min((d["min_price"] for d in days if d.get("min_price") is not None), default=None),
            "stay_days": [round(ex._rule(dest)["min"] / 24, 1), round(ex._rule(dest)["max"] / 24, 1)],
            "jobs": scheduler.rank(jobs, cfg),
        })
    order = {"observed": 1, "stale": 2, "missing": 3, "temporally_blocked": 4, "research_only": 5}
    out.sort(key=lambda x: (0 if x["required"] else order.get(x["state"], 6), -x["interest"], x["name"]))
    return {"here": here, "here_name": names.get(here, {}).get("name", here), "arrive_local": arrive_local.strftime("%Y-%m-%d %H:%M"),
            "remaining_required": remaining, "flex": flex, "candidates": out,
            "states": list(STATES), "note": "Destinations without fares are planning candidates only: nothing here is bookable until a fare is observed."}
