// Single source of truth for the studio. Every view reads from S and renders on emit().
// A "scenario" is an independent decision tree; a "branch" is the path from its root to any node.
// Costs are NEVER summed on the client: each node's totals come from /api/evaluate for exactly its own path,
// so shared prefixes are never double-counted and sibling branches never mix.
import { api } from './api.js';
import { debounce } from './ui.js';
import { setCurrency, setFx, rateFor } from './fmt.js';

export const S = {
  meta: null,
  session: null,            // { user: {id,name,owner}, users: [...] } once signed in
  viewOnly: false,          // true while looking at someone else's plans: nothing can be changed or saved
  viewing: null,            // id of the workspace on screen
  prefs: { budget: 2700, budgetCurrency: 'USD', currency: 'USD', lodging: 'budget', includePurchased: false, protectBirthday: true, ranking: 'cheapest', strict: false, theme: 'light' },
  scenarios: [], activeId: null, compare: [], history: [], hotel: {},
  eval: {},          // `${sid}:${nid}` -> { stale, summary, metrics }   (not persisted)
  next: {},          // `${sid}:${nid}` -> /api/options result            (not persisted)
  ui: { view: 'journey', drawer: null, hover: null },
  undo: null,
};

const lsKey = () => `flight-intelligence.studio.v1:${(S.session && S.session.user.id) || 'local'}`;   // one browser can hold two people's drafts
const listeners = new Set();
let scheduled = false, structural = false;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
// emit(): data changed, redraw views. emitLight(): only transient UI (hover) changed, redraw the map only.
export function emit(light = false) {
  structural = structural || !light;
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { scheduled = false; const full = structural; structural = false; listeners.forEach((f) => f(full)); }, 0);
}
export const emitLight = () => emit(true);

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

// Someone else's plans are read-only: the UI hides the controls, and the server refuses the write anyway.
export function blocked() {
  if (!S.viewOnly) return false;
  window.dispatchEvent(new CustomEvent('fi-viewonly'));
  return true;
}

// ---- lookups --------------------------------------------------------------------------------
export const cityOfAirport = (code) => S.meta.airports[code];
export const cityMeta = (city) => S.meta.cities[city] || { name: city, country: '', tag: '', interest: 3, lat: 0, lon: 0 };
export const active = () => S.scenarios.find((x) => x.id === S.activeId);
export const evalKey = (sc, nid) => `${sc.id}:${nid}`;
export const evalOf = (sc, nid) => S.eval[evalKey(sc, nid)];
export function pathNodes(sc, nid) {
  const out = [];
  for (let n = sc.nodes[nid]; n; n = n.parent ? sc.nodes[n.parent] : null) out.unshift(n);
  return out;
}
export const pathKeys = (sc, nid) => pathNodes(sc, nid).filter((n) => n.leg).map((n) => n.leg.key);
export function leaves(sc) {
  return Object.values(sc.nodes).filter((n) => !n.children.length && n.leg);
}
export function nodeCity(n) {
  return n.leg ? cityOfAirport(n.leg.destination) : S.meta.home_city;
}
export function hotelSplit(city) {       // how many people share a room in this city (China: 2 for private rooms)
  const sh = (S.meta.lodging && S.meta.lodging.shared) || {};
  return sh.countries && sh.countries.includes(cityMeta(city).country) && (sh.tiers || []).includes(S.prefs.lodging) ? (sh.split || 2) : 1;
}
export function hotelFullRate(city) {    // USD per night for the whole room, before splitting
  const lod = (S.meta.lodging && S.meta.lodging.cities) || {};
  if (S.hotel[city] == null && S.meta.lodging && S.meta.lodging.hosted && S.meta.lodging.hosted[city]) return 0;   // standing rule: hosted, no lodging cost
  return S.hotel[city] ?? (lod[city] && lod[city][S.prefs.lodging]) ?? S.meta.hotel_night[city] ?? S.meta.hotel_night.default;
}
export function hotelRate(city) {        // USD per night that YOU pay: your own override as typed, else the room price divided by the people sharing it
  return S.hotel[city] != null ? S.hotel[city] : hotelFullRate(city) / hotelSplit(city);
}
export function otherTraveller() {
  const me = S.session && S.session.user.id, others = ((S.session && S.session.users) || []).filter((u) => u.id !== me);
  return (others[0] && others[0].name) || (S.meta.lodging.shared && S.meta.lodging.shared.with) || 'the other traveller';
}

