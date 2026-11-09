import sys
import unittest
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flightintel.core import load_config, to_utc  # noqa: E402
from flightintel.explore import Explorer, leg_key  # noqa: E402
from flightintel.itineraries import Leg  # noqa: E402

CFG = load_config()
AP = CFG["airports"]


def leg(o, d, dep, arr, price, airlines="TestAir"):
    return Leg(o, d, to_utc(dep, o, AP), to_utc(arr, d, AP), price, 0, airlines, "", dep, arr, "x")


def explorer(*legs):
    by = defaultdict(list)
    for l in legs:
        by[l.origin].append(l)
    return Explorer(CFG, by)


class StableKeys(unittest.TestCase):
    def test_key_does_not_change_when_the_price_changes(self):
        a = leg("MAD", "BUD", "2027-02-12 20:00", "2027-02-12 23:15", 198)
        b = leg("MAD", "BUD", "2027-02-12 20:00", "2027-02-12 23:15", 250)      # tomorrow's quote of the same flight
        self.assertEqual(leg_key(a), leg_key(b))

    def test_two_flights_at_the_same_time_stay_distinct(self):
        a = leg("MAD", "BUD", "2027-02-12 20:00", "2027-02-12 23:15", 198, "Wizz Air")
        b = leg("MAD", "BUD", "2027-02-12 20:00", "2027-02-12 23:20", 210, "Ryanair")
        self.assertNotEqual(leg_key(a), leg_key(b))

    def test_plans_saved_with_the_legacy_price_key_still_resolve_to_the_current_price(self):
        now = leg("MAD", "BUD", "2027-02-12 20:00", "2027-02-12 23:15", 36)
        ex = explorer(now)
        (found,) = ex.resolve(["MAD>BUD@2027-02-12 20:00#198"])               # key written when the quote was R$ 198
        self.assertEqual(found.price, 36)
        with self.assertRaises(KeyError):
            ex.resolve(["MAD>BUD@2027-02-12 09:00#198"])                       # that flight is gone: the plan reports it, nothing is guessed


if __name__ == "__main__":
    unittest.main()
