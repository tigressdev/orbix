"""Static HTML report (no JS, no external assets) + plain-text summary."""
import html
from pathlib import Path

from .itineraries import describe


def text_summary(trips, top=10):
    if not trips:
        return "No complete itineraries found yet (need more searches or looser constraints)."
    out = []
    for i, t in enumerate(trips[:top], 1):
        nights = ", ".join(f"{c} {n}" for c, n in t.nights.items()) or "-"
        out.append(f"#{i} {t.signature}   adjusted BRL {t.adjusted_brl:,.0f} "
                   f"(flights {t.flights_brl:,.0f} + hotels~{t.hotel_brl:,.0f} + bags~{t.bag_brl:,.0f} "
                   f"+ risk {t.risk_brl:,.0f})  nights: {nights}")
        out += ["    " + r for r in describe(t)]
        out += ["    ! " + f for f in t.flags]
    return "\n".join(out)


def write_html(trips, path, generated_at, synthetic=False, top=15):
    banner = ('<p class="warn">SYNTHETIC demo data - these are NOT real fares.</p>' if synthetic else "")
    rows = []
    for t in trips[:top]:
        legs = "<br>".join(html.escape(r) for r in describe(t))
        flags = "<br>".join("&#9888; " + html.escape(f) for f in t.flags)
        nights = html.escape(", ".join(f"{c} {n}" for c, n in t.nights.items()) or "-")
        rows.append(f"<tr><td>{html.escape(t.signature)}<br><small>{nights}</small></td>"
                    f"<td class=n>{t.adjusted_brl:,.0f}</td><td class=n>{t.flights_brl:,.0f}</td>"
                    f"<td><small>{legs}</small></td><td><small>{flags}</small></td></tr>")
    doc = f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Trip 2027 - best itineraries</title>
<style>body{{font:15px system-ui;margin:1rem auto;max-width:1000px;padding:0 1rem}}
table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #8884;padding:.4rem;vertical-align:top;text-align:left}}
.n{{text-align:right;white-space:nowrap}}.warn{{background:#fc03;padding:.5rem}}small{{opacity:.85}}</style>
<h1>MAD &rarr; China &rarr; Moscow &rarr; MAD</h1>{banner}
<p>Generated {html.escape(generated_at)}. Prices are <b>observed quotes</b>, not guaranteed; hotel/bag/risk are rough
estimates from config/trip.json. Every leg is a separate ticket: verify visas, baggage and connection risk
before booking on the airline's own site.</p>
<table><tr><th>Route</th><th>Adjusted BRL</th><th>Flights BRL</th><th>Legs</th><th>Risks</th></tr>
{''.join(rows) or '<tr><td colspan=5>No itineraries yet.</td></tr>'}</table>"""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(doc, encoding="utf-8")