// ---- budget (derived; totals come from the server) --------------------------------------------
export const purchased = () => (S.prefs.includePurchased ? S.meta.purchased_ticket.total_usd || 0 : 0);   // USD
export function projected(cumulative) {
  const spent = cumulative + purchased();
  return { spent, remaining: S.prefs.budget - spent, over: spent > S.prefs.budget };
}

// ---- scenario / tree mutations -----------------------------------------------------------------
function makeScenario(name) {
  const root = { id: uid(), parent: null, children: [], leg: null, collapsed: false, note: '' };
  return { id: uid(), name, saved: false, createdAt: Date.now(), rootId: root.id, focusId: root.id, nodes: { [root.id]: root } };
}
export function log(text) {
  S.history.push({ t: Date.now(), text });
  if (S.history.length > 80) S.history.shift();
}
export function addChild(sc, parentId, leg, warn = []) {
  if (blocked()) return;
  const parent = sc.nodes[parentId];
  const dup = parent.children.map((id) => sc.nodes[id]).find((n) => n.leg.key === leg.key);
  if (dup) { sc.focusId = dup.id; commit(); return dup.id; }
  const node = { id: uid(), parent: parentId, children: [], leg, collapsed: false, note: '', warn };
  sc.nodes[node.id] = node;
  parent.children.push(node.id);
  parent.collapsed = false;
  sc.focusId = node.id;
  log(`Added ${leg.origin} → ${leg.destination} (${leg.dep_local.slice(5, 10)}) to “${sc.name}”`);
  commit();
  return node.id;
}
function subtree(sc, nid) {
  const ids = [nid];
  for (let i = 0; i < ids.length; i++) ids.push(...sc.nodes[ids[i]].children);
  return ids;
}
export function removeNode(sc, nid) {
  if (blocked()) return;
  const n = sc.nodes[nid];
  if (!n || !n.parent) return;
  const ids = subtree(sc, nid);
  S.undo = { sid: sc.id, parent: n.parent, index: sc.nodes[n.parent].children.indexOf(nid), nodes: ids.map((i) => sc.nodes[i]), focus: sc.focusId, pins: S.compare.filter((p) => p.sid === sc.id && ids.includes(p.nid)) };
  sc.nodes[n.parent].children = sc.nodes[n.parent].children.filter((c) => c !== nid);
  ids.forEach((i) => delete sc.nodes[i]);
  S.compare = S.compare.filter((p) => !(p.sid === sc.id && ids.includes(p.nid)));
  if (!sc.nodes[sc.focusId]) sc.focusId = n.parent;
  log(`Removed ${n.leg.origin} → ${n.leg.destination} and ${ids.length - 1} later segment(s)`);
  commit();
}
export function undoRemove() {
  if (blocked()) return;
  const u = S.undo;
  const sc = u && S.scenarios.find((x) => x.id === u.sid);
  if (!sc || !sc.nodes[u.parent]) return;
  u.nodes.forEach((n) => { sc.nodes[n.id] = n; });
  sc.nodes[u.parent].children.splice(u.index, 0, u.nodes[0].id);
  S.compare.push(...u.pins);
  sc.focusId = u.focus in sc.nodes ? u.focus : u.nodes[0].id;
  S.undo = null;
  log('Restored the removed segment');
  commit();
}
export function setFocus(sc, nid) { sc.focusId = nid; commit({ eval: false }); }
export function toggleCollapse(sc, nid) { sc.nodes[nid].collapsed = !sc.nodes[nid].collapsed; commit({ eval: false, next: false }); }
export function setNote(sc, nid, text) { if (blocked()) return; sc.nodes[nid].note = text; persist(); }

