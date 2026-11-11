"""Join one-way offers into full trips MAD -> ... -> MAD and rank them.

Every leg is a separate ticket (one-way searches), so any connection is a SELF-TRANSFER:
no protection if the first flight is late. Short ones are penalised and flagged.
"""
import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from . import fx
from .core import city_of, now_utc, to_local, to_utc


@dataclass
class Leg:
    origin: str
    destination: str
    dep_utc: datetime
    arr_utc: datetime
    price: float
    stops: int
    airlines: str
    flight_numbers: str
    dep_local: str
    arr_local: str
    observed_at: str
    source: str = ""
    via: tuple = ()          # ((connection airport, layover minutes), ...) when the source provides it
    native: tuple = ()          # (price, currency) as quoted by the source, before any conversion
    bags: dict = field(default_factory=dict)   # {"carry_on": included|not_included, "checked": included|fee|not_included} when known


@dataclass
class Trip:
    legs: list
    flights_brl: float = 0.0
    hotel_brl: float = 0.0
    bag_brl: float = 0.0
    risk_brl: float = 0.0
    nights: dict = field(default_factory=dict)       # city -> nights
    flags: list = field(default_factory=list)

    @property
    def total_brl(self):
        return self.flights_brl + self.hotel_brl + self.bag_brl

    @property
    def adjusted_brl(self):
        return self.total_brl + self.risk_brl

    @property
    def signature(self):
        """Ordered airports visited, e.g. MAD>BUD>PEK>SVO>IST>MAD."""
        return ">".join([self.legs[0].origin] + [l.destination for l in self.legs])


def load_legs(conn, cfg, providers=("serpapi", "browser", "manual"), keep=None, currency=None):
    """Latest successful search per (origin,destination,date), cheapest K offers each, fresh only."""
    s, ap = cfg["search"], cfg["airports"]
    target = currency or s["currency"]
    fx_tbl = fx.table(conn)
    cutoff = (now_utc() - timedelta(days=s["max_offer_age_days"])).isoformat()
    latest = conn.execute("""SELECT id FROM searches s WHERE ok=1 AND searched_at>=? AND provider IN ({p})
        AND searched_at=(SELECT MAX(searched_at) FROM searches
          WHERE ok=1 AND provider=s.provider AND origin=s.origin AND destination=s.destination AND date=s.date)
        """.format(p=",".join("?" * len(providers))), (cutoff, *providers)).fetchall()
    by_key = defaultdict(list)
    for (sid,) in latest:
        for r in conn.execute("SELECT o.*, s.searched_at, s.provider FROM offers o JOIN searches s ON s.id=o.search_id "
                              "WHERE o.search_id=?", (sid,)):
            if r["origin"] not in ap or r["destination"] not in ap:
                continue
            price = _convert(r["price"], r["currency"], target, r["searched_at"][:10], fx_tbl)
            if price is None:
                continue                      # no exchange rate for that day: better to skip than to guess
            if (r["duration_min"] or 0) > s["max_leg_duration_hours"] * 60 or (r["stops"] or 0) > s["max_stops"]:
                continue        # drops 48h/3-stop self-transfer chains that make "cheapest" misleading
            by_key[(r["origin"], r["destination"], r["dep_local"][:10])].append(Leg(
                r["origin"], r["destination"], datetime.fromisoformat(r["dep_utc"]),
                datetime.fromisoformat(r["arr_utc"]), price, r["stops"] or 0, r["airlines"] or "",
                r["flight_numbers"] or "", r["dep_local"], r["arr_local"], r["searched_at"], r["provider"], _via(r["raw_json"]), (r["price"], r["currency"]), _bags(r["raw_json"])))
    legs = defaultdict(list)
    for (o, _d, _day), items in by_key.items():
        legs[o].extend(sorted(items, key=lambda l: l.price)[: keep or s["keep_cheapest_per_route_date"]])
    return legs


def _convert(amount, native, target, day, fx_tbl):
    """Quote currency -> target currency using the rates of the day the offer was observed (USD is the pivot)."""
    if native == target:
        return amount
    rn, rt = fx.rate(fx_tbl, native, day), fx.rate(fx_tbl, target, day)
    if rn is None or rt is None:
        return None
    return amount / rn * rt


def _via(raw_json):
    """Connection airports + layover minutes from the stored raw offer (our import format or SerpApi's 'layovers')."""
    try:
        raw = json.loads(raw_json or "{}")
    except ValueError:
        return ()
    if raw.get("via"):
        return tuple((v["airport"], v.get("minutes")) for v in raw["via"])
    return tuple((x.get("id"), x.get("duration")) for x in raw.get("layovers") or [] if x.get("id"))


