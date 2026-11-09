import sys
import unittest
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flightintel.core import load_config, to_utc  # noqa: E402
from flightintel.itineraries import Leg, build_trips, manual_legs, merge_legs  # noqa: E402

CFG = load_config()
CFG["constraints"].pop("arrival_windows", None)      # the fixtures arrive in Moscow in February; the real window is tested separately
AP = CFG["airports"]


def leg(o, d, dep, arr, price=1000):
    return Leg(o, d, to_utc(dep, o, AP), to_utc(arr, d, AP), price, 0, "TEST", "T1", dep, arr, "x")


def index(*legs):
    by = defaultdict(list)
    for l in legs:
        by[l.origin].append(l)
    return by


class TripRules(unittest.TestCase):
    def good(self):
        return [
            leg("MAD", "PEK", "2027-02-12 11:00", "2027-02-13 05:00", 5000),
            leg("PEK", "SVO", "2027-02-21 08:00", "2027-02-21 13:00", 2000),
            leg("SVO", "IST", "2027-02-25 09:00", "2027-02-25 12:00", 800),
            leg("IST", "MAD", "2027-03-01 10:00", "2027-03-01 13:00", 900),
        ]

    def test_full_trip_found_and_priced(self):
        trips = build_trips(index(*self.good()), CFG)
        self.assertEqual([t.signature for t in trips], ["MAD>PEK>SVO>IST>MAD"])
        t = trips[0]
        self.assertEqual(t.flights_brl, 8700)
        self.assertEqual(t.nights["MADRID"], 1)      # lands 22:35 on 11 Feb, leaves 12 Feb
        self.assertEqual(t.nights["MOSCOW"], 4)

    def test_madrid_buffer_enforced(self):
        legs = self.good()
        legs[0] = leg("MAD", "PEK", "2027-02-12 02:00", "2027-02-12 20:00")   # only ~3h after landing
        self.assertEqual(build_trips(index(*legs), CFG), [])

    def test_must_reach_madrid_before_deadline(self):
        legs = self.good()
        legs[3] = leg("IST", "MAD", "2027-03-25 17:00", "2027-03-25 20:00")  # < 6h before 22:30 departure
        self.assertEqual(build_trips(index(*legs), CFG), [])

    def test_beijing_required(self):
        legs = [leg("MAD", "BUD", "2027-02-12 09:00", "2027-02-12 12:00"),
                leg("BUD", "MAD", "2027-02-14 09:00", "2027-02-14 12:00")]
        self.assertEqual(build_trips(index(*legs), CFG), [])

    def test_short_self_transfer_is_flagged_and_penalised(self):
        legs = self.good() + [
            leg("MAD", "IST", "2027-02-12 09:00", "2027-02-12 14:00", 700),
            leg("IST", "PEK", "2027-02-12 18:00", "2027-02-13 08:00", 3000),   # 4h separate-ticket layover
        ]
        trips = {t.signature: t for t in build_trips(index(*legs), CFG)}
        risky = trips["MAD>IST>PEK>SVO>IST>MAD"] if "MAD>IST>PEK>SVO>IST>MAD" in trips else None
        # IST is visited twice (outbound hub + return hub) -> rejected by the no-revisit rule
        self.assertIsNone(risky)

    def test_self_transfer_penalty_applies(self):
        legs = [
            leg("MAD", "BUD", "2027-02-12 09:00", "2027-02-12 12:00", 500),
            leg("BUD", "PEK", "2027-02-12 17:00", "2027-02-13 08:00", 3000),   # 5h layover, separate tickets
            leg("PEK", "SVO", "2027-02-21 08:00", "2027-02-21 13:00", 2000),
            leg("SVO", "BEG", "2027-02-28 09:00", "2027-02-28 10:00", 600),
            leg("BEG", "MAD", "2027-03-01 10:00", "2027-03-01 13:00", 500),
        ]
        t = build_trips(index(*legs), CFG)[0]
        self.assertEqual(t.risk_brl, CFG["constraints"]["self_transfer_risk_penalty_brl"])
        self.assertTrue(any("at BUD" in f for f in t.flags))

    def test_moscow_is_required(self):
        legs = [leg("MAD", "PEK", "2027-02-12 11:00", "2027-02-13 05:00"),
                leg("PEK", "IST", "2027-02-21 08:00", "2027-02-21 14:00"),
                leg("IST", "MAD", "2027-02-26 10:00", "2027-02-26 13:00")]
        self.assertEqual(build_trips(index(*legs), CFG), [])

    def test_birthday_is_not_a_travel_day(self):
        legs = [leg("MAD", "PEK", "2027-03-03 11:00", "2027-03-04 05:00"),
                leg("PEK", "SVO", "2027-03-14 08:00", "2027-03-14 13:00"),       # departs on the birthday
                leg("PEK", "SVO", "2027-03-12 08:00", "2027-03-12 13:00", 2500),
                leg("SVO", "IST", "2027-03-16 09:00", "2027-03-16 12:00"),
                leg("IST", "MAD", "2027-03-17 10:00", "2027-03-17 13:00")]
        trips = build_trips(index(*legs), CFG)
        self.assertEqual(len(trips), 1)
        self.assertEqual(trips[0].legs[1].dep_local[:10], "2027-03-12")

    def test_manual_leg_joins_the_search(self):
        cfg = {**CFG, "manual_legs": [{"origin": "PEK", "destination": "PVG", "dep_local": "2027-02-20 09:00",
                                       "arr_local": "2027-02-20 13:30", "price": 300, "label": "train"}]}
        legs = [leg("MAD", "PEK", "2027-02-12 11:00", "2027-02-13 05:00"),
                leg("PVG", "SVO", "2027-02-27 08:00", "2027-02-27 14:00"),
                leg("SVO", "IST", "2027-03-02 09:00", "2027-03-02 12:00"),
                leg("IST", "MAD", "2027-03-03 10:00", "2027-03-03 13:00")]
        trips = build_trips(merge_legs(index(*legs), manual_legs(cfg)), cfg)
        self.assertEqual([t.signature for t in trips], ["MAD>PEK>PVG>SVO>IST>MAD"])


if __name__ == "__main__":
    unittest.main()
