"""Drop alerts: notify when the best price for a route signature falls >= alert_drop_percent
versus the lowest value previously recorded. Telegram if TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID are set,
otherwise prints."""
import json
import os
import urllib.parse
import urllib.request

from .core import now_utc


def check(conn, trips, cfg, notify=True):
    pct = cfg["search"]["alert_drop_percent"]
    now, messages = now_utc().isoformat(), []
    for t in trips:
        prev = conn.execute("SELECT MIN(cost) c FROM best_history WHERE signature=?", (t.signature,)).fetchone()["c"]
        if prev and t.adjusted_brl <= prev * (1 - pct / 100):
            messages.append(f"{t.signature}: BRL {t.adjusted_brl:,.0f} (was {prev:,.0f}, "
                            f"-{(1 - t.adjusted_brl / prev) * 100:.0f}%)")
        conn.execute("INSERT INTO best_history VALUES (?,?,?)", (now, t.signature, t.adjusted_brl))
    conn.commit()
    if messages and notify:
        send("Price drop on tracked itineraries:\n" + "\n".join(messages))
    return messages


def send(text):
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not (token and chat):
        print(text)
        return
    body = urllib.parse.urlencode({"chat_id": chat, "text": text}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body)
    try:
        urllib.request.urlopen(req, timeout=20).read()
    except Exception as e:  # noqa: BLE001  never print the URL: it holds the token
        print(f"Telegram send failed: {type(e).__name__}")
