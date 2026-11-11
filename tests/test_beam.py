import copy
import sys
import time
import unittest
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flightintel.core import city_of, load_config, to_utc  # noqa: E402
from flightintel.itineraries import Leg, _price_trip, _rule, build_trips  # noqa: E402

CFG = load_config()
CFG["constraints"].pop("arrival_windows", None)
CFG["constraints"].pop("required_sequence", None)
AP = CFG["airports"]


def leg(o, d, dep, arr, price):
    return Leg(o, d, to_utc(dep, o, AP), to_utc(arr, d, AP), float(price), 0, "T", "", dep, arr, "x")


def day(base, n):
    return (datetime.fromisoformat(base) + timedelta(days=n)).strftime("%Y-%m-%d")


def network(dates_per_leg=3):
    """MAD -> {BUD, VIE, PEK} -> PEK -> {SHA, TFU} -> SVO -> {IST, BEG} -> MAD with several departure dates on each leg."""
    L, k = [], 0

    def add(o, d, base, n, dep_t, arr_t, arr_plus, price):
        nonlocal k
        for i in range(n):
            k += 1
            dep = day(base, i)
            L.append(leg(o, d, f"{dep} {dep_t}", f"{day(dep, arr_plus)} {arr_t}", price + (k * 37) % 90))
    n = dates_per_leg
    add("MAD", "PEK", "2027-02-12", n, "13:00", "07:00", 1, 650)
    add("MAD", "BUD", "2027-02-12", n, "07:00", "10:00", 0, 90)
    add("MAD", "VIE", "2027-02-12", n, "08:00", "11:00", 0, 110)
    add("BUD", "PEK", "2027-02-14", n, "09:00", "02:00", 1, 520)
    add("VIE", "PEK", "2027-02-14", n, "09:30", "02:30", 1, 560)
    add("PEK", "SHA", "2027-02-20", n, "09:00", "11:00", 0, 120)
    add("PEK", "TFU", "2027-02-20", n, "08:00", "11:00", 0, 130)
    add("TFU", "SHA", "2027-02-24", n, "15:00", "17:30", 0, 160)
    add("SHA", "SVO", "2027-03-02", n, "10:00", "16:00", 0, 380)
    add("TFU", "SVO", "2027-03-02", n, "10:00", "14:00", 0, 400)
    add("SVO", "IST", "2027-03-06", n, "10:00", "14:00", 0, 150)
    add("SVO", "BEG", "2027-03-06", n, "11:00", "12:20", 0, 330)
    add("IST", "MAD", "2027-03-09", n, "10:00", "13:30", 0, 120)
    add("BEG", "MAD", "2027-03-09", n, "09:00", "12:30", 0, 110)
    by = defaultdict(list)
    for x in L:
        by[x.origin].append(x)
    return by


def exhaustive(legs_by_origin, cfg):
    """The previous depth-first enumeration, kept here as the reference: every complete path, priced, best per city sequence."""
    c = cfg["constraints"]
    home = c["home_airport"]
    arrive = to_utc(cfg["fixed"]["inbound_to_europe"]["arrive_local"].replace("T", " "), home, AP)
    leave = to_utc(cfg["fixed"]["outbound_home"]["depart_local"].replace("T", " "), home, AP)
    earliest = arrive + timedelta(hours=c["min_madrid_buffer_hours"])
    latest = leave - timedelta(hours=c["must_be_at_madrid_before_hours_of_departure"])
    required, blocked = set(c["required_cities"]), set(c.get("no_travel_dates", []))
    by_city = defaultdict(list)
    for o, ls in legs_by_origin.items():
        by_city[city_of(o, AP)].extend(ls)
    found = []

    def dfs(path, visited):
        here = path[-1].destination
        if here == home:
            if required <= visited:
                found.append(list(path))
            return
        if len(path) >= c["max_legs"]:
            return
        city = city_of(here, AP)
        rule = _rule(cfg, city)
        for nxt in by_city.get(city, ()):
            gap = (nxt.dep_utc - path[-1].arr_utc).total_seconds() / 3600
            dest = city_of(nxt.destination, AP)
            if not rule["min"] <= gap <= rule["max"] or dest in visited and nxt.destination != home or dest == city:
                continue
            if dest in (c.get("research_only_cities") or {}) or nxt.arr_utc > latest or nxt.dep_local[:10] in blocked or nxt.arr_local[:10] in blocked:
                continue
            path.append(nxt)
            dfs(path, visited | {dest})
            path.pop()

    for first in legs_by_origin.get(home, ()):
        if first.dep_utc < earliest or first.dep_utc > latest or first.dep_local[:10] in blocked or first.arr_local[:10] in blocked:
            continue
        dfs([first], {city_of(home, AP), city_of(first.destination, AP)})
    best = {}
    for p in found:
        t = _price_trip(p, arrive, cfg)
        if t and (t.signature not in best or t.adjusted_brl < best[t.signature].adjusted_brl):
            best[t.signature] = t
    return best, len(found)


