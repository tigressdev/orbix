// Decision Tree: every explored alternative as an interactive, pannable graph. Nodes are real itinerary prefixes.
import { h, s, icon, clear, toast } from './ui.js';
import { money, day } from './fmt.js';
import { S, active, evalOf, nodeCity, cityMeta, pathNodes, setFocus, toggleCollapse, removeNode, togglePin, isPinned, branchToScenario, projected, undoRemove } from './store.js';
import { openExplore } from './explore.js';

const NW = 228, NH = 74, DX = 296, DY = 98;
const view = { x: 30, y: 30, k: 1, fitFor: null };

export function renderTree(el) {
  const sc = active();
  clear(el);
  const wrap = h('div', { class: 'tree-wrap' });
  el.append(wrap);

  // layout: leaves get consecutive rows, parents are centred on their visible children
  const pos = {};
  let leaf = 0;
  const walk = (id, depth) => {
    const n = sc.nodes[id];
    const kids = n.collapsed ? [] : n.children;
    kids.forEach((k) => walk(k, depth + 1));
    if (!kids.length) pos[id] = { x: depth * DX, y: leaf++ * DY };
    else { const ys = kids.map((k) => pos[k].y); pos[id] = { x: depth * DX, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; }
  };
  walk(sc.rootId, 0);

  const onPath = new Set(pathNodes(sc, sc.focusId).map((n) => n.id));
  const below = new Set();
  (function mark(id) { below.add(id); sc.nodes[id].children.forEach(mark); })(sc.focusId);

  const svg = s('svg', { role: 'group', 'aria-label': 'Decision tree of explored itineraries' });
  const g = s('g', { class: 'viewport' });
  const edges = s('g'), nodes = s('g');
  g.append(edges, nodes);
  svg.append(g);
  const apply = () => g.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);

  for (const id of Object.keys(pos)) {
    const n = sc.nodes[id], p = pos[id];
    if (n.parent && pos[n.parent]) {
      const a = pos[n.parent], x1 = a.x + NW, y1 = a.y + NH / 2, x2 = p.x, y2 = p.y + NH / 2, mx = (x1 + x2) / 2;
      const hot = onPath.has(id);
      edges.append(s('path', { class: 'tedge' + (hot ? ' path' : ''), d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}` }),
        s('text', { class: 'tedge-label', x: mx, y: (y1 + y2) / 2 - 6, 'text-anchor': 'middle' }, money(n.leg.price)));
    }
    nodes.append(nodeCard(sc, n, p, onPath, below));
  }
  const tools = h('div', { class: 'tree-tools' },
    h('button', { class: 'btn btn-sm', 'aria-label': 'Zoom in', onclick: () => zoom(1.2) }, icon('plus', 14)),
    h('button', { class: 'btn btn-sm', 'aria-label': 'Zoom out', onclick: () => zoom(1 / 1.2) }, icon('minus', 14)),
    h('button', { class: 'btn btn-sm', onclick: () => fit() }, icon('fit', 14), 'Fit'),
    S.undo ? h('button', { class: 'btn btn-sm', onclick: undoRemove }, icon('undo', 14), 'Undo removal') : null);
  wrap.append(svg, tools, h('div', { class: 'tree-hint' }, 'Drag to pan · scroll to zoom · click a node to focus its branch'));

  function zoom(f, cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2) {
    const k = Math.min(2.2, Math.max(0.3, view.k * f)), r = k / view.k;
    view.x = cx - (cx - view.x) * r; view.y = cy - (cy - view.y) * r; view.k = k; apply();
  }
  function fit() {
    const xs = Object.values(pos), W = Math.max(...xs.map((p) => p.x)) + NW + 60, H = Math.max(...xs.map((p) => p.y)) + NH + 60;
    const k = Math.min(1, wrap.clientWidth / W, wrap.clientHeight / H);
    view.k = Math.max(0.55, k); view.y = Math.max(20, (wrap.clientHeight - H * view.k) / 2);
    const f = pos[sc.focusId] || { x: 0 };                                  // keep the focused node on screen when the chain is long
    view.x = Math.min(30, wrap.clientWidth - (f.x + NW + 50) * view.k); apply();
  }
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = wrap.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { if (e.target.closest('.tnode')) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; svg.setPointerCapture(e.pointerId); svg.classList.add('drag'); });
  svg.addEventListener('pointermove', (e) => { if (!drag) return; view.x = drag.vx + e.clientX - drag.x; view.y = drag.vy + e.clientY - drag.y; apply(); });
  const end = () => { drag = null; svg.classList.remove('drag'); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  apply();
  setTimeout(() => { if (view.fitFor !== sc.id) { view.fitFor = sc.id; fit(); } }, 0);
}

function nodeCard(sc, n, p, onPath, below) {
  const root = !n.leg, city = cityMeta(nodeCity(n));
  const ev = evalOf(sc, n.id), sm = ev && ev.summary;
  const pr = sm ? projected(sm.total) : null;
  const state = sm ? (sm.complete ? 'done' : pr.over ? 'over' : 'ok') : '';
  const arrive = root ? S.meta.bookings[0].arr_local : n.leg.arr_local;
  const dim = !onPath.has(n.id) && !below.has(n.id);
  const act = (title, ic, fn) => h('button', { 'aria-label': title, title, onclick: (e) => { e.stopPropagation(); fn(); } }, icon(ic, 13));
  const acts = h('div', { class: 'tact' },
    act('Explore next destinations from here', 'plus', () => openExplore(n.id)),
    n.children.length ? act(n.collapsed ? 'Expand branch' : 'Collapse branch', 'chevron', () => toggleCollapse(sc, n.id)) : null,
    root ? null : act(isPinned(sc, n.id) ? 'Unpin from compare' : 'Pin to compare', 'compare', () => { if (!togglePin(sc, n.id)) toast('You can compare up to four branches.'); }),
    root ? null : act('Duplicate this branch as a new scenario', 'copy', () => { branchToScenario(sc, n.id); toast('Branch copied into its own scenario.'); }),
    root ? null : act('Remove this segment and everything after it', 'x', () => { removeNode(sc, n.id); toast('Segment removed.', { action: 'Undo', onAction: undoRemove }); }));
  const card = h('div', { class: ['tnode', root && 'root', onPath.has(n.id) && 'path', n.id === sc.focusId && 'focus', dim && 'dim'].filter(Boolean).join(' '),
    tabindex: 0, role: 'button', 'aria-label': `${city.name}, ${sm ? money(sm.total) + ' accumulated' : ''}. Focus this branch.`,
    onclick: () => setFocus(sc, n.id), onkeydown: (e) => { if (e.key === 'Enter') setFocus(sc, n.id); } },
    h('span', { class: `tstate ${state}` }), acts,
    h('div', { class: 'tl1' }, h('span', {}, `${day(arrive)}${root ? ' · confirmed' : ''}`), h('span', {}, n.collapsed ? `+${n.children.length} hidden` : isPinned(sc, n.id) ? 'pinned' : '')),
    h('div', { class: 'tl2' }, h('span', { class: 'tc' }, city.name), h('span', { class: 'tp num' }, sm ? money(sm.total) : '…')));
  const fo = s('foreignObject', { x: p.x, y: p.y, width: NW, height: NH + 4, style: 'overflow:visible' });
  fo.append(card);
  return fo;
}
