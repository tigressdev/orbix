"""SYNTHETIC offers for offline development and tests. NOT real fares.

Prices/times come from distance + a deterministic hash, so runs are reproducible.
Always stored under provider='fixture' and written to data/demo.sqlite by `demo`.
"""
import hashlib
import math
from datetime import timedelta

from ..core import parse_local
from .base import Offer, Provider


def _km(a, b):
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dl = math.radians(b["lon"] - a["lon"])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


class FixtureProvider(Provider):
    name = "fixture"

    def search(self, origin, destination, date):
        out = []
        for o in origin.split(","):
            for d in destination.split(","):
                out += self._one(o, d, date)
        return out

    def _one(self, origin, destination, date):
        ap = self.cfg["airports"]
        km = _km(ap[origin], ap[destination])
        out = []
        for slot, hhmm in enumerate(("07:40", "13:10")):
            h = int(hashlib.sha256(f"{origin}{destination}{date}{slot}".encode()).hexdigest()[:6], 16)
            price = round((250 + km * 0.32) * (0.8 + (h % 70) / 100), 0)
            block_min = int(km / 780 * 60 + 55 + (60 if km > 6000 else 0))
            dep = parse_local(f"{date} {hhmm}")
            arr = dep + timedelta(minutes=block_min) + timedelta(
                hours=ap[destination]["utc_offset"] - ap[origin]["utc_offset"])
            out.append(Offer(origin, destination, dep.strftime("%Y-%m-%d %H:%M"),
                             arr.strftime("%Y-%m-%d %H:%M"), price, self.cfg["search"]["currency"],
                             block_min, 0 if km < 9000 else 1, "SYNTHETIC", f"FX{h % 900 + 100}",
                             {"synthetic": True}))
        return out
