// Application shell: boots the store, wires the views, and keeps map, timeline, tree and budget on one state.
import { api } from './api.js';
import { h, icon, clear, openDialog, closeDialog, toast } from './ui.js';
import { money, fromUsd, toUsd, getCurrency, getFx, rateLine } from './fmt.js';
import { S, load, subscribe, emit, active, pathNodes, nodeCity, cityMeta, evalOf, setFocus, commit, newScenario, duplicateScenario, renameScenario, toggleSaved, deleteScenario, switchScenario, setPref, projected, resetExploration, openWorkspace } from './store.js';
import { initMap, updateMap, resizeMap } from './map.js';
import { renderBudget, renderHistory } from './budget.js';
import { renderJourney } from './journey.js';
import { renderTree } from './tree.js';
import { renderCompare } from './compare.js';
import { renderInsights, stopInsights } from './insights.js';
import { openExplore, closeExplore, renderDrawer } from './explore.js';
import { quoteDialog } from './quote.js';
import { showPulse } from './pulse.js';
import { showLogin } from './login.js';

const VIEWS = [['journey', 'Journey', 'route'], ['map', 'Map', 'map'], ['tree', 'Decision tree', 'tree'], ['compare', 'Compare', 'compare'], ['pulse', 'Price pulse', 'spark'], ['insights', 'Insights', 'spark']];
const $ = (id) => document.getElementById(id);
let lastView = null;

function setView(v) {
  S.ui.view = v;
  document.body.classList.toggle('map-mode', v === 'map');
  if (v === 'map') window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(resizeMap, 560);
  emit();
}

// ---- rendering -------------------------------------------------------------------------------
function mapModel() {
  const sc = active();
  const nodes = pathNodes(sc, sc.focusId);
  const inPath = new Set(nodes.map((n) => n.id));
  const next = S.next[`${sc.id}:${sc.focusId}`];
  return {
    meta: S.meta, wide: S.ui.view === 'map', focusKey: `${sc.id}:${sc.focusId}`,
    path: nodes.map((n) => ({ city: nodeCity(n), nodeId: n.id })),
    pathLegs: nodes.filter((n) => n.leg).map((n) => n.leg),
    otherLegs: Object.values(sc.nodes).filter((n) => n.leg && !inPath.has(n.id)).map((n) => n.leg),
    candidates: next ? next.groups.filter((g) => g.any_ok).map((g) => ({ city: g.city, price: g.min_price, duration: g.min_duration_min, stops: g.min_stops })) : [],
    hover: S.ui.hover,
  };
}

function renderUsers() {
  const box = $('user-switch'), me = S.session && S.session.user;
  const multi = S.session && S.session.users && S.session.users.length > 1 && S.session.auth;
  box.hidden = !multi;
  $('btn-logout').hidden = !(S.session && S.session.auth);
  clear(box);
  if (multi) {
    S.session.users.forEach((u) => box.append(h('button', { 'aria-pressed': S.viewing === u.id, title: u.id === me.id ? 'Your plans (editable)' : `${u.name}'s plans (view only)`,
      onclick: () => switchWorkspace(u.id) }, u.id === me.id ? u.name : `${u.name} · view`)));
  }
  const banner = $('viewonly-banner');
  banner.hidden = !S.viewOnly;
  if (S.viewOnly) {
    const owner = S.session.users.find((u) => u.id === S.viewing);
    clear(banner).append(h('span', {}, `You are looking at ${owner ? owner.name : 'someone else'}’s plans. View only: nothing here can be changed or saved.`),
      h('button', { class: 'btn btn-sm', onclick: () => switchWorkspace(me.id) }, 'Back to my plans'));
  }
}

async function switchWorkspace(id) {
  if (S.viewing === id) return;
  try { await openWorkspace(id); } catch (e) { toast(`Could not open those plans: ${e.message}`); }
}

function renderCurrency() {
  const box = $('cur-toggle');
  clear(box);
  ['USD', 'BRL', 'RUB'].forEach((c) => box.append(h('button', { 'aria-pressed': S.prefs.currency === c, title: `${rateLine()} (${getFx().latest_day || ''})`, onclick: () => setPref('currency', c) }, c)));
}

