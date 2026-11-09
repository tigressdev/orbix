"""Analytical highlights over every complete itinerary found in the OBSERVED data.

Everything here is derived from the observed offers and the config. Nothing is a market-price forecast:
'opportunity' compares today's offers with each other (no price history exists yet) and says so.
"""
from collections import defaultdict
from statistics import median

from .core import city_of, now_utc
from .explore import leg_dict
from .itineraries import build_trips


def _money(x):
    return f"\u27e6{x:.2f}\u27e7"        # the UI replaces this with the amount in the currency the user picked


def serialize(ex, path):
    s, m = ex.summary(path), ex.metrics(path)
    sig = ">".join([path[0].origin] + [l.destination for l in path])
    return {"signature": sig, "legs": [leg_dict(l) for l in path], "summary": s, "metrics": m,
            "cities": [ex.meta(c)["name"] for c in m["destinations"]]}


def _reasons(item, baseline, ex):
    s, m = item["summary"], item["metrics"]
    out = []
    first = city_of(item["legs"][0]["destination"], ex.ap)
    if baseline and item is not baseline and first != "BEIJING" and baseline["summary"]["flights"] is not None:
        n = s["nights"].get(first, 0)
        d = s["flights"] - baseline["summary"]["flights"]
        out.append(f"{ex.meta(first)['name']} adds {n} night{'s' if n != 1 else ''} and changes flight spending by "
                   f"{'+' if d >= 0 else '-'}{_money(abs(d))} compared with the cheapest route that goes straight to Beijing "
                   f"({' → '.join(['Madrid'] + baseline['cities'] + ['Madrid'])}).")
    elif first == "BEIJING":
        out.append("Goes straight from Madrid to Beijing, with no European stopover.")
    if baseline and item is not baseline:
        dh = m["flight_hours"] - baseline["metrics"]["flight_hours"]
        out.append(f"Flight time is {abs(dh):.1f}h {'longer' if dh > 0 else 'shorter'} than that baseline.")
    out.append(f"{m['nights_china']} nights in China and {m['nights_russia']} in Russia; {m['destination_count']} destinations.")
    if m["short_connections"]:
        out.append(f"{m['short_connections']} connection(s) under 24h on separate tickets (missed-connection risk).")
    else:
        out.append("No connection shorter than 24h between tickets.")
    b = m["birthday"]
    out.append("Birthday: " + (f"you would be in {ex.meta(b['city'])['name']}." if b["status"] == "stay"
                               else "you would be in transit." if b["status"] == "transit" else "not covered by this branch."))
    return out


def _scaled(cfg, k):
    """Copy of cfg whose cost estimates are multiplied by k, so build_trips (which prices in the config's currency) can rank USD legs."""
    import copy
    c = copy.deepcopy(cfg)
    c["costs_brl"]["hotel_night"] = {a: b * k for a, b in c["costs_brl"]["hotel_night"].items()}
    for key in ("extra_checked_bag_per_separate_ticket", "airport_transfer_per_arrival"):
        c["costs_brl"][key] = c["costs_brl"].get(key, 0) * k
    c["constraints"]["self_transfer_risk_penalty_brl"] *= k
    return c


def compute(cfg, ex, legs_by_origin):
    trips = build_trips(legs_by_origin, _scaled(cfg, ex.scale), 1)
    items = [serialize(ex, t.legs) for t in trips]
    result = {"status": "ready", "generated_at": now_utc().isoformat(), "complete_count": len(items),
              "highlights": [], "stopover_economics": ex.outbound_table()[:24], "coverage": ex.coverage()}
    arriving = ex.arriving_cities()
    result["gaps"] = [{"city": c, "name": ex.meta(c)["name"], "country": ex.meta(c)["country"]}
                      for c in cfg.get("wishlist", []) if c not in arriving]
    if not items:
        return result
    items.sort(key=lambda i: i["summary"]["adjusted"])
    cheapest = items[0]
    direct = [i for i in items if city_of(i["legs"][0]["destination"], ex.ap) == "BEIJING"]
    baseline = direct[0] if direct else cheapest

    def norm(vals):
        lo, hi = min(vals), max(vals)
        return [0 if hi == lo else (v - lo) / (hi - lo) for v in vals]

    cost = norm([i["summary"]["adjusted"] for i in items])
    hours = norm([i["metrics"]["flight_hours"] + i["metrics"]["connection_hours"] for i in items])
    risk = norm([i["metrics"]["short_connections"] for i in items])
    balanced = min(zip(items, cost, hours, risk), key=lambda x: .5 * x[1] + .3 * x[2] + .2 * x[3])[0]
    cap = cheapest["summary"]["adjusted"] * 1.35
    cultural = max((i for i in items if i["summary"]["adjusted"] <= cap),
                   key=lambda i: (i["metrics"]["interest"], -i["summary"]["adjusted"]))
    efficient = min(items, key=lambda i: (i["metrics"]["flight_hours"] + i["metrics"]["connection_hours"],
                                          i["summary"]["adjusted"]))

    pair = defaultdict(list)                           # observed offers per city pair
    for legs in ex.by_city.values():
        for l in legs:
            pair[(city_of(l.origin, ex.ap), city_of(l.destination, ex.ap))].append(l.price)

    def saving(i):
        tot, n = 0.0, 0
        for l in i["legs"]:
            prices = pair[(city_of(l["origin"], ex.ap), city_of(l["destination"], ex.ap))]
            if len(prices) >= 3:
                tot += median(prices) - l["price"]
                n += len(prices)
        return tot, n

    opp = max(items, key=lambda i: saving(i)[0])
    opp_save, opp_n = saving(opp)

    def add(key, title, subtitle, item, extra=None):
        h = {"key": key, "title": title, "subtitle": subtitle, "trip": item, "reasons": _reasons(item, baseline, ex)}
        h["reasons"] += extra or []
        result["highlights"].append(h)

    add("lowest", "Lowest-cost journey", "Cheapest complete route that satisfies every mandatory destination and date.", cheapest)
    add("balanced", "Best balanced journey", "Weighs cost (50%), travel plus connection time (30%) and missed-connection risk (20%).", balanced)
    add("cultural", "Best cultural journey",
        f"Most destinations of interest among routes within 35% of the lowest cost ({_money(cap)}). Interest scores are your editable preferences.",
        cultural)
    add("efficient", "Best time-efficient journey", "Least time in the air and in short connections.", efficient)
    add("opportunity", "Best opportunity today",
        "Observed fares well below the median observed fare for the same city pairs.", opp,
        [f"Its fares total {_money(max(opp_save, 0))} below the median of {opp_n} observed offers for the same city pairs. "
         "This compares today's offers with each other; there is no price history yet, so it is not proof of a market bargain."])
    return result
