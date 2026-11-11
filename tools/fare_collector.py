#!/usr/bin/env python3
"""Fare collection helper for ORBIX: the basic logic behind the Google Flights collection routine. Python standard library only.

It does NOT scrape or call Google. Prices are read by a person or an agent in a real browser (see docs/CODEX_FARE_COLLECTION.md);
this script does the deterministic parts around that step:

  queue   which route-dates still need a quote (missing or stale), highest priority first, with the Google Flights URL of each
  parse   turn Google Flights result labels (the aria-label text of each flight card) into lines of the import format
  check   validate a quote file before importing it (format, dates, prices, protected day, unknown airports, duplicates)
  status  how much of the planned grid has a fresh observed quote

  python tools/fare_collector.py queue --limit 20
  python tools/fare_collector.py queue --flex 2 --corridors --format csv
  python tools/fare_collector.py parse labels.txt --dest-city MADRID --date 2027-03-21 --keep 10 >> data/quotes/browser_quotes_2026-11-12_usd_a.txt
  python tools/fare_collector.py check data/quotes/browser_quotes_2026-11-12_usd_a.txt
  python trip.py import data/quotes/browser_quotes_2026-11-12_usd_a.txt

Rules that never bend: only prices actually read from a results page are written; a missing price is never replaced by a guess;
the quote day is the day in the FILE NAME; one block = one search (origin airports of a city grouped, destination city, date).
"""
import argparse
import csv
import json
import re
import sqlite3
import sys
import urllib.parse
from collections import defaultdict
from datetime import date as Date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flightintel import importer, planner  # noqa: E402
from flightintel.core import load_cities, load_config  # noqa: E402

DB = ROOT / "data/quotes.sqlite"
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September",
                                      "October", "November", "December"], 1)}
# Words that appear in Google's airport names -> IATA. Longest match wins. Extend it when `parse` prints a '?Name' code.
EXTRA_AIRPORTS = {
    "Madrid-Barajas": "MAD", "Adolfo": "MAD", "Ferenc Liszt": "BUD", "Beijing Capital": "PEK", "Daxing": "PKX", "Sheremetyevo": "SVO",
    "Vnukovo": "VKO", "Domodedovo": "DME", "Pudong": "PVG", "Hongqiao": "SHA", "Bao'an": "SZX", "Changi": "SIN", "Tianhe": "WUH",
    "Tianfu": "TFU", "Shuangliu": "CTU", "Xianyang": "XIY", "Dali": "DLU", "Istanbul Airport": "IST", "Sabiha": "SAW", "Havel": "PRG",
    "Zurich": "ZRH", "Vienna": "VIE", "Zagreb": "ZAG", "Krak": "KRK", "Nikola Tesla": "BEG", "Belgrade": "BEG", "Geneva": "GVA",
    "Chopin": "WAW", "Heathrow": "LHR", "Frankfurt": "FRA", "Munich": "MUC", "Brussels": "BRU", "Chongqing": "CKG", "Abu Dhabi": "AUH",
    "Zayed": "AUH", "Dubai": "DXB", "Hamad": "DOH", "Casablanca": "CMN", "Mohammed V": "CMN", "Hong Kong": "HKG", "Urumqi": "URC", "mqi": "URC",
    "Heydar": "GYD", "Suvarnabhumi": "BKK", "Incheon": "ICN", "Taoyuan": "TPE", "Amsterdam": "AMS", "Charles de Gaulle": "CDG",
    "Kuala Lumpur": "KUL", "Ben Gurion": "TLV", "Esenbo": "ESB", "Henri Coand": "OTP", "Adnan Menderes": "ADB", "Athens": "ATH",
    "Zvartnots": "EVN", "Larnaka": "LCA", "Larnaca": "LCA", "Bole": "ADD", "Cairo": "CAI", "Leonardo": "FCO", "Fiumicino": "FCO",
    "Malpensa": "MXP", "Josep Tarradellas": "BCN", "El Prat": "BCN", "Bahrain": "BAH", "Xining": "XNN", "Sofia": "SOF", "Tbilisi": "TBS",
}


# --------------------------------------------------------------------------------------------------------------------------------
# queue: what to quote next
# --------------------------------------------------------------------------------------------------------------------------------
def city_names():
    return {k: v["name"] for k, v in load_cities().items()}


def gf_url(names, o_city, d_city, day):
    q = urllib.parse.quote(f"Flights from {names.get(o_city, o_city.title())} to {names.get(d_city, d_city.title())} on {day} one way")
    return f"https://www.google.com/travel/flights?q={q}&curr=USD&hl=en&gl=br"


