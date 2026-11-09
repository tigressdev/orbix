"""SerpApi 'google_flights' engine (one-way, type=2). Needs SERPAPI_KEY.

SerpApi scrapes Google Flights for you; Google itself has no public flight-price API.
Each call is billed as one search - check your plan before raising max_searches_per_run.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from .base import Offer, Provider

NO_RESULTS_HINT = "hasn't returned any results"


class SerpApiProvider(Provider):
    name = "serpapi"

    def __init__(self, cfg):
        super().__init__(cfg)
        self.key = os.getenv("SERPAPI_KEY") or os.getenv("SERPAPI_API_KEY")
        if not self.key:
            raise SystemExit("Set SERPAPI_KEY in your environment (never commit it).")

    def _get(self, params):
        url = "https://serpapi.com/search.json?" + urllib.parse.urlencode({**params, "api_key": self.key})
        req = urllib.request.Request(url, headers={"User-Agent": "china-trip-2027/0.2"})
        last = None
        for attempt in range(2):
            try:
                with urllib.request.urlopen(req, timeout=45) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as e:      # do not echo the URL: it contains the key
                last = f"HTTP {e.code}"
                if e.code < 500:
                    break
            except Exception as e:  # noqa: BLE001
                last = type(e).__name__
            time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"SerpApi request failed: {last}")

    def search(self, origin, destination, date):
        s = self.cfg["search"]
        data = self._get({"engine": "google_flights", "departure_id": origin, "arrival_id": destination,
                          "outbound_date": date, "type": 2, "currency": s["currency"], "hl": "en", "gl": s.get("gl", "br"),
                          "adults": s["passengers"]})
        if "error" in data:
            if NO_RESULTS_HINT in str(data["error"]):
                return []
            raise RuntimeError(str(data["error"])[:200])
        offers = []
        for o in (data.get("best_flights") or []) + (data.get("other_flights") or []):
            segs = o.get("flights") or []
            if not segs or o.get("price") is None:
                continue
            dep, arr = segs[0].get("departure_airport") or {}, segs[-1].get("arrival_airport") or {}
            if not dep.get("time") or not arr.get("time"):
                continue
            offers.append(Offer(
                origin=dep.get("id") or origin.split(",")[0], destination=arr.get("id") or destination.split(",")[0],
                dep_local=dep["time"], arr_local=arr["time"],
                price=float(o["price"]), currency=s["currency"],
                duration_min=o.get("total_duration"), stops=max(0, len(segs) - 1),
                airlines=", ".join(sorted({x.get("airline", "") for x in segs if x.get("airline")})),
                flight_numbers=" ".join(x.get("flight_number", "") for x in segs),
                raw=o))
        return offers
