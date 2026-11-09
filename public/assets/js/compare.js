// Branch comparison: two to four branches side by side. Incomplete branches are never ranked against complete ones.
import { h, icon, clear, toast } from './ui.js';
import { money, plural, day } from './fmt.js';
import { S, active, evalOf, nodeCity, cityMeta, pathNodes, leaves, togglePin, commit, purchased, switchScenario } from './store.js';

const ROWS = [
  { label: 'Total cost', get: (e) => e.summary.total, fmt: money, better: 'min', strong: true },
  { label: 'Flights (observed)', get: (e) => e.summary.flights, fmt: money, better: 'min' },
  { label: 'Hotels (your share, estimated)', get: (e) => e.summary.hotel, fmt: money, better: 'min' },
  { label: 'Baggage + transfers (estimated)', get: (e) => e.summary.bags + e.summary.transfers, fmt: money, better: 'min' },
  { label: 'Nights away', get: (e) => e.metrics.nights_total, fmt: (v) => String(v) },
  { label: 'Total flight hours', get: (e) => e.metrics.flight_hours, fmt: (v) => `${v}h`, better: 'min' },
  { label: 'Time in short connections', get: (e) => e.metrics.connection_hours, fmt: (v) => `${v}h`, better: 'min' },
  { label: 'Separate tickets', get: (e) => e.metrics.separate_tickets, fmt: (v) => String(v), better: 'min' },
  { label: 'Missed-connection risk', get: (e) => e.metrics.short_connections, fmt: (v) => (v ? `${plural(v, 'short connection', 'short connections')}` : 'Low (no connection under 24h)'), better: 'min' },
  { label: 'Destinations', get: (e) => e.metrics.destination_count, fmt: (v, e) => `${v}: ${e.metrics.destinations.map((c) => cityMeta(c).name).join(', ') || '—'}` },
  { label: 'Time in China', get: (e) => e.metrics.nights_china, fmt: (v) => plural(v, 'night', 'nights'), better: 'max' },
  { label: 'Time in Russia', get: (e) => e.metrics.nights_russia, fmt: (v) => plural(v, 'night', 'nights'), better: 'max' },
  { label: 'Birthday (14 Mar)', get: (e) => 0, fmt: (v, e) => { const b = e.metrics.birthday; return b.status === 'stay' ? `In ${cityMeta(b.city).name}` : b.status === 'transit' ? 'In transit' : 'Not reached'; } },
  { label: 'Budget remaining', get: (e) => S.prefs.budget - e.summary.total - purchased(), fmt: (v) => (v < 0 ? `${money(-v)} over` : money(v)), better: 'max', strong: true },
];

export function renderCompare(el) {
  clear(el);
  const sc = active();
  const cols = S.compare.map((p) => {
    const s2 = S.scenarios.find((x) => x.id === p.sid), n = s2 && s2.nodes[p.nid];
    return n ? { p, sc: s2, n, ev: evalOf(s2, n.id) } : null;
  }).filter(Boolean);

  const all = [];
  S.scenarios.forEach((s2) => leaves(s2).forEach((n) => all.push({ s2, n })));
  const label = (s2, n) => `${s2.name}: ${pathNodes(s2, n.id).map((x) => cityMeta(nodeCity(x)).name).join(' › ')}`;
  el.append(h('div', { class: 'journey-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Compare'), h('h2', { class: 'serif', style: { fontSize: '38px', lineHeight: 1.05 } }, 'Branches, side by side'),
      h('p', { class: 'muted small' }, 'Pin two to four branches from the tree or the journey view.'))),
    h('div', { class: 'pins' },
      h('button', { class: 'btn btn-sm', onclick: () => { if (!togglePin(sc, sc.focusId)) toast('You can compare up to four branches.'); } }, icon('compare', 14), 'Pin the current branch'),
      all.length ? h('select', { class: 'btn btn-sm', 'aria-label': 'Add another branch', onchange: (e) => { const [sid, nid] = e.target.value.split('|'); const s2 = S.scenarios.find((x) => x.id === sid); if (s2 && !togglePin(s2, nid)) toast('You can compare up to four branches.'); e.target.value = ''; } },
        h('option', { value: '' }, 'Add a branch…'), all.map((x) => h('option', { value: `${x.s2.id}|${x.n.id}` }, label(x.s2, x.n)))) : null));
  if (cols.length < 2) { el.append(h('div', { class: 'empty' }, cols.length ? 'Pin at least one more branch to compare.' : 'Nothing pinned yet. Open the Decision tree or Journey view and choose “Pin to compare”.')); return; }
  if (cols.some((c) => !c.ev || c.ev.stale || !c.ev.summary)) { el.append(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), 'Calculating the branches…')); return; }

  const complete = cols.map((c) => c.ev.summary.complete);
  const nComplete = complete.filter(Boolean).length;
  if (nComplete < cols.length) {
    el.append(h('div', { class: 'note', style: { marginBottom: '12px' } },
      `${cols.length - nComplete} of ${cols.length} branches are incomplete: they do not yet return to Madrid after visiting every mandatory destination, so their numbers are partial. ` +
      (nComplete >= 2 ? 'Highlights compare only the complete branches.' : 'No highlights are shown until at least two complete branches are pinned.')));
  }
  const tpl = `190px repeat(${cols.length}, minmax(190px, 1fr))`;
  const table = h('div', { class: 'cmp', role: 'table' });
  table.append(h('div', { class: 'cmp-row cmp-head', style: { gridTemplateColumns: tpl } }, h('div', {}),
    cols.map((c, i) => h('div', { class: complete[i] ? '' : 'dimcol' },
      h('div', { class: 'ttl' }, pathNodes(c.sc, c.n.id).map((x) => cityMeta(nodeCity(x)).name).join(' › ')),
      h('div', { class: 'small muted' }, c.sc.name),
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center' } },
        h('span', { class: complete[i] ? 'chip chip-teal' : 'chip chip-amber' }, complete[i] ? 'Complete' : 'Incomplete'),
        h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': 'Remove from comparison', onclick: () => togglePin(c.sc, c.n.id) }, icon('x', 14)),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { switchScenario(c.sc.id); c.sc.focusId = c.n.id; commit(); } }, 'Open'))))));
  for (const r of ROWS) {
    const vals = cols.map((c) => r.get(c.ev));
    let best = null, worst = null;
    if (r.better && nComplete >= 2) {
      const pool = vals.filter((_, i) => complete[i]);
      const lo = Math.min(...pool), hi = Math.max(...pool);
      if (lo !== hi) { best = r.better === 'min' ? lo : hi; worst = r.better === 'min' ? hi : lo; }
    }
    table.append(h('div', { class: 'cmp-row', style: { gridTemplateColumns: tpl } }, h('div', { class: 'lbl' }, r.label),
      cols.map((c, i) => h('div', { class: ['num', !complete[i] && 'dimcol', complete[i] && best != null && vals[i] === best && 'best', complete[i] && worst != null && vals[i] === worst && 'worst'].filter(Boolean).join(' '),
        style: { fontWeight: r.strong ? 700 : 500, whiteSpace: 'normal' } }, r.fmt(vals[i], c.ev)))));
  }
  el.append(table, h('p', { class: 'tiny muted', style: { marginTop: '10px' } }, 'Costs are the remaining-trip budget: observed flights plus estimated hotels, baggage and transfers. Highlights mark the best and weakest values among complete branches only.'));
}