def covered(conn, cfg, max_age_days):
    """{(origin_city, dest_city, date): newest searched_at} for quotes still fresh enough to be used by the engine."""
    ap = cfg["airports"]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).isoformat()
    out = {}
    for r in conn.execute("SELECT o.origin, o.destination, substr(o.dep_local,1,10), MAX(s.searched_at) FROM offers o "
                          "JOIN searches s ON s.id=o.search_id WHERE s.ok=1 GROUP BY 1,2,3"):
        o, d, day, t = tuple(r)
        if o in ap and d in ap:
            k = (ap[o]["city"], ap[d]["city"], day)
            out[k] = max(out.get(k, ""), t)
    return {k: t for k, t in out.items() if t >= cutoff}, out


def build_queue(cfg, conn, flex=2, corridors=False, limit=None, min_priority=1, include_stale=True):
    """Every planned (origin city, destination city, date) lacking a fresh quote, ordered by priority, then date.

    Sources: the stages of config/trip.json (the planner grid) and, with --corridors, the flexible windows of the configured
    return corridors (date +-flex around the preferred departure, propagated through stays and the Madrid deadline).
    """
    ap, names = cfg["airports"], city_names()
    fresh, any_time = covered(conn, cfg, cfg["search"]["max_offer_age_days"])
    protected = set(cfg["constraints"].get("no_travel_dates", []))
    research = cfg["constraints"].get("research_only_cities") or {}
    rows = {}

    def add(o_codes, d_codes, day, prio, src):
        o_city, d_city = ap[o_codes.split(",")[0]]["city"], ap[d_codes.split(",")[0]]["city"]
        if day in protected or o_city == d_city:
            return
        k = (o_city, d_city, day)
        status = "fresh" if k in fresh else ("stale" if k in any_time else "missing")
        if status == "fresh" or (status == "stale" and not include_stale) or prio < min_priority:
            return
        r = rows.get(k)
        if r is None or prio > r["priority"]:
            rows[k] = {"priority": prio, "origin_city": o_city, "dest_city": d_city, "date": day, "status": status, "source": src,
                       "origin_airports": o_codes, "dest_airports": d_codes, "research_only": bool(research.get(o_city) or research.get(d_city)),
                       "last_quoted": any_time.get(k, "")[:10], "url": gf_url(names, o_city, d_city, day)}

    for j in planner.expand(cfg):
        add(j.origin, j.destination, j.date, j.priority, j.stage)
    if corridors:
        from flightintel import flexible
        from flightintel.explore import Explorer
        from flightintel.itineraries import load_legs, merge_legs, manual_legs
        legs = merge_legs(load_legs(conn, cfg, ("serpapi", "browser", "manual"), keep=40, currency="USD"), manual_legs(cfg))
        ex = Explorer(cfg, legs)
        pref = cfg["constraints"].get("flex_preferred_dates") or {"MOSCOW": "2027-03-20"}
        for ch in flexible.default_return_corridors(cfg):
            res = flexible.corridor(conn, ex, cfg, ch["chain"], pref.get(ch["chain"][0], "2027-03-20"), flex)
            for job in flexible.jobs(cfg, res, priority=4, stage="flex"):
                add(job.origin, job.destination, job.date, job.priority, "flex:" + ">".join(ch["chain"]))
    out = sorted(rows.values(), key=lambda r: (-r["priority"], r["date"], r["origin_city"], r["dest_city"]))
    return out[:limit] if limit else out


def cmd_queue(a, cfg):
    conn = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    q = build_queue(cfg, conn, a.flex, a.corridors, a.limit, a.min_priority, not a.missing_only)
    if a.route:
        want = {x.upper() for x in a.route}
        q = [r for r in q if r["origin_city"] in want or r["dest_city"] in want]
    if a.format == "json":
        print(json.dumps(q, indent=2, ensure_ascii=False))
    elif a.format == "csv":
        w = csv.DictWriter(sys.stdout, fieldnames=list(q[0].keys()) if q else ["empty"]); w.writeheader(); w.writerows(q)
    else:
        for r in q:
            flag = " [RESEARCH ONLY]" if r["research_only"] else ""
            print(f"p{r['priority']} {r['date']} {r['origin_city']}>{r['dest_city']:<12} {r['status']:<7}{flag}\n     {r['url']}")
        print(f"\n{len(q)} route-dates to quote. After reading a page: parse -> check -> python trip.py import <file>")