def _bags(raw_json):
    try:
        return dict((json.loads(raw_json or "{}").get("bags")) or {})
    except ValueError:
        return {}


def manual_legs(cfg):
    """Legs typed by hand in config (trains, a fare found elsewhere). Priced as given, in cfg currency."""
    ap, out = cfg["airports"], defaultdict(list)
    for m in cfg.get("manual_legs", []):
        out[m["origin"]].append(Leg(
            m["origin"], m["destination"], to_utc(m["dep_local"], m["origin"], ap),
            to_utc(m["arr_local"], m["destination"], ap), float(m["price"]), 0,
            m.get("label", "manual"), "", m["dep_local"], m["arr_local"], "manual", "config"))
    return out


def merge_legs(*maps):
    merged = defaultdict(list)
    for m in maps:
        for origin, items in m.items():
            merged[origin].extend(items)
    return merged


def _rule(cfg, city):
    rules = cfg["constraints"]["stay_rules_hours"]
    return rules.get(city, rules["default"])


def _nights(a_utc, b_utc, airport, ap):
    a, b = to_local(a_utc, airport, ap), to_local(b_utc, airport, ap)
    return max(0, (b.date() - a.date()).days)


BEAM_PER_STATE = 4          # partial itineraries kept per (city sequence, arrival day); config: search.beam_per_state
MAX_STATES_PER_LAYER = 200_000   # hard memory guard per layer; config: search.max_states_per_layer


def build_trips(legs_by_origin, cfg, limit_per_signature=1, beam=None, max_states=None, stats=None):
    """Complete itineraries MAD -> ... -> MAD that satisfy every rule, best `limit_per_signature` per city sequence.

    Layered beam search instead of enumerating every path: layer k holds the partial itineraries of k flights. Among partials that
    share the SAME city sequence and the SAME arrival day only the `beam` cheapest are expanded (they have the same future: the same
    cities visited and almost the same arrival time), and every complete itinerary is priced as soon as it is found. Memory and time
    therefore grow with the number of distinct city sequences and days, not with the number of flight combinations (which exploded
    once flexible dates multiplied the quotes). Larger `beam` approaches exhaustive search. `stats` (a dict) receives the counters.
    """
    c, ap = cfg["constraints"], cfg["airports"]
    s = cfg.get("search", {})
    beam = beam or s.get("beam_per_state", BEAM_PER_STATE)
    max_states = max_states or s.get("max_states_per_layer", MAX_STATES_PER_LAYER)
    home = c["home_airport"]
    home_city = city_of(home, ap)
    arrive = to_utc(cfg["fixed"]["inbound_to_europe"]["arrive_local"].replace("T", " "), home, ap)
    leave = to_utc(cfg["fixed"]["outbound_home"]["depart_local"].replace("T", " "), home, ap)
    earliest_dep = arrive + timedelta(hours=c["min_madrid_buffer_hours"])
    latest_arr = leave - timedelta(hours=c["must_be_at_madrid_before_hours_of_departure"])
    required = set(c["required_cities"])
    blocked = set(c.get("no_travel_dates", []))
    research = c.get("research_only_cities") or {}
    spurs, seq = c.get("round_trip_spurs") or {}, c.get("required_sequence") or []
    windows = c.get("arrival_windows") or {}
    by_city = defaultdict(list)
    for _o, _ls in legs_by_origin.items():
        by_city[city_of(_o, ap)].extend(_ls)

    def travels_on_blocked_day(leg):
        return leg.dep_local[:10] in blocked or leg.arr_local[:10] in blocked

    def next_legs(path, visited):
        """Flights that may follow `path` under the itinerary rules (identical to the previous depth-first search)."""
        city = city_of(path[-1].destination, ap)
        rule = _rule(cfg, city)
        t_arr = path[-1].arr_utc
        for leg in by_city.get(city, ()):                      # any airport of the same city (e.g. arrive PVG, leave SHA)
            gap_h = (leg.dep_utc - t_arr).total_seconds() / 3600
            if not rule["min"] <= gap_h <= rule["max"]:
                continue
            dest_city = city_of(leg.destination, ap)
            if dest_city in research:
                continue                                         # research-only places never enter recommended trips
            back = city_of(path[-1].origin, ap) == dest_city and dest_city in spurs.get(city, [])   # Shanghai -> Singapore -> Shanghai
            if dest_city in visited and leg.destination != home and not back:
                continue
            if dest_city in seq and any(x not in visited for x in seq[:seq.index(dest_city)]):
                continue                                         # e.g. Moscow before Beijing
            win = windows.get(dest_city)
            if win and not (win[0] <= leg.arr_local[:10] <= win[1]):
                continue
            if dest_city == city or leg.arr_utc > latest_arr or travels_on_blocked_day(leg):
                continue
            yield leg, dest_city

    best = defaultdict(list)                                     # signature -> best Trips, cheapest first
    counters = {"expanded": 0, "complete": 0, "layers": 0, "peak_states": 0, "truncated": False}

    def record(path):
        counters["complete"] += 1
        t = _price_trip(path, arrive, cfg)
        if t:
            keep = best[t.signature]
            keep.append(t)
            keep.sort(key=lambda x: x.adjusted_brl)
            del keep[limit_per_signature:]

    layer = []
    for first in legs_by_origin.get(home, ()):
        if first.dep_utc < earliest_dep or first.dep_utc > latest_arr or travels_on_blocked_day(first):
            continue
        if city_of(first.destination, ap) in research:
            continue
        layer.append(([first], frozenset({home_city, city_of(first.destination, ap)})))

    while layer:
        counters["layers"] += 1
        counters["peak_states"] = max(counters["peak_states"], len(layer))
        groups = defaultdict(list)                               # (city sequence, arrival day) -> [(cost, path, visited)]
        for path, visited in layer:
            if path[-1].destination == home:
                if required <= visited:
                    record(path)
                continue
            if len(path) >= c["max_legs"]:
                continue
            counters["expanded"] += 1
            for leg, dest_city in next_legs(path, visited):
                child, seen = path + [leg], visited | {dest_city}
                if leg.destination == home:
                    if required <= seen:
                        record(child)
                    continue
                key = (tuple(l.destination for l in child), leg.arr_local[:10])
                g = groups[key]
                g.append((_price_trip(child, arrive, cfg).adjusted_brl, "|".join(l.origin + l.destination + l.dep_local for l in child), child, seen))
                if len(g) > 4 * beam:                            # keep the buffer small while the layer is built
                    g.sort(key=lambda x: x[:2])
                    del g[beam:]
        nxt = []
        for g in groups.values():
            g.sort(key=lambda x: x[:2])
            nxt.extend(g[:beam])
        if len(nxt) > max_states:                                # last line of defence for memory
            nxt.sort(key=lambda x: x[:2])
            nxt = nxt[:max_states]
            counters["truncated"] = True
        layer = [(p, v) for _, _, p, v in nxt]

    trips = sorted((t for ts in best.values() for t in ts), key=lambda t: t.adjusted_brl)
    if stats is not None:
        stats.update(counters)
    return trips


