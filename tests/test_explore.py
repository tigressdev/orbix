import sys
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flightintel import importer  # noqa: E402
from flightintel.core import load_config, to_utc  # noqa: E402
from flightintel.explore import Explorer  # noqa: E402
from flightintel.itineraries import Leg  # noqa: E402

CFG = load_config()
CFG["constraints"].pop("arrival_windows", None)      # the fixtures arrive in Moscow in February; the real window is tested separately
AP = CFG["airports"]


def leg(o, d, dep, arr, price=1000):
    return Leg(o, d, to_utc(dep, o, AP), to_utc(arr, d, AP), price, 0, "T", "", dep, arr, "x")


def explorer(*legs):
    by = defaultdict(list)
    for l in legs:
        by[l.origin].append(l)
    return Explorer(CFG, by)


class ExplorerTests(unittest.TestCase):
    def legs(self):
        return [leg("MAD", "BUD", "2027-02-12 20:00", "2027-02-12 23:15", 200),
                leg("BUD", "PEK", "2027-02-15 08:00", "2027-02-16 05:00", 3000),
                leg("PEK", "SVO", "2027-02-24 11:00", "2027-02-24 15:00", 2500),
                leg("SVO", "IST", "2027-03-02 08:00", "2027-03-02 12:00", 900),
                leg("IST", "MAD", "2027-03-03 10:00", "2027-03-03 13:00", 800)]

    def test_root_lists_destinations_with_cumulative_cost(self):
        ex = explorer(*self.legs())
        groups = ex.options([])["groups"]
        self.assertEqual([g["city"] for g in groups], ["BUDAPEST"])
        opt = groups[0]["options"][0]
        # 200 flight + 1 night in Madrid (budget tier US$70) + 250 bag + 60 airport transfer (config estimates, scale 1.0 in this test)
        self.assertEqual(opt["cumulative"], 580)
        self.assertTrue(opt["ok"])

    def test_walk_to_a_complete_trip_accumulates_budget(self):
        ex = explorer(*self.legs())
        path = []
        for want in ["BUDAPEST", "BEIJING", "MOSCOW", "ISTANBUL", "MADRID"]:
            g = next(g for g in ex.options(path)["groups"] if g["city"] == want)
            path.append(ex.by_key[g["options"][0]["key"]])
        s = ex.summary(path)
        self.assertTrue(s["complete"])
        self.assertEqual(s["flights"], 7400)
        self.assertEqual(s["nights"]["BEIJING"], 8)
        self.assertGreater(s["slack_hours_to_return"], 0)

    def test_madrid_is_blocked_until_required_cities_visited(self):
        ex = explorer(*self.legs(), leg("BUD", "MAD", "2027-02-14 09:00", "2027-02-14 12:00", 300))
        path = [ex.by_key[ex.options([])["groups"][0]["options"][0]["key"]]]
        back = next(g for g in ex.options(path, show_all=True)["groups"] if g["city"] == "MADRID")
        self.assertFalse(back["options"][0]["ok"])
        self.assertTrue(any("Still missing" in w for w in back["options"][0]["why"]))

    def test_outbound_table_has_direct_and_stopover(self):
        legs = self.legs() + [leg("MAD", "PEK", "2027-02-12 13:00", "2027-02-13 06:00", 3500)]
        rows = explorer(*legs).outbound_table()
        self.assertEqual({r["stopover"] for r in rows}, {"No stopover", "Budapest"})


