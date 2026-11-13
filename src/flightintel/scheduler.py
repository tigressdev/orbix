"""Adaptive search scheduler: which unquoted (route, date) is worth a search first.

    P = wU*U + wV*V + wO*O + wR*R + wF*F          (weights: config search.priority_weights; default 0.35/0.25/0.20/0.10/0.10)

U  urgency to complete a trip: the destination is required (or the return home) and/or the route has no fresh quote at all
V  relevance to an active scenario: the job comes from a branch being explored, or the traveller asked for it
O  opportunity: a date next to an observed fare on the same route, which may reveal a cheaper or better-timed option
R  personal relevance: interest in both cities (config/cities.json) and the stage priority (config/trip.json)
F  freshness need: the date was quoted before but the quote is too old to use

Jobs are classified "required" (a gap that blocks completing or comparing a route) or "valuable" (could improve a route that already
works); impossible dates never reach the scheduler (see discovery.feasible_dates). A small share of the list (search.exploration_share)
is reserved for routes never quoted, rotated daily, so collection does not keep circling the same corridors.

A job is only a request to search. It never carries a price; prices exist only after a results page was read and imported.
"""
import hashlib
from datetime import datetime, timezone
from urllib.parse import quote

from .core import load_cities

DEFAULT_WEIGHTS = {"U": 0.35, "V": 0.25, "O": 0.20, "R": 0.10, "F": 0.10}
DEFAULT_EXPLORATION_SHARE = 0.1


def weights(cfg):
    w = dict(DEFAULT_WEIGHTS)
    w.update((cfg.get("search") or {}).get("priority_weights") or {})
    return w


def gf_url(o_city, d_city, day, names=None):
    names = names or {k: v["name"] for k, v in load_cities().items()}
    q = quote(f"Flights from {names.get(o_city, o_city.title())} to {names.get(d_city, d_city.title())} on {day} one way")
    return f"https://www.google.com/travel/flights?q={q}&curr=USD&hl=en&gl=br"


def job(cfg, o_city, d_city, day, status, sources=(), completes=False, edge_fresh_days=0, near_observed=False, context_hit=False,
        requested=False, research_only=False, interest=3, last_quoted="", names=None, origin_interest=None, priority=3):
    """One search request, scored. `status` is 'missing' or 'stale'."""
    ap = cfg["airports"]
    # U: a gap (no fresh quote on the route) blocks comparing or completing; a covered route only needs improving
    U = 1.0 if completes and not edge_fresh_days else 0.6 if not edge_fresh_days else 0.5 if completes else 0.2
    V = 1.0 if (context_hit or requested) else 0.0
    # O: next to an observed fare (may undercut it) > a route never quoted (unknown potential) > another date of a covered route
    O = 1.0 if near_observed else 0.6 if not edge_fresh_days else 0.4
    # R: interest in both ends of the route (a required destination counts as 10) and the stage priority set in config/trip.json (1-5)
    ends = ((10 if completes else interest) + (interest if origin_interest is None else origin_interest)) / 20
    R = max(0.0, min(1.0, 0.5 * ends + 0.5 * max(1, min(5, priority)) / 5))
    F = 1.0 if status == "stale" else 0.3
    w = weights(cfg)
    score = w["U"] * U + w["V"] * V + w["O"] * O + w["R"] * R + w["F"] * F
    if research_only:
        score *= 0.5                                         # researchable, never prioritised like a bookable route
    return {
        "origin_city": o_city, "dest_city": d_city, "date": day, "status": status,
        "origin_airports": ",".join(k for k, a in ap.items() if a["city"] == o_city),
        "dest_airports": ",".join(k for k, a in ap.items() if a["city"] == d_city),
        "score": round(score, 4), "components": {"U": U, "V": V, "O": O, "R": round(R, 2), "F": F},
        "kind": "required" if not edge_fresh_days else "valuable",
        "sources": list(dict.fromkeys(sources)), "requested": bool(requested), "research_only": bool(research_only),
        "last_quoted": (last_quoted or "")[:10], "exploration": False, "url": gf_url(o_city, d_city, day, names),
    }


def merge(jobs):
    """One job per (origin city, destination city, date): the same search requested by several sources is done once, at its best score."""
    best = {}
    for j in jobs:
        k = (j["origin_city"], j["dest_city"], j["date"])
        cur = best.get(k)
        if cur is None:
            best[k] = dict(j)
            continue
        srcs = list(dict.fromkeys(cur["sources"] + j["sources"]))
        if j["score"] > cur["score"]:
            cur = best[k] = dict(j)
        cur["sources"] = srcs
        cur["requested"] = cur["requested"] or j["requested"]
    return list(best.values())


def rank(jobs, cfg, limit=None, today=None):
    """Highest score first, with a share of the slots reserved for never-quoted routes (deterministic daily rotation)."""
    jobs = sorted(merge(jobs), key=lambda j: (-j["score"], j["date"], j["origin_city"], j["dest_city"]))
    if not limit or limit >= len(jobs):
        return jobs
    share = (cfg.get("search") or {}).get("exploration_share", DEFAULT_EXPLORATION_SHARE)
    k = max(1, round(limit * share)) if share > 0 else 0
    head, tail = jobs[: limit - k], jobs[limit - k:]
    seed = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pool = [j for j in tail if not j["last_quoted"]] or tail
    pool.sort(key=lambda j: hashlib.sha1(f"{seed}|{j['origin_city']}|{j['dest_city']}|{j['date']}".encode()).hexdigest())
    picked = [dict(j, exploration=True) for j in pool[:k]]
    return head + picked