export function newScenario(name) {
  if (blocked()) return;
  const sc = makeScenario(name || `Exploration ${S.scenarios.length + 1}`);
  S.scenarios.push(sc);
  S.activeId = sc.id;
  log(`Started “${sc.name}”`);
  commit();
  return sc;
}
export function duplicateScenario(sc) {
  if (blocked()) return;
  const copy = makeScenario(`${sc.name} (copy)`);
  const map = {};
  const clone = (id, parent) => {
    const o = sc.nodes[id];
    const n = id === sc.rootId ? copy.nodes[copy.rootId] : { id: uid(), parent, children: [], leg: o.leg, collapsed: o.collapsed, note: o.note, warn: o.warn || [] };
    map[id] = n.id;
    copy.nodes[n.id] = n;
    for (const c of o.children) { const cn = clone(c, n.id); n.children.push(cn.id); }
    return n;
  };
  clone(sc.rootId, null);
  copy.focusId = map[sc.focusId] || copy.rootId;
  S.scenarios.push(copy);
  S.activeId = copy.id;
  log(`Duplicated “${sc.name}”`);
  commit();
  return copy;
}
export function branchToScenario(sc, nid) {
  if (blocked()) return;
  const nodes = pathNodes(sc, nid);
  const copy = makeScenario(`${sc.name} · ${cityMeta(nodeCity(sc.nodes[nid])).name}`);
  let parent = copy.nodes[copy.rootId];
  for (const n of nodes.filter((x) => x.leg)) {
    const c = { id: uid(), parent: parent.id, children: [], leg: n.leg, collapsed: false, note: n.note };
    copy.nodes[c.id] = c; parent.children.push(c.id); parent = c;
  }
  copy.focusId = parent.id;
  S.scenarios.push(copy);
  S.activeId = copy.id;
  log(`Branched “${copy.name}” from “${sc.name}”`);
  commit();
  return copy;
}
export function loadTrip(name, legs) {
  if (blocked()) return;
  const sc = makeScenario(name);
  let parent = sc.nodes[sc.rootId];
  for (const leg of legs) {
    const c = { id: uid(), parent: parent.id, children: [], leg, collapsed: false, note: '' };
    sc.nodes[c.id] = c; parent.children.push(c.id); parent = c;
  }
  sc.focusId = parent.id;
  S.scenarios.push(sc);
  S.activeId = sc.id;
  log(`Opened “${name}” as a scenario`);
  commit();
  return sc;
}
export function renameScenario(sc, name) { if (blocked()) return; sc.name = name.trim() || sc.name; persist(); emit(); }
export function toggleSaved(sc) { if (blocked()) return; sc.saved = !sc.saved; log(`${sc.saved ? 'Saved' : 'Unsaved'} “${sc.name}”`); commit({ eval: false, next: false }); }
export function deleteScenario(sc) {
  if (blocked()) return;
  if (S.scenarios.length === 1) return false;
  S.scenarios = S.scenarios.filter((x) => x.id !== sc.id);
  S.compare = S.compare.filter((p) => p.sid !== sc.id);
  if (S.activeId === sc.id) S.activeId = S.scenarios[0].id;
  log(`Deleted “${sc.name}”`);
  commit();
  return true;
}
export function resetExploration() {
  if (blocked()) return;
  const sc = makeScenario('Exploration 1');
  S.scenarios = [sc]; S.activeId = sc.id; S.compare = []; S.history = []; S.hotel = {}; S.undo = null; S.eval = {}; S.next = {};
  log('Started a fresh exploration');
  commit();
}
export function switchScenario(id) { S.activeId = id; commit(); }
export function togglePin(sc, nid) {
  const i = S.compare.findIndex((p) => p.sid === sc.id && p.nid === nid);
  if (i >= 0) S.compare.splice(i, 1);
  else if (S.compare.length >= 4) return false;
  else S.compare.push({ sid: sc.id, nid });
  commit();
  return true;
}
export const isPinned = (sc, nid) => S.compare.some((p) => p.sid === sc.id && p.nid === nid);

// ---- preferences ------------------------------------------------------------------------------
export function setPref(key, value) {
  S.prefs[key] = value;
  if (key === 'theme') applyTheme();
  if (key === 'currency') { setCurrency(value); persist(); emit(); return; }
  if (key === 'protectBirthday' || key === 'lodging') { S.next = {}; commit(); return; }
  persist(); emit();
}
export function setHotel(city, value) {
  if (blocked()) return;
  if (value === '' || value == null) delete S.hotel[city]; else S.hotel[city] = Number(value);
  S.next = {};
  commit();
}
export function applyTheme() { document.documentElement.dataset.theme = S.prefs.theme; }

// ---- server evaluation -----------------------------------------------------------------------
const params = () => ({ hotel_night: S.hotel, protect_birthday: S.prefs.protectBirthday, lodging_tier: S.prefs.lodging });
let evalSeq = 0;
export async function refreshEval() {
  const seq = ++evalSeq;
  const sc = active();
  if (!sc) return;
  const refs = [], paths = [];
  const add = (sc2, n) => { refs.push(evalKey(sc2, n.id)); paths.push(pathKeys(sc2, n.id)); };
  Object.values(sc.nodes).forEach((n) => add(sc, n));
  for (const p of S.compare) {
    if (p.sid === sc.id) continue;
    const o = S.scenarios.find((x) => x.id === p.sid);
    if (o && o.nodes[p.nid]) add(o, o.nodes[p.nid]);
  }
  try {
    const res = await api.post('/api/evaluate', { paths, params: params() });
    if (seq !== evalSeq) return;
    refs.forEach((r, i) => { S.eval[r] = res.results[i]; });
    emit();
  } catch (e) { console.warn('evaluate failed', e); }
}
export async function fetchNext(sc, nid, force = false) {
  const key = evalKey(sc, nid);
  if (!force && S.next[key]) return S.next[key];
  const res = await api.post('/api/options', { path: pathKeys(sc, nid), params: params(), show_all: true });
  S.next[key] = res;
  emit();
  return res;
}

