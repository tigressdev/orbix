"""Turns config stages into search jobs and picks which to run within the API budget."""
from dataclasses import dataclass
from datetime import date as Date, datetime, timedelta

from .core import now_utc


@dataclass(frozen=True)
class Job:
    origin: str
    destination: str
    date: str
    stage: str
    priority: int


def _groups(codes, ap):
    """PEK+PKX -> 'PEK,PKX': Google Flights/SerpApi accept several airports of a city in ONE search."""
    by = {}
    for c in codes:
        by.setdefault(ap[c]["city"], []).append(c)
    return [",".join(v) for v in by.values()]


def expand(cfg):
    jobs = []
    for st in cfg["stages"]:
        if not st.get("enabled", True):
            continue
        ap = cfg["airports"]
        pairs = [tuple(x) for x in st["pairs"]] if st.get("pairs") else             [(o, x) for o in _groups(st["from"], ap) for x in _groups(st["to"], ap)
             if not set(o.split(",")) & set(x.split(","))]
        d, end = Date.fromisoformat(st["dates"]["start"]), Date.fromisoformat(st["dates"]["end"])
        while d <= end:
            for o, dst in pairs:
                jobs.append(Job(o, dst, d.isoformat(), st["id"], st.get("priority", 1)))
            d += timedelta(days=1)
    # de-duplicate (a route can appear in several stages)
    return list(dict.fromkeys(jobs))


def last_searched(conn, provider):
    rows = conn.execute("SELECT origin,destination,date,MAX(searched_at) t FROM searches "
                        "WHERE provider=? AND ok=1 GROUP BY 1,2,3", (provider,)).fetchall()
    return {(r["origin"], r["destination"], r["date"]): datetime.fromisoformat(r["t"]) for r in rows}


def pick(conn, jobs, provider, budget, min_refresh_hours):
    """Stalest-first with priority weighting, skipping jobs refreshed recently.

    Never-searched jobs come first (rotating through the whole grid instead of always
    re-running the first N, which was a flaw in the starter project).
    """
    seen = last_searched(conn, provider)
    now = now_utc()
    scored = []
    for j in jobs:
        t = seen.get((j.origin, j.destination, j.date))
        age_h = 1e6 if t is None else (now - t).total_seconds() / 3600
        if age_h < min_refresh_hours:
            continue
        scored.append((min(age_h, 1e6) * j.priority, j))
    scored.sort(key=lambda x: -x[0])
    return [j for _, j in scored[:budget]]


def quota_summary(cfg, jobs):
    per_run = cfg["search"]["max_searches_per_run"]
    return {"grid_size": len(jobs), "per_run_budget": per_run,
            "days_to_cover_grid_once": -(-len(jobs) // per_run),
            "searches_per_month_at_daily_runs": per_run * 30}
