"""Exploration engine: given the legs chosen so far, list the possible next legs with the cumulative budget,
explain which ones break the trip rules, and compute per-branch metrics. Used by the localhost studio and CLI.

Cost model (all in the search currency, BRL):
  flights   - OBSERVED offers (provider data; not bookings)
  hotel     - ESTIMATE: nights between arrival and next departure x nightly rate (config, overridable per request)
  bags      - ESTIMATE: one checked bag per separate ticket
  transfers - ESTIMATE: one airport transfer per arrival (not for the final return to Madrid)
The purchased GRU-MAD-GRU ticket is NOT part of these totals; the UI adds it only if the user asks.
"""
from collections import defaultdict
from datetime import date as Date, timedelta

from .core import city_of, load_cities, to_local, to_utc
from .itineraries import Leg  # noqa: F401  (re-exported for tests)


def leg_key(l):
    """Stable identity of an offer: route, departure, arrival and airlines. NEVER the price, which changes with every new quote
    (a saved plan must keep pointing at the same flight and simply pick up its new price)."""
    return f"{l.origin}>{l.destination}@{l.dep_local}|{l.arr_local}|{l.airlines}"


def _prefix(key):
    """'MAD>BUD@2027-02-12 20:00' from a new key or from the legacy 'MAD>BUD@2027-02-12 20:00#198' format."""
    return key.split("|", 1)[0].split("#", 1)[0]


def leg_dict(l):
    return {"key": leg_key(l), "origin": l.origin, "destination": l.destination, "dep_local": l.dep_local,
            "arr_local": l.arr_local, "price": l.price, "stops": l.stops, "airlines": l.airlines,
            "flights": l.flight_numbers, "observed_at": l.observed_at, "source": l.source,
            "native_price": l.native[0] if l.native else l.price, "native_currency": l.native[1] if l.native else None, "fx_day": (l.observed_at or "")[:10],
            "duration_min": round((l.arr_utc - l.dep_utc).total_seconds() / 60), "baggage": {"carry_on": l.bags.get("carry_on", "unknown"), "checked": l.bags.get("checked", "unknown")},
            "via": [{"airport": a, "minutes": m} for a, m in l.via]}


