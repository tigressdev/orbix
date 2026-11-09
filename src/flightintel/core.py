"""Config loading, time handling and SQLite storage. Standard library only."""
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UTC = timezone.utc

SCHEMA = """
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY, provider TEXT NOT NULL, origin TEXT NOT NULL,
  destination TEXT NOT NULL, date TEXT NOT NULL, searched_at TEXT NOT NULL,
  ok INTEGER NOT NULL, n_offers INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY, search_id INTEGER NOT NULL REFERENCES searches(id),
  origin TEXT NOT NULL, destination TEXT NOT NULL,
  dep_local TEXT NOT NULL, arr_local TEXT NOT NULL,
  dep_utc TEXT NOT NULL, arr_utc TEXT NOT NULL,
  price REAL NOT NULL, currency TEXT NOT NULL, duration_min INTEGER, stops INTEGER,
  airlines TEXT, flight_numbers TEXT, raw_json TEXT);
CREATE TABLE IF NOT EXISTS best_history (run_at TEXT NOT NULL, signature TEXT NOT NULL, cost REAL NOT NULL);
CREATE TABLE IF NOT EXISTS fx_rates (day TEXT NOT NULL, currency TEXT NOT NULL, per_usd REAL NOT NULL, rate_date TEXT, source TEXT, PRIMARY KEY(day, currency));
CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_search_job ON searches(origin, destination, date, searched_at);
CREATE INDEX IF NOT EXISTS ix_offer_search ON offers(search_id);
"""


def load_config(path=None):
    cfg = json.loads(Path(path or ROOT / "config/trip.json").read_text(encoding="utf-8"))
    cfg["airports"] = json.loads((ROOT / "config/airports.json").read_text(encoding="utf-8"))
    cfg["airports"].pop("_note", None)
    return cfg


def load_cities():
    d = json.loads((ROOT / "config/cities.json").read_text(encoding="utf-8"))
    d.pop("_note", None)
    return d


def hosted():
    """True on Vercel (VERCEL is set automatically) or when FI_HOSTED=1: read-only database, no local writes."""
    return bool(os.getenv("VERCEL") or os.getenv("FI_HOSTED"))


def connect(db_path, readonly=False):
    db_path = Path(db_path)
    if readonly:
        conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def now_utc():
    return datetime.now(UTC)


def parse_local(text):
    """'2027-02-12 07:15' or '2027-02-12T07:15' -> naive datetime."""
    return datetime.fromisoformat(text.strip().replace(" ", "T"))


def to_utc(local_text, airport, airports):
    off = airports[airport]["utc_offset"]
    return (parse_local(local_text) - timedelta(hours=off)).replace(tzinfo=UTC)


def to_local(dt_utc, airport, airports):
    return dt_utc + timedelta(hours=airports[airport]["utc_offset"])


def city_of(airport, airports):
    return airports[airport]["city"]
