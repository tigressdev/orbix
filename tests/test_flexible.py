import copy
import sqlite3
import sys
import unittest
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flightintel import flexible, planner  # noqa: E402
from flightintel.core import SCHEMA, load_config, to_local, to_utc  # noqa: E402
from flightintel.date_windows import DateWindow, propagate  # noqa: E402
from flightintel.explore import Explorer  # noqa: E402
from flightintel.itineraries import Leg, build_trips  # noqa: E402

CFG = load_config()
AP = CFG["airports"]
RULES = CFG["constraints"]["stay_rules_hours"]


def leg(o, d, dep, arr, price=100.0):
    return Leg(o, d, to_utc(dep, o, AP), to_utc(arr, d, AP), price, 0, "T", "", dep, arr, "2026-11-11T10:00:00+00:00")


def explorer(*legs, cfg=CFG, params=None):
    by = defaultdict(list)
    for l in legs:
        by[l.origin].append(l)
    return Explorer(cfg, by, params)


_DBS = []


def empty_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    _DBS.append(conn)
    return conn


def tearDownModule():
    for c in _DBS:
        c.close()


class DateWindows(unittest.TestCase):
    def test_plus_minus_two_days(self):
        self.assertEqual(DateWindow("2027-03-20").dates(), ["2027-03-18", "2027-03-19", "2027-03-20", "2027-03-21", "2027-03-22"])

    def test_exact_and_hard_limits_never_widen(self):
        self.assertEqual(DateWindow("2027-03-20", 0, 0).dates(), ["2027-03-20"])
        self.assertEqual(DateWindow("2027-03-20", 2, 2, hard_min_date="2027-03-19", hard_max_date="2027-03-21").dates(),
                         ["2027-03-19", "2027-03-20", "2027-03-21"])

    def test_protected_birthday_is_removed(self):
        self.assertNotIn("2027-03-14", DateWindow("2027-03-14", 2, 2, protected_dates=("2027-03-14",)).dates())
        self.assertEqual(len(DateWindow("2027-03-14", 2, 2, protected_dates=("2027-03-14",)).dates()), 4)

    def test_forward_and_backward_propagation(self):
        wins = propagate(["MOSCOW", "TEL_AVIV", "MADRID"], DateWindow("2027-03-20"), RULES, deadline_date="2027-03-25")
        self.assertEqual(wins[0]["dates"][0], "2027-03-18")
        self.assertEqual(wins[1]["earliest"], "2027-03-20")          # 48 h minimum in Tel Aviv after the earliest arrival
        self.assertEqual(wins[1]["latest"], "2027-03-25")            # never after the Madrid deadline
        late = propagate(["MOSCOW", "TEL_AVIV", "MADRID"], DateWindow("2027-03-24"), RULES, deadline_date="2027-03-25")
        self.assertEqual(late[0]["latest"], "2027-03-23")            # backward: must leave Moscow 2 days before the deadline
        self.assertNotIn("2027-03-24", late[0]["dates"])

    def test_same_day_connection_allowed_for_short_minimum(self):
        wins = propagate(["MOSCOW", "ISTANBUL", "MADRID"], DateWindow("2027-03-20", 0, 0), RULES, deadline_date="2027-03-25")
        self.assertEqual(wins[1]["earliest"], "2027-03-20")


class TimeZones(unittest.TestCase):
    def test_overnight_eastbound_stays_chronological(self):
        l = leg("MAD", "PEK", "2027-02-12 13:00", "2027-02-13 06:30")
        self.assertLess(l.dep_utc, l.arr_utc)
        self.assertEqual((l.arr_utc - l.dep_utc).total_seconds() / 3600, 10.5)

    def test_westbound_lands_before_it_left_on_the_clock_but_not_in_utc(self):
        l = leg("PEK", "SVO", "2027-03-12 11:30", "2027-03-12 15:05")
        self.assertAlmostEqual((l.arr_utc - l.dep_utc).total_seconds() / 3600, 8.58, places=1)

    def test_round_trip_local_utc_local(self):
        for ap, text in (("TLV", "2027-03-20 23:50"), ("MAD", "2027-03-25 16:30"), ("GRU", "2027-03-26 05:30")):
            self.assertEqual(to_local(to_utc(text, ap, AP), ap, AP).strftime("%Y-%m-%d %H:%M"), text)

    def test_iana_zone_respects_daylight_saving_when_tzdata_exists(self):
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo("Europe/Madrid")
        except Exception:
            self.skipTest("no tzdata on this machine: fixed offsets are used")
        winter = to_utc("2027-03-25 12:00", "MAD", AP)
        summer = to_utc("2027-03-29 12:00", "MAD", AP)             # after the 28 March change
        self.assertEqual(winter.hour, 11)
        self.assertEqual(summer.hour, 10)