class BeamSearch(unittest.TestCase):
    def test_wide_beam_matches_the_exhaustive_search(self):
        legs = network(3)
        ref, n_paths = exhaustive(legs, CFG)
        self.assertGreater(len(ref), 3)
        self.assertGreater(n_paths, 100)
        got = {t.signature: t for t in build_trips(legs, CFG, 1, beam=60)}
        self.assertEqual(set(got), set(ref))
        for sig, t in ref.items():
            self.assertAlmostEqual(got[sig].adjusted_brl, t.adjusted_brl, msg=sig)

    def test_default_beam_finds_the_global_optimum_and_never_beats_it(self):
        legs = network(4)
        ref, _ = exhaustive(legs, CFG)
        got = {t.signature: t for t in build_trips(legs, CFG, 1)}
        self.assertTrue(got)
        for sig, t in got.items():
            self.assertGreaterEqual(t.adjusted_brl, ref[sig].adjusted_brl - 1e-9, msg=f"{sig} cannot be cheaper than the optimum")
        self.assertAlmostEqual(min(t.adjusted_brl for t in got.values()), min(t.adjusted_brl for t in ref.values()))

    def test_every_returned_trip_obeys_the_rules(self):
        for t in build_trips(network(4), CFG, 2):
            self.assertEqual(t.legs[0].origin, "MAD")
            self.assertEqual(t.legs[-1].destination, "MAD")
            self.assertIn("PEK", [l.destination for l in t.legs])
            for a, b in zip(t.legs, t.legs[1:]):
                self.assertGreaterEqual((b.dep_utc - a.arr_utc).total_seconds(), 0)
            self.assertLessEqual(t.legs[-1].arr_local, "2027-03-25 16:30")

    def test_same_input_same_output(self):
        a = [(t.signature, round(t.adjusted_brl, 4), [l.dep_local for l in t.legs]) for t in build_trips(network(4), CFG, 2)]
        b = [(t.signature, round(t.adjusted_brl, 4), [l.dep_local for l in t.legs]) for t in build_trips(network(4), CFG, 2)]
        self.assertEqual(a, b)

    def test_limit_per_signature(self):
        trips = build_trips(network(4), CFG, 3)
        count = defaultdict(int)
        for t in trips:
            count[t.signature] += 1
        self.assertLessEqual(max(count.values()), 3)
        self.assertGreater(max(count.values()), 1)


class ExplosionGuard(unittest.TestCase):
    def test_many_dates_stay_fast_and_bounded(self):
        legs = network(6)                                           # 6 dates on every leg: the old enumeration grows to tens of thousands of paths
        _, n_paths = exhaustive(legs, CFG)
        self.assertGreater(n_paths, 20_000)
        stats, t0 = {}, time.time()
        trips = build_trips(legs, CFG, 1, stats=stats)
        self.assertLess(time.time() - t0, 20)
        self.assertTrue(trips)
        beam = CFG["search"].get("beam_per_state", 4)
        self.assertLessEqual(stats["peak_states"], beam * len({(l.origin, l.destination, l.arr_local[:10]) for ls in legs.values() for l in ls}) * 20)
        self.assertFalse(stats["truncated"])

    def test_hard_cap_truncates_instead_of_growing(self):
        stats = {}
        trips = build_trips(network(6), CFG, 1, beam=8, max_states=5, stats=stats)
        self.assertTrue(stats["truncated"])
        self.assertLessEqual(stats["peak_states"], 5 + 100)         # first layer is built before the cap applies
        self.assertIsInstance(trips, list)

    def test_config_overrides_default_beam(self):
        cfg = copy.deepcopy(CFG)
        cfg["search"]["beam_per_state"] = 1
        s1, s4 = {}, {}
        build_trips(network(4), cfg, 1, stats=s1)
        build_trips(network(4), CFG, 1, beam=4, stats=s4)
        self.assertLess(s1["expanded"], s4["expanded"])


if __name__ == "__main__":
    unittest.main()