class StudioRules(unittest.TestCase):
    def legs(self):
        return [leg("MAD", "BUD", "2027-02-12 20:00", "2027-02-12 23:15", 200),
                leg("BUD", "PEK", "2027-02-15 08:00", "2027-02-16 05:00", 3000)]

    def test_breakdown_adds_up_and_includes_transfers(self):
        ex = explorer(*self.legs())
        path = [ex.by_key[k] for k in ex.by_key]
        path.sort(key=lambda l: l.dep_utc)
        s = ex.summary(path)
        self.assertEqual(s["flights"], 3200)
        self.assertEqual(s["transfers"], 120)                    # two arrivals away from Madrid, R$ 60 each
        self.assertEqual(s["total"], s["flights"] + s["hotel"] + s["bags"] + s["transfers"])

    def test_hotel_override_changes_only_that_city(self):
        base = explorer(*self.legs())
        cheap = Explorer(CFG, base.by_city and {l.origin: [l] for l in base.by_key.values()}, {"hotel_night": {"BUDAPEST": 100}})
        path = sorted(base.by_key.values(), key=lambda l: l.dep_utc)
        self.assertEqual(base.summary(path)["hotel"] - cheap.summary(path)["hotel"], 3 * (55 - 100))   # 3 nights in Budapest: tier rate 55 vs override 100

    def test_unfinished_branch_does_not_claim_a_birthday_location(self):
        ex = explorer(leg("MAD", "PEK", "2027-02-12 11:00", "2027-02-13 05:00", 3000))
        path = list(ex.by_key.values())
        self.assertEqual(ex.metrics(path)["birthday"]["status"], "unknown")

    def test_birthday_protection_can_be_switched_off(self):
        l = leg("MAD", "PEK", "2027-02-12 11:00", "2027-02-13 05:00", 3000)
        flies_on_bd = leg("PEK", "SVO", "2027-03-14 08:00", "2027-03-14 13:00", 2000)
        on, off = explorer(l, flies_on_bd), Explorer(CFG, {"MAD": [l], "PEK": [flies_on_bd]}, {"protect_birthday": False})
        first = on.by_key[next(k for k in on.by_key if k.startswith("MAD"))]
        why = lambda ex: [w for g in ex.options([first], show_all=True)["groups"] for o in g["options"] for w in o["why"]]  # noqa: E731
        self.assertTrue(any("protected birthday" in w for w in why(on)))
        self.assertFalse(any("protected birthday" in w for w in why(off)))


class LodgingRules(unittest.TestCase):
    def test_moscow_is_hosted_and_free_unless_overridden(self):
        legs = [leg("MAD", "SVO", "2027-02-12 10:00", "2027-02-12 20:00", 300), leg("SVO", "IST", "2027-02-16 10:00", "2027-02-16 14:00", 100)]
        ex = explorer(*legs)
        path = sorted(ex.by_key.values(), key=lambda l: l.dep_utc)
        self.assertEqual(ex.summary(path)["nights"]["MOSCOW"], 4)
        moscow_cost = ex.summary(path)["hotel"] - ex.summary(path[:1])["hotel"]
        self.assertEqual(moscow_cost, 0)
        paid = Explorer(CFG, {l.origin: [l] for l in legs}, {"hotel_night": {"MOSCOW": 50}})
        self.assertEqual(paid.summary(path)["hotel"] - ex.summary(path)["hotel"], 4 * 50)

    def test_lodging_tier_changes_the_estimate(self):
        legs = [leg("MAD", "PEK", "2027-02-12 11:00", "2027-02-13 05:00", 3000), leg("PEK", "SHA", "2027-02-20 09:00", "2027-02-20 11:00", 150)]
        by = {l.origin: [l] for l in legs}
        hostel = Explorer(CFG, by, {"lodging_tier": "hostel"})
        mid = Explorer(CFG, by, {"lodging_tier": "mid"})
        path = sorted(hostel.by_key.values(), key=lambda l: l.dep_utc)
        self.assertLess(hostel.summary(path)["hotel"], mid.summary(path)["hotel"])