class Jobs(unittest.TestCase):
    def test_duplicate_jobs_keep_highest_priority(self):
        a = planner.Job("SVO", "TLV", "2027-03-20", "one", 2)
        b = planner.Job("SVO", "TLV", "2027-03-20", "two", 5)
        merged = planner.merge_jobs([a, b, a])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].priority, 5)

    def test_expand_has_no_duplicate_route_dates(self):
        jobs = planner.expand(CFG)
        self.assertEqual(len(jobs), len({(j.origin, j.destination, j.date) for j in jobs}))

    def test_jobs_only_for_dates_that_need_a_quote(self):
        ex = explorer(leg("SVO", "IST", "2027-03-20 10:00", "2027-03-20 14:00"))
        res = flexible.corridor(empty_db(), ex, CFG, ["MOSCOW", "ISTANBUL", "MADRID"], "2027-03-20", 2)
        jobs = flexible.jobs(CFG, res)
        self.assertNotIn(("SVO,VKO,DME", "2027-03-20"), {(j.origin, j.date) for j in jobs if "IST" in j.destination})
        self.assertTrue(all("," in j.origin or len(j.origin) == 3 for j in jobs))
        self.assertEqual(len(jobs), len({(j.origin, j.destination, j.date) for j in jobs}))


class Corridors(unittest.TestCase):
    def setUp(self):
        self.out = leg("SVO", "TLV", "2027-03-20 09:00", "2027-03-20 13:00", 180)
        self.back = leg("TLV", "MAD", "2027-03-22 15:00", "2027-03-22 20:00", 90)
        self.too_soon = leg("TLV", "MAD", "2027-03-21 08:00", "2027-03-21 13:00", 40)
        self.ist1 = leg("SVO", "IST", "2027-03-20 10:00", "2027-03-20 14:00", 130)
        self.ist2 = leg("IST", "MAD", "2027-03-21 10:00", "2027-03-21 13:30", 110)
        self.ex = explorer(self.out, self.back, self.too_soon, self.ist1, self.ist2)

    def test_missing_fare_is_missing_not_zero(self):
        res = flexible.corridor(empty_db(), explorer(self.out), CFG, ["MOSCOW", "TEL_AVIV", "MADRID"], "2027-03-20", 2)
        self.assertIsNone(res["best"])
        self.assertEqual(res["option_count"], 0)
        self.assertIn("Tel Aviv → Madrid", res["missing_legs"])
        for d in res["legs"][1]["days"]:
            self.assertEqual(d["status"], "missing")
            self.assertNotIn("min_price", d)

    def test_overnight_stopover_counts_nights_and_respects_minimum_stay(self):
        res = flexible.corridor(empty_db(), self.ex, CFG, ["MOSCOW", "TEL_AVIV", "MADRID"], "2027-03-20", 2)
        best = res["best"]
        self.assertEqual([l["key"].split("@")[0] for l in best["legs"]], ["SVO>TLV", "TLV>MAD"])
        self.assertEqual(best["nights"], {"TEL_AVIV": 2})
        self.assertGreater(best["hotel"], 0)
        self.assertEqual(best["flights"], 270)                         # the 40-dollar flight 19 h after landing is not a valid combination
        self.assertAlmostEqual(best["total"], best["flights"] + best["hotel"] + best["bags"] + best["transfers"])

    def test_safety_restricted_corridor_is_never_recommendable(self):
        res = flexible.compare(empty_db(), self.ex, CFG, [{"chain": ["MOSCOW", "ISTANBUL", "MADRID"]}, {"chain": ["MOSCOW", "TEL_AVIV", "MADRID"]}], "2027-03-20", 2)
        ist, tlv = res["corridors"]
        self.assertEqual(tlv["status"], "research_only")
        self.assertFalse(tlv["recommendable"])
        self.assertIsNotNone(tlv["best"])                              # still priced, for research
        self.assertTrue(ist["recommendable"])
        self.assertEqual(res["baseline_total"], ist["best"]["total"])  # the baseline is the cheapest SAFE corridor
        self.assertEqual(ist["delta_vs_best_safe"], 0)

    def test_custom_stay_is_enforced_by_combinations_not_only_search_windows(self):
        result = flexible.corridor(empty_db(), self.ex, CFG, ["MOSCOW", "TEL_AVIV", "MADRID"],
                                   "2027-03-20", 0, stay_hours={"TEL_AVIV": {"min": 72, "max": 96}})
        self.assertIsNone(result["best"])
        shorter = flexible.corridor(empty_db(), self.ex, CFG, ["MOSCOW", "TEL_AVIV", "MADRID"],
                                    "2027-03-20", 0, stay_hours={"TEL_AVIV": {"min": 12, "max": 24}})
        self.assertEqual(shorter["best"]["flights"], 220)
        self.assertFalse(shorter["recommendable"])

    def test_elapsed_duration_uses_utc_across_different_local_timezones(self):
        result = flexible.corridor(empty_db(), self.ex, CFG, ["MOSCOW", "TEL_AVIV", "MADRID"], "2027-03-20", 0)
        self.assertEqual(result["best"]["duration_hours"], 61.0)

    def test_every_complete_option_reaches_madrid_before_the_deadline(self):
        late = leg("IST", "MAD", "2027-03-25 15:00", "2027-03-25 19:00", 10)
        ex = explorer(self.ist1, self.ist2, late)
        res = flexible.corridor(empty_db(), ex, CFG, ["MOSCOW", "ISTANBUL", "MADRID"], "2027-03-20", 2)
        self.assertEqual(res["option_count"], 1)
        self.assertTrue(all(o["arrive_local"] <= "2027-03-25 16:30" for o in res["options"]))

    def test_preferred_buffer_flags_same_day_arrival_as_fragile(self):
        d1 = leg("SVO", "IST", "2027-03-22 10:00", "2027-03-22 14:00", 100)
        d2 = leg("IST", "MAD", "2027-03-25 08:00", "2027-03-25 11:30", 50)
        res = flexible.corridor(empty_db(), explorer(d1, d2), CFG, ["MOSCOW", "ISTANBUL", "MADRID"], "2027-03-22", 0)
        self.assertTrue(res["best"]["fragile_return"])
        self.assertFalse(res["recommendable"])

    def test_birthday_never_used(self):
        cfg = copy.deepcopy(CFG)
        a = leg("SVO", "IST", "2027-03-14 10:00", "2027-03-14 14:00", 1)
        b = leg("IST", "MAD", "2027-03-15 10:00", "2027-03-15 13:30", 1)
        res = flexible.corridor(empty_db(), explorer(a, b, cfg=cfg), cfg, ["MOSCOW", "ISTANBUL", "MADRID"], "2027-03-14", 2)
        self.assertEqual(res["option_count"], 0)
        self.assertNotIn("2027-03-14", res["legs"][0]["dates"])


