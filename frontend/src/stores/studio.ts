// The canonical itinerary state. ONE store: journey, atlas, budget, branches and compare all read from it (nothing keeps its own copy).
// Server data (meta, evaluation, options) lives in TanStack Query; this store holds only what the user decided.
import { create } from 'zustand';
import { api } from '@/services/api/client';
import { fetchState } from '@/services/api/queries';
import { scenarioFromLegs, addChild as addChildTo, branchToScenario, duplicateScenario as dupScenario, makeScenario, removeNode as removeNodeFrom } from '@/lib/tree';
import type { Leg, Meta, PersistedState, Prefs, Scenario } from '@/types';

export const DEFAULT_PREFS: Prefs = {
  budget: 2700, budgetCurrency: 'USD', currency: 'USD', lodging: 'budget', includePurchased: false, protectBirthday: true, ranking: 'cheapest', strict: false, theme: 'light',
};

interface Studio {
  ready: boolean; userId: string; viewing: string; viewOnly: boolean;
  prefs: Prefs; scenarios: Scenario[]; activeId: string; compare: { sid: string; nid: string }[]; history: { t: number; text: string }[]; hotel: Record<string, number>;
  undo: { sid: string; scenario: Scenario } | null;
  // actions
  hydrate(userId: string, meta: Meta, st: PersistedState | null): void;
  openWorkspace(userId: string, me: string, meta: Meta): Promise<void>;
  setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void;
  setHotel(city: string, v: number | null): void;
  addLeg(parentId: string, leg: Leg, warn?: string[]): void;
  removeNode(nid: string): void;
  undoRemove(): void;
  setFocus(nid: string): void;
  setNote(nid: string, text: string): void;
  newScenario(name?: string): void;
  duplicateScenario(id: string): void;
  branchFrom(id: string, nid: string): void;
  renameScenario(id: string, name: string): void;
  toggleSaved(id: string): void;
  deleteScenario(id: string): void;
  switchScenario(id: string): void;
  togglePin(sid: string, nid: string): boolean;
  openTrip(name: string, legs: Leg[]): void;
  reset(): void;
}

const lsKey = (uid: string) => `orbix.studio.v1:${uid}`;
const active = (s: Pick<Studio, 'scenarios' | 'activeId'>) => s.scenarios.find((x) => x.id === s.activeId) ?? s.scenarios[0]!;
const log = (s: Studio, text: string) => [...s.history, { t: Date.now(), text }].slice(-80);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
function snapshotOf(s: Studio): PersistedState { return { v: 1, prefs: s.prefs, scenarios: s.scenarios, activeId: s.activeId, compare: s.compare, history: s.history.slice(-60), hotel: s.hotel }; }
/** Writes a pending change right away (tab hidden or closing); keepalive lets the request outlive the page. */
export function flushState() {
  const s = useStudio.getState();
  if (!pending || s.viewOnly || !s.ready) return;
  pending = false;
  clearTimeout(saveTimer);
  const snap = snapshotOf(s);
  try { localStorage.setItem(lsKey(s.userId), JSON.stringify(snap)); } catch { /* storage unavailable */ }
  void fetch('/api/state', { method: 'PUT', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: snap }) }).catch(() => undefined);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushState);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushState(); });
}
function persist(get: () => Studio) {
  pending = true;
  if (get().viewOnly) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const s = get();
    if (s.viewOnly || !s.ready || !pending) return;
    pending = false;
    const snap = snapshotOf(s);
    try { localStorage.setItem(lsKey(s.userId), JSON.stringify(snap)); } catch { /* storage unavailable */ }
    try { await api.put('/api/state', { state: snap }); } catch (e) { console.warn('state save failed', e); }
  }, 500);
}