def cmd_status(a, cfg):
    conn = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    ap = cfg["airports"]
    fresh, any_time = covered(conn, cfg, cfg["search"]["max_offer_age_days"])
    by = defaultdict(lambda: [0, 0, 0])
    for j in planner.expand(cfg):
        k = (ap[j.origin.split(",")[0]]["city"], ap[j.destination.split(",")[0]]["city"], j.date)
        r = by[(k[0], k[1])]; r[0] += 1; r[1] += k in fresh; r[2] += k in any_time and k not in fresh
    tot, ok = sum(v[0] for v in by.values()), sum(v[1] for v in by.values())
    print(f"grid {tot} route-dates, fresh {ok} ({ok * 100 // max(tot, 1)}%), stale {sum(v[2] for v in by.values())}")
    for (o, d), (n, f, s) in sorted(by.items(), key=lambda kv: kv[1][1] / kv[1][0]):
        print(f"  {o:>10}>{d:<10} {f:>3}/{n:<3}{'  stale ' + str(s) if s else ''}")


# --------------------------------------------------------------------------------------------------------------------------------
# parse: Google Flights card label -> import line
# --------------------------------------------------------------------------------------------------------------------------------
def airport_code(name, table):
    for key in sorted(table, key=len, reverse=True):
        if key in name:
            return table[key]
    return "?" + re.sub(r"[^A-Za-z]+", "_", name)[:12]


def airport_table(cfg):
    t = dict(EXTRA_AIRPORTS)
    for code, a in cfg["airports"].items():
        t.setdefault(a.get("name", code), code)
    return t


def to24(text):
    m = re.search(r"(\d+):(\d+)\s*([AP]M)", text.replace("\u202f", " "))
    return f"{(int(m.group(1)) % 12) + (12 if m.group(3) == 'PM' else 0):02d}:{m.group(2)}"


def dur(minutes):
    h, m = divmod(minutes, 60)
    return f"{h}h{m:02d}" if h and m else (f"{h}h" if h else f"{m}m")


SKIP = re.compile(r"Business|First class|Premium|AccesRail", re.I)
CARD = re.compile(r"Leaves (.+?) at (\d+:\d+\s*[AP]M) on \w+, (\w+) (\d+) and arrives at (.+?) at (\d+:\d+\s*[AP]M) on \w+, (\w+) (\d+)\.")


def parse_label(label, year, table):
    """One result label -> (price, line) or None. Currency must be US dollars (use curr=USD in the URL)."""
    label = label.replace("\u202f", " ").replace("\xa0", " ")
    if SKIP.search(label):
        return None
    p, t = re.match(r"\s*From ([\d,]+) US dollars", label), CARD.search(label)
    if not p or not t:
        return None
    price = int(p.group(1).replace(",", ""))
    dm, am = MONTHS[t.group(3)], MONTHS[t.group(7)]
    days = (Date(year + (1 if am < dm else 0), am, int(t.group(8))) - Date(year, dm, int(t.group(4)))).days
    nonstop = re.search(r"Nonstop", label)
    stops = 0 if nonstop else int((re.search(r"(\d+) stops? flight", label) or [0, 0])[1])
    d = re.search(r"Total duration (?:(\d+) hr)?\s*(?:(\d+) min)?", label)
    total = int(d.group(1) or 0) * 60 + int(d.group(2) or 0)
    airlines = (re.search(r"flight with ([^.]+)\.", label) or [0, ""])[1]
    airlines = re.sub(r",?\s+and\s+", ", ", airlines).strip()
    via = []
    for m in re.finditer(r"is an? (?:(\d+) hr)?\s*(?:(\d+) min)?\s*(?:overnight )?layover at (.+?) in ", label):
        via.append(f"{airport_code(m.group(3), table)}:{dur(int(m.group(1) or 0) * 60 + int(m.group(2) or 0))}")
    carry = "no" if "does not include overhead bin access" in label else "yes"
    o, dest = airport_code(t.group(1), table), airport_code(t.group(5), table)
    tail = airlines + (" ~ " + ",".join(via) if via else "") + f" ~ bag:carry={carry}"
    return price, o, f"{o}>{dest} {to24(t.group(2))} {to24(t.group(6))} +{days} {price} {max(stops, len(via))} {dur(total)} {tail}"


def cmd_parse(a, cfg):
    table = airport_table(cfg)
    text = sys.stdin.read() if a.file == "-" else Path(a.file).read_text(encoding="utf-8")
    labels = [l.strip() for l in re.split(r"\n(?=\s*From [\d,]+ US dollars)|\n{2,}", text) if l.strip()] or [text]
    year = int(a.date[:4])
    rows, skipped = [], 0
    for lab in dict.fromkeys(labels):
        r = parse_label(" ".join(lab.split()), year, table)
        if r:
            rows.append(r)
        else:
            skipped += 1
    rows.sort(key=lambda r: r[0])
    kept = rows[: a.keep] if a.keep else rows
    if not kept:
        sys.exit("no flight label recognised: check that the page was loaded with curr=USD and that you passed the aria-label texts")
    first = kept[0][1]
    print(f"@{first} {a.dest_city.upper()} {a.date}")
    for _, _, line in kept:
        print(line)
    note = f" (cheapest {len(kept)} of {len(rows)} kept)" if len(kept) < len(rows) else ""
    print(f"# {len(kept)} flights{note}, {skipped} skipped")