class Planner(unittest.TestCase):
    def test_research_only_city_is_blocked_as_a_next_step_and_excluded_from_trips(self):
        out = leg("MAD", "TLV", "2027-02-12 10:00", "2027-02-12 16:00", 50)
        ex = explorer(out)
        opts = ex.options([], show_all=True)
        g = next(x for x in opts["groups"] if x["city"] == "TEL_AVIV")
        self.assertFalse(g["any_ok"])
        self.assertTrue(any("research only" in w for w in g["options"][0]["why"]))
        by = defaultdict(list)
        for l in (out, leg("TLV", "PEK", "2027-02-15 10:00", "2027-02-15 23:00"), leg("PEK", "SVO", "2027-03-12 10:00", "2027-03-12 14:00"),
                  leg("SVO", "MAD", "2027-03-20 10:00", "2027-03-20 14:00")):
            by[l.origin].append(l)
        self.assertEqual(build_trips(by, CFG), [])

    def test_summary_flags_fragile_return(self):
        a = leg("MAD", "PEK", "2027-02-12 13:00", "2027-02-13 06:00")
        b = leg("PEK", "SVO", "2027-03-12 11:30", "2027-03-12 15:05")
        c = leg("SVO", "MAD", "2027-03-25 08:00", "2027-03-25 12:00")
        s = explorer(a, b, c).summary([a, b, c])
        self.assertTrue(s["fragile_return"])
        self.assertTrue(any("fragile" in f for f in s["flags"]))
        d = leg("SVO", "MAD", "2027-03-23 08:00", "2027-03-23 12:00")
        self.assertFalse(explorer(a, b, d).summary([a, b, d])["fragile_return"])


if __name__ == "__main__":
    unittest.main()