def _price_trip(path, arrive_home_utc, cfg):
    c, ap, costs = cfg["constraints"], cfg["airports"], cfg["costs_brl"]
    t = Trip(legs=path, flights_brl=sum(l.price for l in path))
    stays = [(path[0].origin, arrive_home_utc, path[0].dep_utc)]
    stays += [(path[i].destination, path[i].arr_utc, path[i + 1].dep_utc) for i in range(len(path) - 1)]
    for airport, a, b in stays:
        city, n = city_of(airport, ap), _nights(a, b, airport, ap)
        if n:
            t.nights[city] = t.nights.get(city, 0) + n
            t.hotel_brl += n * costs["hotel_night"].get(city, costs["hotel_night"]["default"])
    for i in range(len(path) - 1):
        gap_h = (path[i + 1].dep_utc - path[i].arr_utc).total_seconds() / 3600
        if gap_h < c["self_transfer_short_layover_hours"]:
            t.risk_brl += c["self_transfer_risk_penalty_brl"]
            t.flags.append(f"self-transfer {gap_h:.0f}h at {path[i].destination} (separate tickets)")
    t.bag_brl = costs["extra_checked_bag_per_separate_ticket"] * len(path)
    t.bag_brl += costs.get("airport_transfer_per_arrival", 0) * sum(1 for l in path if l.destination != cfg["constraints"]["home_airport"])
    return t


def describe(t):
    rows = []
    for l in t.legs:
        rows.append(f"{l.origin}>{l.destination} {l.dep_local} -> {l.arr_local}  BRL {l.price:,.0f}  "
                    f"{l.airlines or '?'} {l.flight_numbers}".rstrip())
    return rows
