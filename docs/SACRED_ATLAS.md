# Sacred Atlas

*Where civilizations seek meaning.* A cultural-intelligence feature of ORBIX: it explores sacred places, traditions and festivals,
then tests whether they fit the real itinerary. Route: `/more/sacred` (desktop sidebar → **Sacred Atlas**; phones → **More → Sacred Atlas**,
so the five-item bottom bar stays as it is).

## Architecture

ORBIX 2.1 adds licensed photography, progressive destination disclosure, `TemplateTools`, cultural opportunity indicators and the shared
`FlexibleDateSelector`. Coverage and return comparisons call the existing Python flexible-date endpoints; no frontend optimization engine
was introduced. See [HANDOFF.md](HANDOFF.md) for recovery status and validation limits.

```text
frontend/src/features/sacred-atlas/
  types.ts                  SacredSite, CulturalEvent, Tradition, JourneyTemplate, ExperiencePreference, SacredJourneyAlternative
  data/                     versioned editorial catalog (CATALOG_VERSION in data/journeys.ts); no prices, no personal data
    sites.ts  events.ts  traditions.ts  journeys.ts
  engine/                   pure functions, unit-tested in tests/sacred.test.ts
    calendar.ts             China window of a branch, event access (passed / final-days / within-stay / after-stay / elsewhere)
    feasibility.ts          five states, return-deadline check, "recommendable" gate
    alternatives.ts         Journey Alternatives Engine (below)
    preferences.ts          transparent coverage score and ranking formula
  SacredAtlasPage.tsx       editorial landing + Modes A–D (URL state: ?mode=, ?site=, ?tab=)
  SacredMap.tsx, mapModel.ts  MapLibre layer: clustered sites, journey line, template order, festival rings
  SiteSheet.tsx             bottom sheet (side panel ≥ md): why it matters, calendar, journey impact + "Add to Journey Alternatives"
  TraditionsMode.tsx  CalendarMode.tsx  JourneysMode.tsx  useSacred.ts  ui.tsx
```

Shared-state changes are additive and optional, so existing saved workspaces stay valid:
`Scenario.sacred?` (the `SacredJourneyAlternative` record), `Prefs.sacred?` (experience weights) and the store action
`addScenario(sc, text)`, which appends a scenario **without** switching the active one.

## Journey Alternatives Engine

1. Pick the ORBIX hub for the site (`nearbyTransportHubs`, preferring day-trip / chapter relations).
2. Permit-dependent, safety-restricted, unverified-advisory or unpriced sites → **research-only**: no flights are generated.
3. Hub already on the branch → **chapter**: no new flight node; it checks nights available in the hub against the site's duration.
4. Otherwise → **insert**: `/api/options` (server applies every itinerary rule) for prefix → hub, then hub → original next city after the site's
   duration; the replaced segment is dropped and the rest of the route is re-attached only if the stay rule still holds.
   No observed option → segment marked *Transport data unavailable — requires verification*.
5. Cost: `/api/evaluate` on the **whole** base path and the **whole** alternative path; delta = difference of totals (shared legs counted once).
   Ground transport, entrance fees, guides and permits are listed as unpriced, never estimated.
6. `recommendable` requires: feasibility *explorable*, lands in Madrid before `latest_arrival_local`, required cities present, no unavailable segment.

## Data provenance and limits

- Historical content cites UNESCO listings and scholarly works; practical claims carry a certainty tag (fact / estimate / unverified).
- The national holiday period was verified on 2026-11-11 against the State Council's 2027 notice (5–13 February); the precise source is in `data/events.ts`.
  Losar and Chötrul Düchen remain tentative and distinct from Chinese observances. No local ceremony is listed as confirmed.
- Jerusalem: FCDO advice was retrieved and dated 2026-11-11 in `data/sites.ts`. The advisory has geographic distinctions, while ORBIX's
  conservative corridor classification remains **safety restricted — research only**. Retrieval alone does not validate entry or travel advisability.
- With the fares observed on 2026-11-11, Beijing → Chengdu / Xi'an exist only on 1 March, beyond the 9-night Beijing maximum for a
  13 Feb arrival. Quotes for Beijing → Chengdu (≈20–26 Feb) and Chengdu → Shanghai are what the Mount Emei branch needs.

## Extending

Add a site to `data/sites.ts` (coordinates, hub with `city` = ORBIX city id when the hub is priced), an event to `data/events.ts`, or a
tradition to `data/traditions.ts` (all eight themes, with a diversity note and sources), then bump `CATALOG_VERSION`.

## Tests

`npm test` (unit: Scenarios A–F + catalog integrity) and `npx playwright test` (e2e against `vite preview` + an API started without users;
`e2e/sacred.spec.ts` covers the nine-step mobile flow, Lhasa, the calendar and 320/375/390/430/768 px overflow). The suite runs with one
worker because all specs share that API's single workspace.
