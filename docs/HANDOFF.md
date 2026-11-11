# ORBIX 2.1 recovery handoff

## Checkpoint and scope

Recovered `faafed9` on the existing `feature/orbix-2.1` branch. The working tree was clean at takeover. Both local and cached origin branch references existed. `git fetch origin` failed because the environment could not connect to github.com:443, so remote freshness was not verified. No reset, clean, history rewrite, main-branch change or production deployment was performed.

## Implemented

- Sacred Atlas: existing licensed media integrated into the hero, discovery cards, destination sheets and thematic journeys. Source and licence links, crop disclosure, responsive image selection, eager hero/lazy secondary images and loading/error placeholders. Historical content remains in progressive disclosure.
- Existing `experiences.ts` supplies visitor experiences and living traditions; `opportunities.ts` supplies date/location-aware card indicators and calendar recommendations.
- Cultural Windows: 13 February what-if, passed-event explanation, separated travel markers, theme contrast, explicit error handling and independent alternatives. Missing flights create a research scenario with no invented flight nodes. Changing the hypothetical date resets the save confirmation.
- One `FlexibleDateSelector`, using the real `/api/flex/coverage` contract, reused in Journey, Explore, Sacred Atlas, Price Pulse and return comparison. Exact / ±1 / ±2 (default) / ±3 / custom up to the server's seven-day limit. Quotes, freshness, missing/stale coverage, protected dates, loading/error/empty states and existing currency formatting.
- `/api/flex/corridors` comparison for Moscow via Istanbul, Belgrade, Tel Aviv, and direct Madrid. Observed airfares, estimated accommodation/baggage/transfers, unpriced items, intermediate nights, elapsed duration, connection flags, hard-deadline margin and preferred return buffer. Israel remains **Safety restricted — research only**, with Jerusalem reached by local transfer.
- Thematic route photography, schematic geographic exploration, first-leg flexible search, comparison context and independent research saves. Whole-template costs stay **unknown** until transport and constraints are validated; saving an editorial template does not manufacture a feasible itinerary.
- Financial distinctions retained. Incomplete branches are labelled as priced portions; research routes with no flights do not claim a zero total. Desktop budget truncation fixed. Bottom sheets now have a keyboard-accessible expansion button and full desktop height.
- Small backend changes only: elapsed duration computed from UTC timestamps; corridor-specific stay overrides now govern actual combinations as well as propagated windows. Regression tests cover both.

## Source verification (retrieved 2026-11-11)

- [State Council, Public holidays for 2027](https://english.www.gov.cn/policies/latestreleases/202611/06/content_WS6aed74dcc6d00ca5f9a0e22e.html), published 6 November: national Spring Festival holiday is 5–13 February. Lunar New Year, the national break, Lantern Festival, Losar and Chötrul Düchen remain separate records. Tibetan dates remain tentative; local programmes are unconfirmed.
- [UK FCDO Israel advice](https://www.gov.uk/foreign-travel-advice/israel), updated 27 October: regional restrictions and disruption/escalation risk. Do not misrepresent it as a blanket restriction on Jerusalem/Tel Aviv. ORBIX conservatively keeps the corridor research-only. Traveller-specific entry verification is still required.
- Existing Commons source pages verified for hero, Emei, Jerusalem, Kathmandu, Qingcheng, Xi'an and Chengdu. Corrected Jerusalem attribution to **Andrew Shiva / Wikipedia**. Source-page and licence URLs are in `data/media.ts`; each crop retains its source licence. Lhasa's source could not be retrieved, so its existing metadata is preserved but the photograph is withheld behind a verification placeholder. No replacement photography was sourced.

## Validation and actual limitations

- `npm run typecheck`: passed.
- `npm test`: **51 passed** (48 inherited plus coverage/error and independent research-scenario tests).
- `npm run build`: passed. Existing MapLibre bundle-size warning remains.
- `py -m pytest -q` and the established `py -m unittest discover -s tests`: **blocked before execution**. The registered Python 3.14 executable returns `Access is denied`. Claude's 58 passing backend tests are a prior report, not a result reproduced in this recovery. Two new backend tests have been authored but not executed.
- `npx playwright test --max-failures=1`: attempted against preview. **1 failed, 2 skipped, 43 not run** at that point: the Python API on port 8766 was unavailable, so the first journey could not load. Authentication tests require the separate test server and `E2E_PASS`; neither was available. This is not a passing live API/authentication run.
- `npx playwright test e2e/orbix21-ui.spec.ts`: **4 passed**, Chrome, 390×900 and 1440×900, light and dark. This suite explicitly intercepts API requests with deterministic empty-quote fixtures; it validates UI behavior, not Python integration or authentication. No personal workspace is accessed.
- Screenshots in `frontend/e2e/shots/orbix21-*`: hero, cards, SiteSheet, calendar controls/timeline, flexible dates, corridors, thematic actions, Journey/Explore/Pulse and budget sheet. Representative screenshots were opened and inspected; no page-level horizontal overflow in the tested flows. Fixed observed placeholder/contrast/sidebar-budget defects and reran UI checks.
- Remote photographs did not load during browser QA; captures exercise the graceful placeholders. Actual photographic crops and remote delivery still require inspection with external image access. The source pages were readable through web research, which does not prove image loading in the application.

## Release status

**Not production-ready / definition of done not yet certified.** Remaining gates are Python regression execution, the live API and authenticated Playwright suites, and loaded-photograph visual QA. Do not deploy on the basis of the fixture suite. No deployment was attempted.

Once Python execution is available, follow `frontend/README.md` for isolated API/preview/auth test setup. Run backend tests, frontend checks, the full Playwright suite and photographic QA again. Do not run test workspace resets against personal/production data.

The generated tracked `frontend/tsconfig.tsbuildinfo` is intentionally excluded from the implementation commit and left in the working tree. Screenshots, build output and test results are ignored local artifacts.

## Main changed files

- `frontend/src/components/shared/{FlexibleDateSelector,RouteDateSearch}.tsx`
- `frontend/src/services/api/flexible.ts`
- `frontend/src/features/compare/{ReturnCorridors,ScenariosPage}.tsx`
- `frontend/src/features/sacred-atlas/{SacredAtlasPage,SiteSheet,Photo,CalendarMode,JourneysMode,TemplateTools}.tsx`
- `frontend/src/features/sacred-atlas/data/{media,events,sites}.ts`
- Journey, Explore, Pulse, budget widgets, shared Sheet/primitives, styles, scenario types/tree metadata.
- `src/flightintel/flexible.py`, `tests/test_flexible.py`, `config/trip.json`
- `frontend/tests/{flexible.test.tsx,studio.test.ts}`, `frontend/e2e/{orbix21-ui,sacred}.spec.ts`
