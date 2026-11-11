import sqlite3
import sys
import unittest
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src"), str(ROOT / "tools")]

import fare_collector as fc  # noqa: E402
from flightintel import discovery, scheduler  # noqa: E402
from flightintel.core import SCHEMA, load_config, to_utc  # noqa: E402
from flightintel.explore import Explorer  # noqa: E402
from flightintel.itineraries import Leg  # noqa: E402

CFG = load_config()                    # the REAL rules: Moscow arrival window 12-16 Mar, Beijing before Moscow, 14 Mar protected
AP = CFG["airports"]
_DBS = []


def leg(o, d, dep, arr, price=100.0):
    return Leg(o, d, to_utc(dep, o, AP), to_utc(arr, d, AP), price, 0, "T", "", dep, arr, "2026-11-11T10:00:00+00:00")


def explorer(*legs):
    by = defaultdict(list)
    for x in legs:
        by[x.origin].append(x)
    return Explorer(CFG, by)


def db(rows=()):
    """In-memory quote database. rows: (origin, destination, dep_local, searched_at)."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    for o, d, dep, t in rows:
        cur = conn.execute("INSERT INTO searches(provider,origin,destination,date,searched_at,ok,n_offers) VALUES ('browser',?,?,?,?,1,1)",
                           (o, d, dep[:10], t))
        conn.execute("INSERT INTO offers(search_id,origin,destination,dep_local,arr_local,dep_utc,arr_utc,price,currency) "
                     "VALUES (?,?,?,?,?,?,?,100,'USD')", (cur.lastrowid, o, d, dep, dep, dep, dep))
    _DBS.append(conn)
    return conn


def tearDownModule():
    for c in _DBS:
        c.close()


MAD_PEK = leg("MAD", "PEK", "2027-02-12 13:00", "2027-02-13 06:00", 650)
PEK_PVG = leg("PEK", "PVG", "2027-02-28 09:00", "2027-02-28 11:00", 120)
PVG_ARRIVE_0306 = leg("PEK", "PVG", "2027-03-06 08:00", "2027-03-06 10:00", 130)      # a branch that reaches Shanghai on 6 Mar


def candidate(res, city):
    return next(c for c in res["candidates"] if c["city"] == city)


class FeasibleDates(unittest.TestCase):
    def test_beijing_to_moscow_follows_the_real_arrival_window(self):
        useful = discovery.feasible_dates(CFG)
        for d in ("2027-03-04", "2027-03-05", "2027-03-06", "2027-03-07", "2027-03-08"):
            self.assertNotIn(("BEIJING", "MOSCOW", d), useful, d)            # cannot reach Moscow 12-16 Mar
        for d in ("2027-03-11", "2027-03-12", "2027-03-13", "2027-03-15", "2027-03-16"):
            self.assertIn(("BEIJING", "MOSCOW", d), useful, d)
        self.assertNotIn(("BEIJING", "MOSCOW", "2027-03-14"), useful)        # protected birthday

    def test_nothing_after_the_madrid_deadline_and_no_protected_day(self):
        for (o, d, day) in discovery.feasible_dates(CFG):
            self.assertLessEqual(day, "2027-03-25")
            self.assertNotEqual(day, "2027-03-14")

    def test_russia_first_outbound_is_kept(self):
        useful = discovery.feasible_dates(CFG)
        self.assertTrue(any(k[0] == "MADRID" and k[1] == "MOSCOW" for k in useful))
        self.assertTrue(any(k[0] == "MOSCOW" and k[1] == "BEIJING" for k in useful))


class BranchDiscovery(unittest.TestCase):
    def test_moscow_dates_from_shanghai_use_actual_arrival_times(self):
        early = leg("PVG", "SVO", "2027-03-11 22:00", "2027-03-12 04:00", 380)        # overnight: leaves 11 Mar, lands 12 Mar
        late = leg("PVG", "SVO", "2027-03-15 23:00", "2027-03-17 05:00", 300)         # lands 17 Mar: outside the window
        ex = explorer(MAD_PEK, PVG_ARRIVE_0306, early, late)
        res = discovery.discover(db(), ex, CFG, [MAD_PEK, PVG_ARRIVE_0306], flex=2)
        mos = candidate(res, "MOSCOW")
        days = {d["date"]: d for d in mos["dates"]}
        self.assertEqual(days["2027-03-11"]["status"], "observed")                     # overnight flight crossing the date line is valid
        self.assertEqual(days["2027-03-15"]["status"], "observed_blocked")
        self.assertTrue(any("arrive between" in r for r in days["2027-03-15"]["reasons"]))
        self.assertNotIn("2027-03-14", days)                                          # protected
        self.assertIn("Protected day: no flights", mos["excluded"])
        self.assertEqual(mos["state"], "observed")
        self.assertTrue(mos["required"])

    def test_relevant_unquoted_destination_is_listed_without_a_price(self):
        ex = explorer(MAD_PEK)                                                        # nothing quoted out of Beijing
        res = discovery.discover(db(), ex, CFG, [MAD_PEK], flex=2)
        cd = candidate(res, "CHENGDU")
        self.assertEqual(cd["state"], "missing")
        self.assertTrue(cd["dates"])
        self.assertIsNone(cd["min_price"])
        self.assertTrue(all("min_price" not in d for d in cd["dates"]))               # never a zero or invented fare
        self.assertTrue(cd["jobs"])
        self.assertTrue(all(j["status"] == "missing" and "price" not in j for j in cd["jobs"]))
        self.assertLessEqual(len(cd["jobs"]), 5)                                      # +-2 days around the preferred date

    def test_no_valid_date_is_explained(self):
        res = discovery.discover(db(), explorer(MAD_PEK), CFG, [MAD_PEK], flex=2)
        mos = candidate(res, "MOSCOW")                                                # Beijing's 9-day maximum ends before 12 Mar
        self.assertEqual(mos["state"], "temporally_blocked")
        self.assertEqual(mos["dates"], [])
        self.assertTrue(mos["excluded"])
        self.assertEqual(mos["jobs"], [])

    def test_order_rule_blocks_moscow_before_beijing(self):
        res = discovery.discover(db(), explorer(), CFG, [], flex=2)
        mos = candidate(res, "MOSCOW")
        self.assertEqual(mos["state"], "temporally_blocked")
        self.assertTrue(any(r.startswith("Order") for r in mos["excluded"]))

    def test_research_only_is_studied_not_recommended(self):
        mad_svo = leg("MAD", "SVO", "2027-02-12 13:00", "2027-02-13 06:00")
        ex = explorer(mad_svo)
        ex.params["russia_first"] = True
        res = discovery.discover(db(), ex, CFG, [mad_svo], flex=2)
        tlv = [c for c in res["candidates"] if c["city"] == "TEL_AVIV"]
        self.assertEqual(len(tlv), 1, "Tel Aviv must be listed (planned route from Moscow), as research only")
        for c in tlv:
            self.assertEqual(c["state"], "research_only")
            self.assertTrue(all(j["research_only"] for j in c["jobs"]))


class Queue(unittest.TestCase):
    def test_missing_versus_stale(self):
        conn = db([("PVG", "SVO", "2027-03-12 10:00", "2026-10-01T10:00:00+00:00")])  # quoted long ago
        q = fc.build_queue(CFG, conn, flex=2, corridors=False)
        by = {(j["origin_city"], j["dest_city"], j["date"]): j for j in q}
        self.assertEqual(by[("SHANGHAI", "MOSCOW", "2027-03-12")]["status"], "stale")
        self.assertEqual(by[("SHANGHAI", "MOSCOW", "2027-03-13")]["status"], "missing")
        self.assertGreater(by[("SHANGHAI", "MOSCOW", "2027-03-12")]["components"]["F"], by[("SHANGHAI", "MOSCOW", "2027-03-13")]["components"]["F"])

    def test_impossible_dates_are_not_queued(self):
        q = fc.build_queue(CFG, db(), flex=2, corridors=False)
        keys = {(j["origin_city"], j["dest_city"], j["date"]) for j in q}
        self.assertNotIn(("BEIJING", "MOSCOW", "2027-03-05"), keys)
        self.assertIn(("BEIJING", "MOSCOW", "2027-03-12"), keys)
        q_all = fc.build_queue(CFG, db(), flex=2, corridors=False, only_feasible=False)
        self.assertIn(("BEIJING", "MOSCOW", "2027-03-05"), {(j["origin_city"], j["dest_city"], j["date"]) for j in q_all})

    def test_multi_leg_return_corridors_are_queued(self):
        q = fc.build_queue(CFG, db(), flex=2, corridors=True)
        flex = [j for j in q if any(s.startswith("flex:MOSCOW>ISTANBUL>MADRID") for s in j["sources"])]
        self.assertTrue({j["dest_city"] for j in flex} >= {"ISTANBUL", "MADRID"})
        self.assertTrue(all(j["date"] <= "2027-03-25" and j["date"] != "2027-03-14" for j in flex))

    def test_branch_context_raises_priority(self):
        ctx = [{"city": "SHANGHAI", "arrive": "2027-03-06 10:00", "visited": ["BEIJING"]}]
        plain = {(j["origin_city"], j["dest_city"], j["date"]): j for j in fc.build_queue(CFG, db(), corridors=False)}
        withc = {(j["origin_city"], j["dest_city"], j["date"]): j for j in fc.build_queue(CFG, db(), corridors=False, contexts=ctx)}
        k = ("SHANGHAI", "MOSCOW", "2027-03-12")
        self.assertEqual(withc[k]["components"]["V"], 1.0)
        self.assertGreater(withc[k]["score"], plain[k]["score"])
        self.assertIn("context", withc[k]["sources"])

    def test_requests_raise_priority_and_are_never_duplicated(self):
        reqs = [{"origin_city": "BEIJING", "dest_city": "CHENGDU", "date": "2027-03-01"}] * 3
        q = fc.build_queue(CFG, db(), corridors=True, requests=reqs)
        keys = [(j["origin_city"], j["dest_city"], j["date"]) for j in q]
        self.assertEqual(len(keys), len(set(keys)))                                    # one provider search per route and date
        j = next(x for x in q if (x["origin_city"], x["dest_city"], x["date"]) == ("BEIJING", "CHENGDU", "2027-03-01"))
        self.assertTrue(j["requested"])
        self.assertGreater(len(j["sources"]), 1)                                       # grid + request merged, searched once

    def test_opportunity_dates_around_observed_fares(self):
        conn = db([("PEK", "TFU", "2027-02-20 08:30", "2099-01-01T00:00:00+00:00")])   # fresh quote on 20 Feb
        q = fc.build_queue(CFG, conn, flex=2, corridors=False)
        opp = {j["date"] for j in q if j["origin_city"] == "BEIJING" and j["dest_city"] == "CHENGDU" and "opportunity" in j["sources"]}
        self.assertTrue({"2027-02-18", "2027-02-19", "2027-02-21", "2027-02-22"} & opp)
        self.assertNotIn("2027-02-20", opp)                                             # already quoted

    def test_existing_valid_itineraries_are_never_pruned(self):
        deploy = ROOT / "data/deploy/quotes.sqlite"
        if not deploy.exists():
            self.skipTest("no deploy database")
        from flightintel.core import connect
        from flightintel.itineraries import build_trips, load_legs, manual_legs, merge_legs
        conn = connect(deploy, readonly=True)
        _DBS.append(conn)
        legs = merge_legs(load_legs(conn, CFG, ("serpapi", "browser", "manual"), keep=2, currency="BRL"), manual_legs(CFG))
        useful = discovery.feasible_dates(CFG)
        planned = {(AP[j.origin.split(",")[0]]["city"], AP[j.destination.split(",")[0]]["city"], j.date) for j in fc.planner.expand(CFG)}
        for t in build_trips(legs, CFG, 1, beam=2):
            for x in t.legs:
                k = (AP[x.origin]["city"], AP[x.destination]["city"], x.dep_local[:10])
                if k in planned:
                    self.assertIn(k, useful, f"{t.signature}: {k} would be dropped from the queue")


class Scheduler(unittest.TestCase):
    def test_gaps_rank_above_improvements_and_exploration_is_reserved(self):
        gap = scheduler.job(CFG, "CHENGDU", "MOSCOW", "2027-03-12", "missing", sources=["grid"], completes=True, edge_fresh_days=0)
        opp = scheduler.job(CFG, "BUDAPEST", "BEIJING", "2027-02-12", "missing", sources=["opportunity"], completes=True,
                            edge_fresh_days=2, near_observed=True, interest=8, origin_interest=8)
        self.assertEqual(gap["kind"], "required")
        self.assertEqual(opp["kind"], "valuable")
        self.assertGreater(gap["score"], opp["score"])
        many = [scheduler.job(CFG, "BEIJING", "SHANGHAI", f"2027-02-{d:02d}", "missing", edge_fresh_days=3) for d in range(1, 29)]
        a = scheduler.rank(many, CFG, limit=10, today="2026-11-12")
        b = scheduler.rank(many, CFG, limit=10, today="2026-11-12")
        self.assertEqual(a, b)                                                          # deterministic rotation
        self.assertEqual(sum(j["exploration"] for j in a), 1)

    def test_weights_come_from_config(self):
        cfg = dict(CFG)
        cfg["search"] = dict(CFG["search"], priority_weights={"U": 1, "V": 0, "O": 0, "R": 0, "F": 0})
        j = scheduler.job(cfg, "CHENGDU", "MOSCOW", "2027-03-12", "missing", completes=True)
        self.assertEqual(j["score"], 1.0)


if __name__ == "__main__":
    unittest.main()
