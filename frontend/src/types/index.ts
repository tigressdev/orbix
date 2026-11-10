// Shapes of the existing Python API (src/flightintel/webapp.py). The backend stays authoritative: nothing here recomputes costs.
export type Currency = 'USD' | 'BRL' | 'RUB';
export type LodgingTier = 'hostel' | 'budget' | 'mid';

export interface SessionUser { id: string; name: string; owner?: boolean }
export interface Session { auth: boolean; user: SessionUser; users: SessionUser[] }

export interface CityMeta {
  name: string; country: string; tag: string; interest: number; lat: number; lon: number;
  priority?: boolean; region?: string; birthday?: string; code?: string;
}
export interface FxTable { latest_day: string | null; latest: Record<string, number>; days: Record<string, Record<string, number>> }
export interface Booking { id: string; kind: 'confirmed'; flight: string; origin: string; destination: string; dep_local: string; arr_local: string; airline: string }
export interface Meta {
  trip: string; home: string; home_city: string; cities: Record<string, CityMeta>; bookings: Booking[];
  purchased_ticket: { total_usd?: number; total_brl?: number; description?: string };
  fx: FxTable; required: string[]; protected_dates: string[]; default_budget: number;
  hotel_night: Record<string, number>;
  lodging: { cities: Record<string, Partial<Record<LodgingTier, number>>>; hosted?: Record<string, string>; default_tier?: LodgingTier; shared?: { countries: string[]; split: number; tiers: string[]; with: string } };
  airports: Record<string, string>; airport_names: Record<string, string>;
  airlines: Record<string, string>; hosted: boolean; state_backend: string; auth_required: boolean; is_owner: boolean;
  data: { p: string; offers: number }[]; latest_arrival_local: string; birthday: Record<string, unknown>; stay_rules_hours: Record<string, { min: number; max: number }>;
}

export interface Via { airport: string; minutes: number }
export interface Leg {
  key: string; origin: string; destination: string; dep_local: string; arr_local: string; price: number; stops: number; airlines: string;
  flights?: string; observed_at: string; source: string; native_price: number; native_currency: string | null; fx_day: string; duration_min: number;
  baggage: { carry_on: string; checked: string }; via: Via[];
}
export interface FlightOption extends Leg {
  ok: boolean; why: string[]; gap_hours: number; nights_before: number; hotel_before: number; transfer: number; increment: number; cumulative: number; onward: number; airport_change: boolean;
}
export interface DestinationGroup {
  city: string; name: string; country: string; tag: string; interest: number; ok_count: number; blocked_count: number; min_price: number; min_cumulative: number;
  best_key: string; min_duration_min: number; min_stops: number; date_from: string; date_to: string; stay_days: [number, number]; any_ok: boolean; options: FlightOption[];
}
export interface Summary {
  flights: number; hotel: number; hotel_full: number; hotel_shared_nights: number; hotel_saved: number; bags: number; transfers: number; risk: number; total: number; adjusted: number;
  nights: Record<string, number>; visited: string[]; complete: boolean; missing_required: string[]; legs: number; city: string; here: string; arrive_local?: string; flags: string[];
}
export interface Metrics { destinations: string[]; stops_total: number; birthday: { status: string; city: string | null; note: string }; [k: string]: unknown }
export interface OptionsResult { summary: Summary; groups: DestinationGroup[] }
export type EvalResult = { stale: true } | { stale?: false; summary: Summary; metrics: Metrics };

export interface TreeNode { id: string; parent: string | null; children: string[]; leg: Leg | null; collapsed: boolean; note: string; warn?: string[] }
export interface Scenario { id: string; name: string; saved: boolean; createdAt: number; rootId: string; focusId: string; nodes: Record<string, TreeNode> }
export interface Prefs {
  budget: number; budgetCurrency: Currency; currency: Currency; lodging: LodgingTier; includePurchased: boolean; protectBirthday: boolean;
  ranking: 'cheapest' | 'fastest' | 'best' | 'interesting' | 'lowest_total'; strict: boolean; theme: 'light' | 'dark';
}
export interface PersistedState { v: 1; prefs: Prefs; scenarios: Scenario[]; activeId: string; compare: { sid: string; nid: string }[]; history: { t: number; text: string }[]; hotel: Record<string, number> }
export interface StateResponse { state: PersistedState | null; backend: string; user: string; read_only: boolean }

export type TrendStatus = 'baseline' | 'down' | 'up' | 'flat';
export interface TrendRoute {
  code: string; from: string; to: string; from_city: string; to_city: string; latest_day: string; age_days: number; stale: boolean; cheapest_usd: number; cheapest_dep: string;
  cheapest_airlines: string; cheapest_stops: number; nonstop_usd: number | null; priority: boolean;
  history: { day: string; min_usd: number; dates: number }[]; trend: { status: TrendStatus; pct: number | null; from_day?: string; to_day?: string };
}
export interface Trends { routes: TrendRoute[]; days: string[]; snapshots: number; summary: { routes: number; offers: number; snapshot_days: number; first_day?: string; last_day?: string; falling: number; rising: number; stable: number; baseline: number; stale: number; max_age_days: number } }
