import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from flightintel import trends  # noqa: E402
from flightintel.core import SCHEMA, load_config  # noqa: E402

CFG = load_config()


def db():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    return c


def snapshot(c, day, prices, origin="MAD", dest="PEK", dep="2027-02-12"):
    sid = c.execute("INSERT INTO searches(provider,origin,destination,date,searched_at,ok,n_offers) VALUES ('browser',?,?,?,?,1,?)",
                    (origin, dest, dep, f"{day}T12:00:00+00:00", len(prices))).lastrowid
    for p in prices:
        c.execute("INSERT INTO offers(search_id,origin,destination,dep_local,arr_local,dep_utc,arr_utc,price,currency,stops,airlines) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                  (sid, origin, dest, f"{dep} 10:00", f"{dep} 20:00", f"{dep}T09:00:00+00:00", f"{dep}T12:00:00+00:00", p, "USD", 1, "TestAir"))


class TrendTests(unittest.TestCase):
    def test_single_snapshot_is_a_baseline_not_a_trend(self):
        c = db()
        snapshot(c, "2026-11-09", [500, 600])
        r = trends.compute(c, CFG)["routes"][0]
        self.assertEqual(r["code"], "MAD_PEK")
        self.assertEqual(r["trend"]["status"], "baseline")
        self.assertEqual(r["cheapest_usd"], 500)

    def test_falling_and_rising_are_detected_day_over_day(self):
        c = db()
        snapshot(c, "2026-11-09", [500, 600])
        snapshot(c, "2026-11-10", [450, 700])                           # cheapest fell 10%
        snapshot(c, "2026-11-09", [300], dest="PVG")
        snapshot(c, "2026-11-10", [330], dest="PVG")                    # +10%
        snapshot(c, "2026-11-09", [200], dest="SVO")
        snapshot(c, "2026-11-10", [201], dest="SVO")                    # +0.5% -> stable
        t = {r["code"]: r["trend"] for r in trends.compute(c, CFG)["routes"]}
        self.assertEqual(t["MAD_PEK"]["status"], "down")
        self.assertAlmostEqual(t["MAD_PEK"]["pct"], -10.0)
        self.assertEqual(t["MAD_PVG"]["status"], "up")
        self.assertEqual(t["MAD_SVO"]["status"], "flat")

    def test_stale_routes_are_flagged(self):
        c = db()
        snapshot(c, "2026-11-01", [500])
        snapshot(c, "2026-11-09", [300], dest="PVG")
        routes = {r["code"]: r for r in trends.compute(c, CFG)["routes"]}
        self.assertTrue(routes["MAD_PEK"]["stale"])
        self.assertFalse(routes["MAD_PVG"]["stale"])


if __name__ == "__main__":
    unittest.main()