class Explorer:
    def __init__(self, cfg, legs_by_origin, params=None, cost_scale=1.0):
        self.cfg, self.ap = cfg, cfg["airports"]
        self.scale = cost_scale          # converts the config's cost estimates (defined in costs currency) to the engine currency
        self.params = params or {}
        c = cfg["constraints"]
        self.c, self.costs = c, cfg["costs_brl"]
        self.cities = load_cities()
        self.home = c["home_airport"]
        self.home_city = city_of(self.home, self.ap)
        fx = cfg["fixed"]
        self.arrive = to_utc(fx["inbound_to_europe"]["arrive_local"].replace("T", " "), self.home, self.ap)
        self.leave = to_utc(fx["outbound_home"]["depart_local"].replace("T", " "), self.home, self.ap)
        self.latest_arr = self.leave - timedelta(hours=c["must_be_at_madrid_before_hours_of_departure"])
        self.by_key, self.by_city, self.by_prefix = {}, defaultdict(list), defaultdict(list)
        for legs in legs_by_origin.values():
            for l in legs:
                self.by_key[leg_key(l)] = l
                self.by_prefix[_prefix(leg_key(l))].append(l)
                self.by_city[city_of(l.origin, self.ap)].append(l)
        self.required = set(c["required_cities"])
        self.birthday = cfg.get("birthday", {}).get("date")
        protect = self.params.get("protect_birthday", True)
        self.blocked = set(c.get("no_travel_dates", [])) if protect else set()
        self.hotel_override = {k: float(v) for k, v in (self.params.get("hotel_night") or {}).items()}   # already in the engine currency

    # -- helpers -----------------------------------------------------------------------------
    def meta(self, city):
        return self.cities.get(city, {"name": city.title(), "country": "", "tag": "", "interest": 3})

    def _rule(self, city):
        r = self.c["stay_rules_hours"]
        return r.get(city, r["default"])

    def _split(self, city):
        """How many people share the room in this city (1 = nobody). China: split in two, private rooms only."""
        lod = self.cfg.get("lodging_usd") or {}
        sh = lod.get("shared") or {}
        tier = self.params.get("lodging_tier") or lod.get("default_tier", "budget")
        if self.meta(city).get("country") in sh.get("countries", []) and tier in sh.get("tiers", []):
            return int(sh.get("split", 2))
        return 1

    def _hotel(self, city):
        """What YOU pay per night: the room price divided when the stay is shared, or your own override exactly as typed."""
        if city in self.hotel_override:
            return self.hotel_override[city]
        return self._hotel_full(city) / self._split(city)

    def _hotel_full(self, city):
        """The whole room per night (before splitting)."""
        lod = self.cfg.get("lodging_usd")
        if lod and city in (lod.get("hosted") or {}):
            return 0.0                                              # standing rule: hosted, no lodging cost
        tier = self.params.get("lodging_tier") or (lod or {}).get("default_tier", "budget")
        if lod and city in lod["cities"] and tier in lod["cities"][city]:
            return float(lod["cities"][city][tier])                 # already USD, the engine currency
        h = self.costs["hotel_night"]
        return h.get(city, h["default"]) * self.scale

    def _bag_cost(self, leg):
        """Estimate for one checked bag, waived only when the source says a checked bag is included."""
        return 0 if leg.bags.get("checked") == "included" else self.costs["extra_checked_bag_per_separate_ticket"] * self.scale

    def _transfer(self):
        return self.costs.get("airport_transfer_per_arrival", 0) * self.scale

    def _nights(self, a_utc, b_utc, airport):
        a, b = to_local(a_utc, airport, self.ap), to_local(b_utc, airport, self.ap)
        return max(0, (b.date() - a.date()).days)

    def resolve(self, keys):
        """Keys -> legs. A key from an older save (price in the key, or a flight no longer quoted at that exact time) falls back to the
        cheapest offer with the same route and departure; KeyError only when that flight is gone altogether."""
        out = []
        for k in keys:
            if k in self.by_key:
                out.append(self.by_key[k])
                continue
            same = self.by_prefix.get(_prefix(k))
            if not same:
                raise KeyError(k)
            out.append(min(same, key=lambda l: l.price))
        return out

    def _stays(self, path):
        """[(airport, arrival_utc, departure_utc)] for every stop; the open last stay ends at the return flight."""
        if not path:
            return []
        out = [(self.home, self.arrive, path[0].dep_utc)]
        out += [(path[i].destination, path[i].arr_utc, path[i + 1].dep_utc) for i in range(len(path) - 1)]
        out.append((path[-1].destination, path[-1].arr_utc, self.leave))
        return out

    # -- summary of a path -------------------------------------------------------------------
    def summary(self, path):
        flights = sum(l.price for l in path)
        nights, hotel, hotel_full, shared_nights, risk, flags = {}, 0.0, 0.0, 0, 0.0, []
        for airport, a, b in self._stays(path)[:-1]:
            city, n = city_of(airport, self.ap), self._nights(a, b, airport)
            if n:
                nights[city] = nights.get(city, 0) + n
                hotel += n * self._hotel(city)
                hotel_full += n * (self.hotel_override[city] if city in self.hotel_override else self._hotel_full(city))
                if city not in self.hotel_override and self._split(city) > 1:
                    shared_nights += n
            if airport != self.home and (b - a).total_seconds() / 3600 < self.c["self_transfer_short_layover_hours"]:
                risk += self.c["self_transfer_risk_penalty_brl"] * self.scale
                flags.append(f"Short connection of {(b - a).total_seconds() / 3600:.0f}h at {airport} (separate tickets)")
        bags = sum(self._bag_cost(l) for l in path)
        transfers = self._transfer() * sum(1 for l in path if l.destination != self.home)
        visited = [self.home_city] + [city_of(l.destination, self.ap) for l in path]
        here = path[-1].destination if path else self.home
        t = path[-1].arr_utc if path else self.arrive
        done = bool(path) and here == self.home and self.required <= set(visited)
        total = flights + hotel + bags + transfers
        pref = self.c.get("preferred_home_arrival_by")
        fragile = bool(path and here == self.home and pref and to_local(t, here, self.ap).strftime("%Y-%m-%d") > pref)
        if fragile:
            flags.append("Lands in Madrid on the day of the flight home: it meets the minimum buffer but is fragile on separate tickets")
        ro = self.c.get("research_only_cities") or {}
        restricted = [c for c in dict.fromkeys(visited) if c in ro]
        flags += [f"{self.meta(c)['name']}: {ro[c]}" for c in restricted]
        return {"flights": flights, "hotel": hotel, "hotel_full": hotel_full, "hotel_shared_nights": shared_nights, "hotel_saved": hotel_full - hotel, "bags": bags, "transfers": transfers, "risk": risk,
                "total": total, "adjusted": total + risk, "nights": nights, "flags": flags,
                "here": here, "city": city_of(here, self.ap),
                "arrive_utc": t.isoformat(), "arrive_local": to_local(t, here, self.ap).strftime("%Y-%m-%d %H:%M"),
                "days_since_start": round((t - self.arrive).total_seconds() / 86400, 1),
                "slack_hours_to_return": round((self.latest_arr - t).total_seconds() / 3600),
                "visited": visited, "complete": done,
                "missing_required": sorted(self.required - set(visited)), "legs": len(path),
                "fragile_return": fragile, "research_only": restricted}

    def metrics(self, path):
        """Decision metrics for comparing branches (all derived from the chosen legs and config)."""
        s = self.summary(path)
        flight_min = sum((l.arr_utc - l.dep_utc).total_seconds() / 60 for l in path)
        conn_h, short = 0.0, 0
        for i in range(len(path) - 1):
            gap = (path[i + 1].dep_utc - path[i].arr_utc).total_seconds() / 3600
            if gap < self.c["self_transfer_short_layover_hours"]:
                conn_h += gap
                short += 1
        per_country = defaultdict(int)
        for city, n in s["nights"].items():
            per_country[self.meta(city)["country"]] += n
        cities = [c for c in dict.fromkeys(s["visited"]) if c != self.home_city]
        return {"flight_hours": round(flight_min / 60, 1), "connection_hours": round(conn_h, 1),
                "separate_tickets": len(path), "short_connections": short,
                "destinations": [c for c in cities], "destination_count": len(cities),
                "nights_total": sum(s["nights"].values()), "nights_china": per_country.get("China", 0),
                "nights_russia": per_country.get("Russia", 0),
                "interest": sum(self.meta(c)["interest"] for c in cities),
                "stops_total": sum(l.stops for l in path), "birthday": self._birthday(path)}

    def _birthday(self, path):
        if not self.birthday or not path:
            return {"status": "unknown", "city": None, "note": ""}
        bd = Date.fromisoformat(self.birthday)
        for l in path:
            if l.dep_local[:10] == self.birthday or l.arr_local[:10] == self.birthday:
                return {"status": "transit", "city": None, "note": "You would be travelling on your birthday."}
        stays = self._stays(path)
        if path[-1].destination != self.home:        # an unfinished branch has no known end: do not assume the last stay lasts
            stays = stays[:-1]
        for airport, a, b in stays:
            if to_local(a, airport, self.ap).date() <= bd <= to_local(b, airport, self.ap).date():
                city = city_of(airport, self.ap)
                return {"status": "stay", "city": city, "note": self.meta(city).get("birthday", "")}
        return {"status": "unknown", "city": None, "note": "Branch does not reach the birthday yet."}

    # -- next options ------------------------------------------------------------------------
    def options(self, path, show_all=False):
        s = self.summary(path)
        city, t = s["city"], (path[-1].arr_utc if path else self.arrive)
        here_airport = s["here"]
        rule = ({"min": self.c["min_madrid_buffer_hours"], "max": self._rule(self.home_city)["max"]}
                if not path else self._rule(city))
        groups = {}
        for cand in self.by_city.get(city, []):
            dest_city = city_of(cand.destination, self.ap)
            if dest_city == city:
                continue
            gap = (cand.dep_utc - t).total_seconds() / 3600
            if gap < 0:
                continue
            why = []
            if gap < rule["min"]:
                why.append(f"Departs only {gap:.0f}h after arrival (minimum {rule['min']}h)")
            if gap > rule["max"]:
                why.append(f"{gap:.0f}h wait in {self.meta(city)['name']} (maximum {rule['max']}h)")
            back = dest_city in (self.c.get("round_trip_spurs") or {}).get(city, []) and len(s["visited"]) >= 2 and s["visited"][-2] == dest_city
            if dest_city in s["visited"] and cand.destination != self.home and not back:
                why.append("City already visited in this branch")
            if cand.destination == self.home and not self.required <= set(s["visited"]):
                why.append("Still missing: " + ", ".join(self.meta(x)["name"] for x in sorted(self.required - set(s["visited"]))))
            if cand.arr_utc > self.latest_arr:
                why.append("Arrives too late to make the confirmed Madrid return flight")
            seq = self.c.get("required_sequence") or []
            ru_first = bool(self.params.get("russia_first")) and dest_city == "MOSCOW"     # the traveller chose to consider Russia on the way out
            if dest_city in seq and not ru_first:
                missing = [x for x in seq[:seq.index(dest_city)] if x not in s["visited"]]
                if missing:
                    why.append("Order: first " + ", ".join(self.meta(x)["name"] for x in missing))
            win = (self.c.get("arrival_windows") or {}).get(dest_city)
            if win and not ru_first and not (win[0] <= cand.arr_local[:10] <= win[1]):
                why.append(f"{self.meta(dest_city)['name']}: you want to arrive between {win[0][5:]} and {win[1][5:]}")
            if cand.dep_local[:10] in self.blocked or cand.arr_local[:10] in self.blocked:
                why.append("Flies on your protected birthday")
            if len(path) >= self.c["max_legs"]:
                why.append("Segment limit reached")
            research = (self.c.get("research_only_cities") or {}).get(dest_city)
            if research:
                why.append(research)            # priced for comparison, never offered as a bookable next step
            nights = self._nights(t, cand.dep_utc, here_airport)
            extra_hotel = nights * self._hotel(city)
            transfer = 0 if cand.destination == self.home else self._transfer()
            inc = cand.price + extra_hotel + self._bag_cost(cand) + transfer
            onward = sum(1 for x in self.by_city.get(dest_city, []) if x.dep_utc > cand.arr_utc and
                         city_of(x.destination, self.ap) != dest_city)
            o = leg_dict(cand)
            o.update({"ok": not why, "why": why, "gap_hours": round(gap, 1), "nights_before": nights,
                      "hotel_before": extra_hotel, "transfer": transfer, "increment": inc,
                      "cumulative": s["total"] + inc, "onward": onward,
                      "airport_change": cand.origin != here_airport})
            groups.setdefault(dest_city, {"city": dest_city, "options": []})["options"].append(o)
        out = []
        for g in groups.values():
            oks = [o for o in g["options"] if o["ok"]]
            if not oks and not show_all:
                continue
            shown = g["options"] if show_all else oks
            shown.sort(key=lambda o: (not o["ok"], o["dep_local"], o["price"]))
            pool = oks or g["options"]
            best = min(pool, key=lambda o: o["cumulative"])
            m, rules = self.meta(g["city"]), self._rule(g["city"])
            out.append({"city": g["city"], "name": m["name"], "country": m["country"], "tag": m.get("tag", ""),
                        "interest": m["interest"], "ok_count": len(oks), "blocked_count": len(g["options"]) - len(oks),
                        "min_price": best["price"], "min_cumulative": best["cumulative"], "best_key": best["key"],
                        "min_duration_min": min(o["duration_min"] for o in pool), "min_stops": min(o["stops"] for o in pool),
                        "date_from": min(o["dep_local"][:10] for o in pool), "date_to": max(o["dep_local"][:10] for o in pool),
                        "stay_days": [round(rules["min"] / 24, 1), round(rules["max"] / 24, 1)],
                        "any_ok": bool(oks), "options": shown})
        out.sort(key=lambda g: (not g["any_ok"], g["min_cumulative"]))
        return {"summary": s, "groups": out}

    # -- analyses ----------------------------------------------------------------------------
    def outbound_table(self, target="BEIJING"):
        """Best MAD -> [stopover] -> target combination per stopover city and nights (nonstop-to-target included)."""
        rows = {}
        for first in self.options([])["groups"]:
            for o1 in first["options"]:
                if not o1["ok"]:
                    continue
                l1 = self.by_key[o1["key"]]
                if first["city"] == target:
                    self._add_row(rows, [l1])
                    continue
                for g2 in self.options([l1])["groups"]:
                    if g2["city"] != target:
                        continue
                    for o2 in g2["options"]:
                        if o2["ok"]:
                            self._add_row(rows, [l1, self.by_key[o2["key"]]])
        return sorted(rows.values(), key=lambda r: r["adjusted"])

    def _add_row(self, rows, path):
        s = self.summary(path)
        stop_city = city_of(path[0].destination, self.ap)
        stop = "No stopover" if len(path) == 1 else self.meta(stop_city)["name"]
        nights = s["nights"].get(stop_city, 0) if len(path) == 2 else 0
        key = (stop, nights)
        row = {"stopover": stop, "stop_city": stop_city if len(path) == 2 else None, "stop_nights": nights,
               "flights": s["flights"], "hotel": s["hotel"], "adjusted": s["adjusted"],
               "arrive_local": s["arrive_local"], "legs": [leg_dict(l) for l in path], "flags": s["flags"]}
        if key not in rows or row["adjusted"] < rows[key]["adjusted"]:
            rows[key] = row

    def coverage(self):
        seen = defaultdict(lambda: [0, 10**9])
        for legs in self.by_city.values():
            for l in legs:
                k = (city_of(l.origin, self.ap), city_of(l.destination, self.ap))
                seen[k][0] += 1
                seen[k][1] = min(seen[k][1], l.price)
        return sorted(({"from": self.meta(a)["name"], "to": self.meta(b)["name"], "offers": n, "min_price": m}
                       for (a, b), (n, m) in seen.items()), key=lambda r: (r["from"], r["to"]))

    def arriving_cities(self):
        return {city_of(l.destination, self.ap) for legs in self.by_city.values() for l in legs}
