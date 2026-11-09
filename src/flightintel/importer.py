"""Import observed quotes typed/read by hand (e.g. from Google Flights in a browser) as provider='browser'.

Text format (see data/browser_quotes_*.txt):
  @ORIGIN DEST_CITY YYYY-MM-DD            one block = one search
  [ORIG>]DEST DEP ARR +DAYS PRICE STOPS 16h25 [airlines]
"""
import json
import re
from datetime import date as Date, timedelta
from pathlib import Path

from .core import city_of, to_utc


def _minutes(text):
    """'16h25' -> 985, '4h' -> 240, '45m' -> 45."""
    m = re.fullmatch(r"(?:(\d+)h)?(?:(\d{1,2})m?)?", text)
    if not m or not (m.group(1) or m.group(2)):
        raise ValueError(f"bad duration {text!r}")
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


_BAG = {"carry": "carry_on", "carry_on": "carry_on", "checked": "checked"}
_BAG_VALUE = {"yes": "included", "no": "not_included", "fee": "fee", "unknown": "unknown"}


def _bags(text):
    out = {}
    for item in filter(None, (x.strip() for x in text.split(","))):
        k, _, v = item.partition("=")
        if k in _BAG and v in _BAG_VALUE and v != "unknown":
            out[_BAG[k]] = _BAG_VALUE[v]
    return out


def _via(text):
    out = []
    for item in filter(None, (x.strip() for x in text.split(","))):
        airport, _, dur = item.partition(":")
        out.append({"airport": airport.strip(), "minutes": _minutes(dur) if dur else None})
    return out


def parse(path):
    block, rows = None, []
    for n, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            origin, dest_city, day = line[1:].split()
            block = (origin, dest_city, day)
            continue
        if block is None:
            raise ValueError(f"line {n}: row before any @block")
        parts = line.split(None, 7)
        if len(parts) < 7:
            raise ValueError(f"line {n}: expected 7+ fields, got {line!r}")
        route, dep, arr, plus, price, stops, dur = parts[:7]
        airlines = parts[7] if len(parts) > 7 else ""
        airlines, *segments = airlines.split(" ~ ")           # optional: "~ FRA:4h25,IST:1h" and "~ bag:carry=no,checked=fee"
        via, bags = [], {}
        for seg in segments:
            if seg.startswith("bag:"):
                bags = _bags(seg[4:])
            else:
                via = _via(seg)
        o, d = route.split(">") if ">" in route else (block[0], route)
        rows.append((block, o, d, dep, arr, int(plus), float(price), int(stops), _minutes(dur), airlines.strip(), via, bags))
    return rows


def file_currency(path, default):
    """A file may declare its quote currency in a header comment: '#!currency=USD'."""
    for line in Path(path).read_text(encoding="utf-8").splitlines()[:12]:
        m = re.match(r"#!currency=([A-Z]{3})", line.strip())
        if m:
            return m.group(1)
    return default


def import_file(conn, cfg, path, observed_at, currency=None):
    ap = cfg["airports"]
    cur = currency or file_currency(path, cfg["search"]["currency"])
    rows = parse(path)
    # a re-read of the same route + departure date on the same DAY replaces the earlier read, whatever the block labels were
    day = observed_at[:10]
    combos = {(city_of(r[1], ap), city_of(r[2], ap), r[0][2]) for r in rows if r[1] in ap and r[2] in ap}
    for oc, dc, dep in combos:
        oa = [k for k, v in ap.items() if v["city"] == oc]
        da = [k for k, v in ap.items() if v["city"] == dc]
        conn.execute(
            "DELETE FROM offers WHERE id IN (SELECT o.id FROM offers o JOIN searches s ON s.id=o.search_id WHERE s.provider='browser' "
            f"AND substr(s.searched_at,1,10)=? AND substr(o.dep_local,1,10)=? AND o.origin IN ({','.join('?' * len(oa))}) AND o.destination IN ({','.join('?' * len(da))}))",
            (day, dep, *oa, *da))
    conn.execute("DELETE FROM searches WHERE provider='browser' AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.search_id=searches.id)")
    # idempotent: replace only the searches (route+date+observation time) that this file contains
    for block in {r[0] for r in rows}:
        for (sid,) in conn.execute("SELECT id FROM searches WHERE provider='browser' AND origin=? AND destination=? "
                                   "AND date=? AND searched_at=?", (*block, observed_at)).fetchall():
            conn.execute("DELETE FROM offers WHERE search_id=?", (sid,))
            conn.execute("DELETE FROM searches WHERE id=?", (sid,))
    searches, skipped, n = {}, 0, 0
    for block, o, d, dep, arr, plus, price, stops, dur, airlines, via, bags in rows:
        if o not in ap or d not in ap:
            skipped += 1
            continue
        key = block
        if key not in searches:
            searches[key] = conn.execute(
                "INSERT INTO searches(provider,origin,destination,date,searched_at,ok,n_offers) VALUES ('browser',?,?,?,?,1,0)",
                (block[0], block[1], block[2], observed_at)).lastrowid
        day = Date.fromisoformat(block[2])
        dep_local, arr_local = f"{day} {dep}", f"{day + timedelta(days=plus)} {arr}"
        conn.execute(
            "INSERT INTO offers(search_id,origin,destination,dep_local,arr_local,dep_utc,arr_utc,price,currency,"
            "duration_min,stops,airlines,flight_numbers,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (searches[key], o, d, dep_local, arr_local, to_utc(dep_local, o, ap).isoformat(),
             to_utc(arr_local, d, ap).isoformat(), price, cur, dur, stops, airlines, "",
             json.dumps({"source": "google_flights_manual_read", "observed_at": observed_at, "via": via, "bags": bags})))
        n += 1
    for key, sid in searches.items():
        conn.execute("UPDATE searches SET n_offers=(SELECT COUNT(*) FROM offers WHERE search_id=?) WHERE id=?", (sid, sid))
    conn.commit()
    return n, skipped, len(searches)