// ---- persistence ------------------------------------------------------------------------------
function snapshot() {
  return { v: 1, prefs: S.prefs, scenarios: S.scenarios, activeId: S.activeId, compare: S.compare, history: S.history.slice(-60), hotel: S.hotel };
}
const push = debounce(async () => {
  const snap = snapshot();
  if (S.viewOnly) return;
  try { localStorage.setItem(lsKey(), JSON.stringify(snap)); } catch { /* storage unavailable */ }
  try { await api.put('/api/state', { state: snap }); } catch (e) { console.warn('state save failed', e); }
}, 500);
export const persist = () => { if (!S.viewOnly) push(); };

function restore(st) {
  Object.assign(S.prefs, st.prefs || {});
  S.scenarios = st.scenarios; S.activeId = st.activeId; S.compare = st.compare || []; S.history = st.history || []; S.hotel = st.hotel || {};
  if (!S.scenarios.find((x) => x.id === S.activeId)) S.activeId = S.scenarios[0].id;
}
export async function load(meta) {
  S.meta = meta;
  let st = null;
  try { st = (await api.get('/api/state')).state; } catch { /* server state unavailable */ }
  if (!st) { try { st = JSON.parse(localStorage.getItem(lsKey()) || 'null'); } catch { st = null; } }
  const legacyBudget = !!(st && st.scenarios && st.scenarios.length && !(st.prefs && st.prefs.budgetCurrency));   // saved before the dollar became central
  if (st && st.scenarios && st.scenarios.length) restore(st);
  else {
    const sc = makeScenario('Exploration 1');
    S.scenarios = [sc]; S.activeId = sc.id; S.prefs.budget = meta.default_budget; S.prefs.budgetCurrency = 'USD';
  }
  // budgets saved before the dollar became central were in BRL
  if (legacyBudget) { S.prefs.budget = S.prefs.budget / (meta.fx.latest.BRL || 1); S.prefs.budgetCurrency = 'USD'; }
  if (!S.prefs.currency) S.prefs.currency = 'USD';
  setFx(meta.fx); setCurrency(S.prefs.currency);
  applyTheme();
}

// One entry point for "something that changes costs or structure happened".
const doEval = debounce(() => refreshEval(), 60);
const doNext = debounce(() => { const sc = active(); if (sc) fetchNext(sc, sc.focusId, true).catch(() => {}); }, 60);
export function commit({ eval: ev = true, next = true } = {}) {
  if (ev) doEval();
  if (next) doNext();
  persist();
  emit();
}

// ---- workspaces: your own (editable) and the other person's (read-only) -------------------------------------------------------------------
export async function openWorkspace(userId) {
  const mine = !S.session || userId === S.session.user.id;
  const res = await api.get(mine ? '/api/state' : `/api/state?user=${encodeURIComponent(userId)}`);
  S.viewing = userId;
  S.viewOnly = !mine;
  S.eval = {}; S.next = {}; S.undo = null;
  const st = res.state;
  if (st && st.scenarios && st.scenarios.length) {
    const keep = { currency: S.prefs.currency, theme: S.prefs.theme, lodging: S.prefs.lodging };
    Object.assign(S.prefs, st.prefs || {});
    if (!mine) Object.assign(S.prefs, keep);               // looking, not importing: keep my own display preferences
    S.scenarios = st.scenarios; S.activeId = st.activeId; S.compare = st.compare || []; S.history = st.history || []; S.hotel = st.hotel || {};
    if (!S.scenarios.find((x) => x.id === S.activeId)) S.activeId = S.scenarios[0].id;
  } else {
    const sc = makeScenario(mine ? 'Exploration 1' : 'No plans yet');
    S.scenarios = [sc]; S.activeId = sc.id; S.compare = []; S.history = []; S.hotel = {};
  }
  document.body.classList.toggle('viewonly', S.viewOnly);
  commit();
  return res;
}
