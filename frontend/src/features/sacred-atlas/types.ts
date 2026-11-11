// Sacred Atlas data model. The catalog is editorial, versioned and independent of any personal trip data:
// nothing here knows who travels or what they booked. Prices are never stored in the catalog.

export type TraditionId = 'judaism' | 'christianity' | 'islam' | 'buddhism' | 'chinese-buddhism' | 'tibetan-buddhism' | 'daoism' | 'hinduism' | 'newar-buddhism';

/** Explorable: can be researched and added as a planning possibility. Requires verification: important information missing.
 *  Permit dependent: special authorization required. Safety restricted: current advice requires serious reconsideration.
 *  Unavailable: reliable evidence that a required condition cannot be met. */
export type Feasibility = 'explorable' | 'requires_verification' | 'permit_dependent' | 'safety_restricted' | 'unavailable';

/** Kind of statement, so the UI never presents an estimate or an open question as a fact. */
export type Certainty = 'fact' | 'estimate' | 'historical' | 'unverified';

export interface Source { label: string; url?: string; kind: 'unesco' | 'scholarly' | 'reference' | 'official' | 'traveler-brief' }

export interface TransportHub {
  /** ORBIX city id when the hub is part of the flight engine (e.g. CHENGDU); null for hubs ORBIX does not price. */
  city: string | null;
  name: string;
  /** How the site relates to the hub: a day trip / chapter from an ORBIX city, or a hub that must be reached by its own leg. */
  relation: 'day-trip' | 'chapter' | 'gateway';
  mode: 'rail' | 'road' | 'air' | 'mixed';
  note: string;
  certainty: Certainty;
}

export interface Place { name: string; originalName?: string; lat: number; lon: number; note?: string }

export interface SacredSite {
  id: string;
  name: string;
  originalName?: string;
  romanization?: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  traditions: TraditionId[];
  themes: string[];
  historicalPeriod: string;
  significance: string;            // one line for the map card
  places: Place[];
  nearbyTransportHubs: TransportHub[];
  suggestedDuration: { minDays: number; maxDays: number } | null;
  visitRequirements: { text: string; certainty: Certainty }[];
  accessibilityStatus: Feasibility;
  /** Why the status is what it is (shown next to the badge). */
  statusReasons: string[];
  /** Curated, editable 0-3 descriptors used ONLY for transparent preference matching; never a measure of spiritual worth. */
  descriptors: { history: number; landscape: number; practice: number; festival: number };
  why: {
    origins: string; traditions: string; ideas: string; architecture: string; practice: string; significance: string; practical: string;
    reading: Source[];
  };
  questions: string[];
  altitudeM?: number;
  advisory?: { required: boolean; links: Source[]; lastVerified: string | null; summary: string | null };
  sources: Source[];
}

export interface CulturalEvent {
  id: string;
  name: string;
  localName?: string;
  romanization?: string;
  englishName: string;
  dateStart: string;            // ISO date, Gregorian
  dateEnd: string;
  calendarSystem: string;
  traditions: TraditionId[] | string[];
  locations: string[];          // ORBIX city ids or site ids where it is especially relevant
  significance: string;
  officialHolidayStatus: 'public-holiday-period' | 'not-a-public-holiday' | 'regional' | 'unknown';
  /** National date = the calendar date itself. Local programmes (temple fairs, ceremonies, lantern shows) are never confirmed here. */
  verifiedEventStatus: 'calendar-date' | 'tentative-date' | 'local-schedule-unverified';
  expectedTravelImpact: { level: 'very-high' | 'high' | 'moderate' | 'low' | 'unknown'; notes: string[] };
  sources: Source[];
  lastVerified: string;
  /** Two observances on one date are separate records; this points at the sibling so the UI can say they are distinct. */
  distinctFrom?: string[];
}

export interface ThemeAnswer { summary: string; diversity: string }
export interface Tradition {
  id: TraditionId;
  name: string;
  family: string;               // descriptive grouping, not a claim of shared origin
  originNote: string;
  branches: string[];
  themes: Record<ComparativeTheme, ThemeAnswer>;
  sources: Source[];
}
export type ComparativeTheme = 'condition' | 'suffering' | 'goal' | 'sacred' | 'ethics' | 'ritual' | 'time' | 'nature';

export interface JourneyTemplate {
  id: string;
  title: string;
  focus: string;
  /** ORBIX city ids or site ids, in order. Madrid at both ends. */
  stops: { id: string; kind: 'city' | 'site'; conditional?: boolean }[];
  note: string;
}

export interface ExperiencePreference {
  traditionInterest: number;     // 0-3 each
  historicalInterest: number;
  landscapeInterest: number;
  festivalInterest: number;
  practiceInterest: number;
  budgetSensitivity: number;
  timeSensitivity: number;
}

/** Saved with the scenario it created, so a branch remembers why it exists and what is still unresolved. */
export interface SacredJourneyAlternative {
  id: string;
  baseScenarioId: string;
  baseNodeId: string;
  sacredSiteIds: string[];
  proposedSegments: { from: string; to: string; status: 'observed' | 'kept' | 'unavailable' | 'ground-unverified'; legKey?: string; note?: string }[];
  estimatedCost: { deltaUsd: number | null; basis: string };
  estimatedDuration: { extraDays: number; basis: string };
  feasibility: Feasibility;
  unresolvedRequirements: string[];
  sourceProvenance: string[];
  catalogVersion: string;
  createdAt: number;
}