function renderCards() {
  const sc = active(), ev = evalOf(sc, sc.focusId), sm = ev && ev.summary;
  const chapters = pathNodes(sc, sc.focusId).length - 1;
  $('card-budget').textContent = money(S.prefs.budget);
  $('card-journey-chip').textContent = sm && sm.complete ? 'Complete branch' : `${chapters} chapter${chapters === 1 ? '' : 's'} selected`;
  $('card-journey-chip').className = 'chip' + (sm && sm.complete ? ' chip-teal' : '');
  if (sm) {
    const pr = projected(sm.total);
    $('card-budget-chip').textContent = pr.over ? `${money(-pr.remaining)} over on this branch` : `${money(pr.remaining)} left on this branch`;
    $('card-budget-chip').className = 'chip ' + (pr.over ? 'chip-amber' : 'chip-teal');
  } else $('card-budget-chip').textContent = 'Calculating…';
}

function renderBars() {
  const sc = active();
  const bar = $('scenario-bar');
  clear(bar);
  S.scenarios.forEach((x) => bar.append(h('button', { class: 'scen-tab', 'aria-current': x.id === sc.id, onclick: () => switchScenario(x.id) }, x.saved ? h('span', { class: 'star' }, icon('star', 13)) : null, x.name)));
  bar.append(...[
    h('button', { class: 'btn btn-sm', onclick: () => askName('New scenario', `Exploration ${S.scenarios.length + 1}`, (n) => newScenario(n)) }, icon('plus', 14), 'New'),
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => askName('Rename scenario', sc.name, (n) => renameScenario(sc, n)) }, 'Rename'),
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { duplicateScenario(sc); toast('Scenario duplicated.'); } }, icon('copy', 14), 'Duplicate'),
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => toggleSaved(sc) }, icon('star', 14), sc.saved ? 'Saved' : 'Save'),
    S.scenarios.length > 1 ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { if (confirm(`Delete “${sc.name}”? This cannot be undone.`)) deleteScenario(sc); } }, 'Delete') : null].filter(Boolean));
  const tabs = $('view-tabs');
  clear(tabs);
  VIEWS.forEach(([k, label, ic]) => tabs.append(h('button', { class: 'vtab', role: 'tab', 'aria-selected': S.ui.view === k, onclick: () => setView(k) }, icon(ic, 15), label, k === 'compare' && S.compare.length ? h('span', { class: 'chip chip-teal tiny' }, String(S.compare.length)) : null)));
}

function renderView() {
  const root = $('view-root');
  if (lastView === 'insights' && S.ui.view !== 'insights') stopInsights();
  lastView = S.ui.view;
  switch (S.ui.view) {
    case 'journey': renderJourney(root); break;
    case 'tree': renderTree(root); break;
    case 'compare': renderCompare(root); break;
    case 'insights': renderInsights(root, () => setView('journey')); break;
    case 'pulse': showPulse(root); break;
    case 'map': renderMapPanel(root); break;
    default: clear(root);
  }
}

function renderMapPanel(root) {
  const sc = active(), next = S.next[`${sc.id}:${sc.focusId}`];
  clear(root);
  root.append(h('div', { class: 'map-panel' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Map view'), h('h2', { class: 'serif', style: { fontSize: '38px', lineHeight: 1.05 } }, 'Explore geographically'),
      h('p', { class: 'muted small' }, 'Dashed blue routes are observed alternatives from your current position. Hover a card to highlight its route; click a pin or a card to see the flights.')),
    next && next.groups.some((g) => g.any_ok)
      ? h('div', { class: 'cand-strip' }, next.groups.filter((g) => g.any_ok).slice(0, 12).map((g) => h('button', { class: 'cand', onclick: () => openExplore(sc.focusId, g.city),
          onmouseenter: () => { S.ui.hover = g.city; emit(true); }, onmouseleave: () => { S.ui.hover = null; emit(true); } },
          h('div', { class: 'n' }, g.name), h('div', { class: 'small muted' }, g.country), h('div', { class: 'num', style: { fontWeight: 700, marginTop: '4px' } }, `from ${money(g.min_price)}`))))
      : h('div', { class: 'empty' }, 'No observed onward flights from this point yet.'),
    h('button', { class: 'btn', style: { alignSelf: 'flex-start' }, onclick: () => openExplore(sc.focusId) }, icon('plus', 14), 'Open the full exploration panel')));
}

function render(full = true) {
  if (full) {
    renderCards(); renderBars(); renderView();
    renderBudget($('budget')); renderHistory($('history'));
    if (S.ui.drawer) renderDrawer();
    $('demo-flag').hidden = !S.meta.demo;
    renderCurrency();
    renderUsers();
    $('btn-theme').replaceChildren(icon(S.prefs.theme === 'dark' ? 'sun' : 'moon', 18));
  }
  updateMap(mapModel());
}