# --------------------------------------------------------------------------------------------------------------------------------
# check: validate a quote file before it reaches the database
# --------------------------------------------------------------------------------------------------------------------------------
def cmd_check(a, cfg):
    path = Path(a.file)
    problems, warnings = [], []
    name = re.search(r"browser_quotes_(\d{4}-\d{2}-\d{2})", path.name)
    if not name:
        problems.append("file name must be browser_quotes_YYYY-MM-DD_<name>.txt (the day in the name is the quote day)")
    text = path.read_text(encoding="utf-8")
    if not re.search(r"^#!currency=USD\s*$", text, re.M):
        problems.append("first line must be '#!currency=USD' (prices are read in dollars with curr=USD)")
    try:
        rows = importer.parse(path)
    except Exception as e:  # noqa: BLE001
        sys.exit(f"{path}: the importer cannot read this file: {e}")
    ap = cfg["airports"]
    protected = set(cfg["constraints"].get("no_travel_dates", []))
    seen, blocks = set(), 0
    for line in text.splitlines():
        if line.startswith("@"):
            blocks += 1
            key = tuple(line[1:].split())
            if key in seen:
                problems.append(f"duplicate block {line}")
            seen.add(key)
    # row-level rules, straight from the text (independent of importer internals)
    block = None
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@"):
            block = line[1:].split()
            continue
        parts = line.split(None, 7)
        route = parts[0]
        o, _, d = route.partition(">")
        if "?" in line:
            problems.append(f"line {n}: unknown airport/layover code ({line[:70]}): add it to EXTRA_AIRPORTS and re-run parse")
        for code in (o, d):
            if code and code not in ap and not code.startswith("?"):
                warnings.append(f"line {n}: {code} is not in config/airports.json (the importer skips it)")
        try:
            price = float(parts[4])
            if price <= 0:
                problems.append(f"line {n}: price must be > 0")
            if price > 5000:
                warnings.append(f"line {n}: price ${price:.0f} looks like an outlier (kept as read)")
        except Exception:  # noqa: BLE001
            problems.append(f"line {n}: bad price")
        if block and parts[1] and block[2] in protected:
            problems.append(f"line {n}: block date {block[2]} is a protected day (no flights)")
        if block and len(parts) > 3:
            days = int(parts[3].lstrip("+") or 0)
            if days > 2:
                warnings.append(f"line {n}: arrival is {days} days after departure")
    n_flights = sum(1 for l in text.splitlines() if re.match(r"^[A-Z?]{3,}>[A-Z?]{3,} \d\d:\d\d ", l.strip()))
    print(f"{path.name}: {blocks} blocks, {n_flights} flights")
    for w in warnings[:20]:
        print("  warning:", w)
    for p in problems:
        print("  PROBLEM:", p)
    if problems:
        sys.exit(1)
    print("OK. Import with:  python trip.py import", path.as_posix())


def main():
    cfg = load_config()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("queue", help="route-dates still without a fresh quote, with Google Flights URLs")
    q.add_argument("--db", default=str(DB))
    q.add_argument("--flex", type=int, default=2, help="+- days around preferred dates for return corridors (default 2)")
    q.add_argument("--corridors", action="store_true", help="also add the flexible windows of the configured return corridors")
    q.add_argument("--limit", type=int)
    q.add_argument("--min-priority", type=int, default=1)
    q.add_argument("--missing-only", action="store_true", help="skip stale quotes (only dates never quoted)")
    q.add_argument("--route", nargs="*", help="only routes touching these city ids, e.g. MOSCOW TEL_AVIV")
    q.add_argument("--format", choices=["text", "json", "csv"], default="text")
    q.set_defaults(fn=cmd_queue)
    s = sub.add_parser("status", help="coverage of the planned grid"); s.add_argument("--db", default=str(DB)); s.set_defaults(fn=cmd_status)
    pa = sub.add_parser("parse", help="Google Flights card labels (one per paragraph) -> import block")
    pa.add_argument("file", help="text file with the labels, or - for stdin")
    pa.add_argument("--dest-city", required=True, help="destination city id as in config/cities.json, e.g. MADRID")
    pa.add_argument("--date", required=True, help="departure date of the search, YYYY-MM-DD")
    pa.add_argument("--keep", type=int, default=10, help="keep the N cheapest flights (the engine uses the cheapest per route/date); 0 = all")
    pa.set_defaults(fn=cmd_parse)
    c = sub.add_parser("check", help="validate a quote file before importing"); c.add_argument("file"); c.set_defaults(fn=cmd_check)
    a = p.parse_args()
    a.fn(a, cfg)


if __name__ == "__main__":
    main()
