"""Daily FX rates. USD is the central currency; every offer keeps the currency it was quoted in and is converted
with the rate of the day it was observed. Rates are stored per day and currency as 'per_usd' (units of currency per 1 USD).

Sources (public, no key): BRL from Frankfurter (ECB reference rates, weekdays); RUB from the Central Bank of Russia
(cbr-xml-daily.ru). A weekend/holiday uses the nearest earlier published rate and records which day that was.
"""
import json
import urllib.request
from datetime import date as Date, timedelta

CURRENCIES = ("USD", "BRL", "RUB")
UA = {"User-Agent": "china-trip-2027/0.3"}


def _get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def fetch(day, currency):
    """-> (per_usd, rate_date, source). Raises on failure."""
    d = Date.fromisoformat(day)
    if currency == "BRL":
        j = _get(f"https://api.frankfurter.dev/v1/{day}?base=USD&symbols=BRL")
        return float(j["rates"]["BRL"]), j["date"], "Frankfurter (ECB reference rates)"
    if currency == "RUB":
        for back in range(0, 8):
            x = d - timedelta(days=back)
            try:
                j = _get(f"https://www.cbr-xml-daily.ru/archive/{x:%Y/%m/%d}/daily_json.js")
            except Exception:  # noqa: BLE001  (404 for unpublished days)
                continue
            u = j["Valute"]["USD"]
            return float(u["Value"]) / float(u.get("Nominal", 1)), str(j["Date"])[:10], "Central Bank of Russia"
        raise RuntimeError(f"no CBR rate found near {day}")
    raise ValueError(currency)


def ensure(conn, day, currencies=("BRL", "RUB")):
    """Fetch and store any missing rate for `day`. Returns the list of currencies that could not be fetched."""
    missing = []
    for c in currencies:
        have = conn.execute("SELECT 1 FROM fx_rates WHERE day=? AND currency=?", (day, c)).fetchone()
        if have:
            continue
        try:
            per_usd, rate_date, source = fetch(day, c)
            conn.execute("INSERT OR REPLACE INTO fx_rates(day,currency,per_usd,rate_date,source) VALUES (?,?,?,?,?)", (day, c, per_usd, rate_date, source))
        except Exception:  # noqa: BLE001
            missing.append(c)
    conn.commit()
    return missing


def set_manual(conn, day, currency, per_usd):
    conn.execute("INSERT OR REPLACE INTO fx_rates(day,currency,per_usd,rate_date,source) VALUES (?,?,?,?,?)", (day, currency, float(per_usd), day, "manual"))
    conn.commit()


def table(conn):
    """{day: {currency: per_usd}} for every stored day (USD is implicit 1.0)."""
    out = {}
    for r in conn.execute("SELECT day, currency, per_usd FROM fx_rates ORDER BY day"):
        out.setdefault(r["day"], {"USD": 1.0})[r["currency"]] = r["per_usd"]
    return out


def rate(tbl, currency, day):
    """per_usd for `currency` on `day`, or the nearest earlier stored day; None when unknown."""
    if currency == "USD":
        return 1.0
    days = sorted(d for d, v in tbl.items() if currency in v and d <= day) or sorted(d for d, v in tbl.items() if currency in v)
    return tbl[days[-1]][currency] if days else None


def latest(tbl):
    day = max(tbl) if tbl else None
    return day, (tbl[day] if day else {"USD": 1.0})


def observation_days(conn):
    return [r[0] for r in conn.execute("SELECT DISTINCT substr(searched_at,1,10) FROM searches WHERE ok=1 ORDER BY 1")]
