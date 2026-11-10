"""Rebuild the deploy artifacts from the committed text files (the durable memory of every quote):

    python scripts/build_data.py

  data/quotes/*.txt  + data/fx.json   ->   data/deploy/quotes.sqlite   (read-only database bundled with the Vercel function)
                                           data/precomputed/insights.json   (the slow itinerary analysis, computed once)

Quote files are imported in name order; the day in the file name is the quote day, so a new file per day grows the price history.
Run it after adding quotes or changing config/, then commit the generated files.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
os.environ.pop("VERCEL", None)
os.environ.pop("FI_HOSTED", None)

from flightintel import fx, importer  # noqa: E402
from flightintel.core import connect, load_config  # noqa: E402


def main():
    cfg = load_config()
    out = ROOT / "data/deploy/quotes.sqlite"
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    conn = connect(out)
    fx_file = ROOT / "data/fx.json"
    if fx_file.exists():
        for r in json.loads(fx_file.read_text(encoding="utf-8")):
            conn.execute("INSERT OR REPLACE INTO fx_rates(day,currency,per_usd,rate_date,source) VALUES (?,?,?,?,?)",
                         (r["day"], r["currency"], r["per_usd"], r["rate_date"], r["source"]))
        conn.commit()
    total = 0
    for f in sorted((ROOT / "data/quotes").glob("browser_quotes_*.txt")):
        m = re.search(r"(\d{4}-\d{2}-\d{2})", f.name)
        if not m:
            print(f"skip {f.name}: no date in the file name")
            continue
        n, skipped, searches = importer.import_file(conn, cfg, f, f"{m.group(1)}T12:00:00+00:00")
        total += n
        print(f"{f.name}: {n} offers" + (f" ({skipped} rows skipped)" if skipped else ""))
    conn.execute("VACUUM")
    conn.close()
    print(f"-> {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB)")

    os.environ["FI_DB"] = str(out)
    from flightintel.webapp import App            # after the database exists
    app = App(False)
    app.conn = lambda: connect(out)               # the build reads the file it just wrote
    t = time.time()
    while True:
        r = app.analysis()
        if r.get("status") != "computing":
            break
        time.sleep(1)
    r["stamp"] = app._stamp()                     # lets a local server reuse this file while the quotes have not changed
    pre = ROOT / "data/precomputed"
    pre.mkdir(parents=True, exist_ok=True)
    (pre / "insights.json").write_text(json.dumps(r, ensure_ascii=False), encoding="utf-8")
    print(f"-> data/precomputed/insights.json ({r.get('status')}, {r.get('complete_count')} complete itineraries, {time.time() - t:.0f}s)")


if __name__ == "__main__":
    main()