class SharedStayRule(unittest.TestCase):
    def china_path(self):
        legs = [leg("MAD", "PEK", "2027-02-12 11:00", "2027-02-13 05:00", 3000), leg("PEK", "SHA", "2027-02-20 09:00", "2027-02-20 11:00", 150)]
        return legs, {l.origin: [l] for l in legs}

    def test_china_nights_are_split_in_two_for_private_rooms(self):
        legs, by = self.china_path()
        ex = Explorer(CFG, by, {"lodging_tier": "budget"})
        path = sorted(ex.by_key.values(), key=lambda l: l.dep_utc)
        s = ex.summary(path)
        beijing = s["nights"]["BEIJING"]
        self.assertEqual(beijing, 7)
        madrid_and_beijing_full = 70 * s["nights"]["MADRID"] + 38 * beijing                     # room prices before the split
        self.assertEqual(s["hotel_full"], madrid_and_beijing_full)
        self.assertEqual(s["hotel"], 70 * s["nights"]["MADRID"] + 19 * beijing)                   # your half in Beijing, Madrid not shared
        self.assertEqual(s["hotel_shared_nights"], beijing)
        self.assertEqual(s["hotel_saved"], 19 * beijing)

    def test_hostel_beds_are_not_split_and_overrides_are_what_you_pay(self):
        legs, by = self.china_path()
        hostel = Explorer(CFG, by, {"lodging_tier": "hostel"})
        path = sorted(hostel.by_key.values(), key=lambda l: l.dep_utc)
        self.assertEqual(hostel.summary(path)["hotel_shared_nights"], 0)
        mine = Explorer(CFG, by, {"lodging_tier": "budget", "hotel_night": {"BEIJING": 30}})
        self.assertEqual(mine.summary(path)["hotel"] - Explorer(CFG, by, {"lodging_tier": "budget", "hotel_night": {"BEIJING": 0}}).summary(path)["hotel"], 30 * 7)


class RoundTripSpur(unittest.TestCase):
    def test_can_return_to_the_base_city_after_singapore_but_not_elsewhere(self):
        a = leg("MAD", "PVG", "2027-02-12 11:00", "2027-02-13 05:00", 900)
        b = leg("PVG", "SIN", "2027-03-05 09:00", "2027-03-05 15:00", 130)
        c = leg("SIN", "PVG", "2027-03-07 06:30", "2027-03-07 11:45", 183)
        d = leg("SIN", "MAD", "2027-03-07 06:30", "2027-03-07 20:00", 500)
        ex = Explorer(CFG, {"MAD": [a], "PVG": [b], "SIN": [c, d]})
        path = [a, b]
        ok = [o for g in ex.options(path)["groups"] for o in g["options"] if o["ok"]]
        self.assertTrue(any(o["destination"] == "PVG" for o in ok))          # Shanghai again: allowed, it is the pivot
        self.assertFalse(any(o["destination"] == "MAD" for o in ok))         # Madrid still needs Beijing and Moscow first


class ImporterTests(unittest.TestCase):
    def test_parse_blocks_overrides_and_durations(self):
        txt = "# c\n@MAD BEIJING 2027-02-12\nPKX 13:20 12:45 +1 2892 1 16h25 Lufthansa, Air China\nSAW>PKX 17:20 01:15 +2 3350 1 26h55\n"
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "q.txt"
            f.write_text(txt, encoding="utf-8")
            rows = importer.parse(f)
        self.assertEqual(rows[0][1:3], ("MAD", "PKX"))
        self.assertEqual(rows[0][8], 985)
        self.assertEqual(rows[0][9], "Lufthansa, Air China")
        self.assertEqual(rows[1][1:3], ("SAW", "PKX"))


if __name__ == "__main__":
    unittest.main()


class ArrivalWindow(unittest.TestCase):
    def test_moscow_arrival_must_fall_between_12_and_16_march(self):
        cfg = {**CFG, "constraints": {**CFG["constraints"], "arrival_windows": {"MOSCOW": ["2027-03-12", "2027-03-16"]}}}
        early = leg("SZX", "SVO", "2027-03-09 07:00", "2027-03-09 15:00", 370)
        ok = leg("SZX", "SVO", "2027-03-15 07:00", "2027-03-15 15:30", 370)
        ex = Explorer(cfg, {"SZX": [early, ok]}, None)
        groups = ex.options([leg("MAD", "SZX", "2027-03-04 08:00", "2027-03-05 07:00", 800)], show_all=True)["groups"]
        opts = [o for g in groups if g["city"] == "MOSCOW" for o in g["options"]]
        self.assertEqual({o["dep_local"][:10]: o["ok"] for o in opts}, {"2027-03-09": False, "2027-03-15": True})