export const useStudio = create<Studio>((set, get) => {
  const mutate = (fn: (s: Studio) => Partial<Studio>) => {
    if (get().viewOnly) return;                         // someone else's plans are read-only; the server refuses the write as well
    set(fn);
    persist(get);
  };
  const mutateActive = (fn: (sc: Scenario, s: Studio) => Scenario, text?: string) => mutate((s) => {
    const sc = active(s);
    return { scenarios: s.scenarios.map((x) => (x.id === sc.id ? fn(sc, s) : x)), ...(text ? { history: log(s, text) } : {}) };
  });

  return {
    ready: false, userId: 'local', viewing: 'local', viewOnly: false,
    prefs: DEFAULT_PREFS, scenarios: [], activeId: '', compare: [], history: [], hotel: {}, undo: null,

    hydrate(userId, meta, st) {
      let saved = st;
      if (!saved || !saved.scenarios?.length) {
        try { saved = JSON.parse(localStorage.getItem(lsKey(userId)) ?? 'null') as PersistedState | null; } catch { saved = null; }
      }
      if (saved?.scenarios?.length) {
        const legacy = !saved.prefs?.budgetCurrency;      // saved before the dollar became central: the budget was in BRL
        const prefs = { ...DEFAULT_PREFS, ...saved.prefs };
        if (legacy) { prefs.budget = prefs.budget / (meta.fx.latest.BRL || 1); prefs.budgetCurrency = 'USD'; }
        const activeId = saved.scenarios.some((x) => x.id === saved.activeId) ? saved.activeId : saved.scenarios[0]!.id;
        set({ ready: true, userId, viewing: userId, viewOnly: false, prefs, scenarios: saved.scenarios, activeId, compare: saved.compare ?? [], history: saved.history ?? [], hotel: saved.hotel ?? {}, undo: null });
      } else {
        const sc = makeScenario('Exploration 1');
        set({ ready: true, userId, viewing: userId, viewOnly: false, prefs: { ...DEFAULT_PREFS, budget: Math.round(meta.default_budget) }, scenarios: [sc], activeId: sc.id, compare: [], history: [], hotel: {}, undo: null });
      }
    },

    async openWorkspace(target, me) {
      const mine = target === me;
      const res = await fetchState(mine ? undefined : target);
      const st = res.state;
      const keep = { currency: get().prefs.currency, theme: get().prefs.theme, lodging: get().prefs.lodging };
      if (st?.scenarios?.length) {
        const prefs = { ...DEFAULT_PREFS, ...st.prefs, ...(mine ? {} : keep) };
        set({ viewing: target, viewOnly: !mine, prefs, scenarios: st.scenarios, activeId: st.scenarios.some((x) => x.id === st.activeId) ? st.activeId : st.scenarios[0]!.id, compare: st.compare ?? [], history: st.history ?? [], hotel: st.hotel ?? {}, undo: null });
      } else {
        const sc = makeScenario(mine ? 'Exploration 1' : 'No plans yet');
        set({ viewing: target, viewOnly: !mine, scenarios: [sc], activeId: sc.id, compare: [], history: [], hotel: {}, undo: null });
      }
    },

    setPref(k, v) { set((s) => ({ prefs: { ...s.prefs, [k]: v } })); persist(get); },
    setHotel(city, v) { mutate((s) => { const hotel = { ...s.hotel }; if (v == null || Number.isNaN(v)) delete hotel[city]; else hotel[city] = v; return { hotel }; }); },

    addLeg(parentId, leg, warn) { mutateActive((sc) => addChildTo(sc, parentId, leg, warn), `Added ${leg.origin} → ${leg.destination} (${leg.dep_local.slice(5, 10)})`); },
    removeNode(nid) {
      const sc = active(get());
      const n = sc.nodes[nid];
      if (!n?.parent || get().viewOnly) return;
      set({ undo: { sid: sc.id, scenario: sc } });
      mutateActive((x) => removeNodeFrom(x, nid), `Removed ${n.leg?.origin} → ${n.leg?.destination} and what followed`);
    },
    undoRemove() {
      const u = get().undo;
      if (!u) return;
      mutate((s) => ({ scenarios: s.scenarios.map((x) => (x.id === u.sid ? u.scenario : x)), undo: null, history: log(s, 'Restored the removed segment') }));
    },
    setFocus(nid) { set((s) => ({ scenarios: s.scenarios.map((x) => (x.id === s.activeId ? { ...x, focusId: nid } : x)) })); persist(get); },
    setNote(nid, text) { mutateActive((sc) => ({ ...sc, nodes: { ...sc.nodes, [nid]: { ...sc.nodes[nid]!, note: text } } })); },

    newScenario(name) {
      mutate((s) => { const sc = makeScenario(name || `Exploration ${s.scenarios.length + 1}`); return { scenarios: [...s.scenarios, sc], activeId: sc.id, history: log(s, `Started “${sc.name}”`) }; });
    },
    duplicateScenario(id) {
      mutate((s) => { const src = s.scenarios.find((x) => x.id === id); if (!src) return {}; const c = dupScenario(src); return { scenarios: [...s.scenarios, c], activeId: c.id, history: log(s, `Duplicated “${src.name}”`) }; });
    },
    branchFrom(id, nid) {
      mutate((s) => { const src = s.scenarios.find((x) => x.id === id); if (!src) return {}; const c = branchToScenario(src, nid, `${src.name} · branch`); return { scenarios: [...s.scenarios, c], activeId: c.id, history: log(s, `Branched “${c.name}”`) }; });
    },
    renameScenario(id, name) { mutate((s) => ({ scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x)) })); },
    toggleSaved(id) { mutate((s) => ({ scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, saved: !x.saved } : x)) })); },
    deleteScenario(id) {
      mutate((s) => {
        if (s.scenarios.length === 1) return {};
        const scenarios = s.scenarios.filter((x) => x.id !== id);
        return { scenarios, compare: s.compare.filter((p) => p.sid !== id), activeId: s.activeId === id ? scenarios[0]!.id : s.activeId, history: log(s, 'Deleted a scenario') };
      });
    },
    switchScenario(id) { set({ activeId: id }); persist(get); },
    togglePin(sid, nid) {
      const s = get();
      const i = s.compare.findIndex((p) => p.sid === sid && p.nid === nid);
      if (i < 0 && s.compare.length >= 4) return false;
      set({ compare: i >= 0 ? s.compare.filter((_, k) => k !== i) : [...s.compare, { sid, nid }] });
      persist(get);
      return true;
    },
    openTrip(name, legs) {
      mutate((s) => { const sc = scenarioFromLegs(name, legs); return { scenarios: [...s.scenarios, sc], activeId: sc.id, history: log(s, `Opened “${name}” as a scenario`) }; });
    },
    reset() {
      mutate(() => { const sc = makeScenario('Exploration 1'); return { scenarios: [sc], activeId: sc.id, compare: [], history: [], hotel: {}, undo: null }; });
    },
  };
});

export const activeScenario = (s: Pick<Studio, 'scenarios' | 'activeId'>) => active(s);