// ---- dialogs ---------------------------------------------------------------------------------
function askName(title, initial, cb) {
  const input = h('input', { type: 'text', value: initial, maxlength: 60, 'aria-label': 'Name' });
  openDialog(h('form', { onsubmit: (e) => { e.preventDefault(); closeDialog(); cb(input.value); } },
    h('h3', {}, title), h('label', { class: 'field', style: { margin: '14px 0' } }, 'Name', input),
    h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, h('button', { type: 'button', class: 'btn', onclick: closeDialog }, 'Cancel'), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'))));
  input.focus(); input.select();
}

function prefsDialog() {
  const sw = (label, key, hint) => h('label', { class: 'switch' }, h('span', {}, label, hint ? h('span', { class: 'tiny muted', style: { display: 'block' } }, hint) : null),
    h('input', { type: 'checkbox', checked: S.prefs[key], onchange: (e) => setPref(key, e.target.checked) }));
  openDialog(h('div', {}, h('h3', {}, 'Preferences'),
    h('div', { style: { display: 'grid', gap: '10px', margin: '12px 0' } },
      h('label', { class: 'field' }, `Remaining-trip budget (${getCurrency()})`, h('input', { type: 'number', min: 0, step: 100, value: Math.round(fromUsd(S.prefs.budget)), onchange: (e) => setPref('budget', Math.max(0, toUsd(Number(e.target.value) || 0))) })),
      h('label', { class: 'field' }, 'Default destination ranking', h('select', { onchange: (e) => setPref('ranking', e.target.value) },
        [['cheapest', 'Cheapest'], ['fastest', 'Fastest'], ['best', 'Best overall'], ['interesting', 'Most interesting stopover'], ['lowest_total', 'Lowest total itinerary cost']].map(([k, l]) => h('option', { value: k, selected: S.prefs.ranking === k }, l)))),
      sw('Strict filtering', 'strict', 'Hide options that break the rules or the budget instead of marking them.'),
      sw('Include the purchased ticket in the budget', 'includePurchased'),
      sw('Protect my birthday from travel', 'protectBirthday', `${S.meta.birthday.date || ''} — flights that depart or land that day are flagged.`)),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
      h('span', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-sm', onclick: () => { closeDialog(); quoteDialog(); } }, 'Add an observed fare'),
        h('button', { class: 'btn btn-sm', onclick: () => { if (confirm('Discard every scenario, pin and edit, and start a fresh exploration? Observed fares are kept.')) { resetExploration(); closeDialog(); toast('Fresh exploration started.'); } } }, 'Reset exploration')),
      h('button', { class: 'btn btn-primary', onclick: closeDialog }, 'Done'))));
}

// ---- boot ------------------------------------------------------------------------------------
// The call-to-action is visible before the data has loaded: queue an early click instead of losing it.
let booted = false, startQueued = false;
function startJourney() {
  $('studio').scrollIntoView({ behavior: 'smooth' });
  $('studio').focus({ preventScroll: true });
  const sc = active();
  if (!sc.nodes[sc.rootId].children.length) setTimeout(() => openExplore(sc.rootId), 450);
}
$('btn-start').addEventListener('click', () => { if (booted) startJourney(); else startQueued = true; });

async function boot() {
  let meta;
  try { S.session = await api.get('/api/session'); }
  catch (e) {
    if (e.status === 401) { showLogin(); return; }                       // not signed in: show the login screen
    document.body.prepend(h('pre', { style: { color: 'var(--red)', padding: '20px' } }, `The studio server is not responding: ${e.message}`));
    return;
  }
  try { meta = await api.get('/api/meta'); } catch (e) {
    if (e.status === 401) { showLogin('Your session expired. Please sign in again.'); return; }
    document.body.prepend(h('pre', { style: { color: 'var(--red)', padding: '20px' } }, `The studio server is not responding: ${e.message}`));
    return;
  }
  S.viewing = S.session.user.id;
  await load(meta);
  initMap({
    onCandidate: (city) => openExplore(active().focusId, city),
    onPathCity: (nodeId) => setFocus(active(), nodeId),
  });
  subscribe(render);
  $('btn-logout').addEventListener('click', async () => { try { await api.post('/api/logout', {}); } catch { /* already signed out */ } location.reload(); });
  window.addEventListener('fi-viewonly', () => toast('View only: these are not your plans, so nothing was changed.'));
  $('btn-theme').addEventListener('click', () => setPref('theme', S.prefs.theme === 'dark' ? 'light' : 'dark'));
  $('btn-prefs').addEventListener('click', prefsDialog);
  $('drawer-scrim').addEventListener('click', closeExplore);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui.drawer) closeExplore(); });
  render(true);
  commit();   // evaluates every node and loads the next options for the focused one
  booted = true;
  if (startQueued) startJourney();
}
boot();
