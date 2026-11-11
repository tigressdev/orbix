# ORBIX fare collection — 2026-11-11

Partial collection. Target 40–60 distinct searches was not achieved.

## Actual collection
15 distinct route/date navigations attempted, including the final Beijing–Shanghai February 24 navigation interrupted by a browser control error. Nine completed with an explicit results-returned message. Six remained unconfirmed. Repeated searches are counted once. No CAPTCHA was observed. The final browser error was a CDP Target.setAutoAttach timeout. Earlier incomplete pages remained loading.

18 selected observed offers (two per completed search), in three corridor families. Selection follows displayed top flights, so listed minima are minima of the retained sample and do not certify the cheapest offer on the entire page. Baggage data was unavailable. Labels were transcribed into the existing format and checked with fare_collector check; the parse CLI was not used. Exact per-search wall-clock timestamps were not retained. The importer uses its conventional observation timestamp of 2026-11-11T12:00:00Z; this is not an actual collection time.

## Constraints
Updated required destinations and sequence to Beijing, Shanghai, Moscow. Minimum stays now 96, 120 and 96 hours. Moscow arrival window remains enforced for March 12–16. March 14 remains protected. No complete itinerary was approved in this collection.
Dates were selected with room for mandatory stays: Beijing arrival mid-February, Shanghai after at least four days, Russia in mid-March and Madrid by March 24. Concrete offers still require path-level checks. No new hub outside the existing route universe was verified.

## Before and after
Comparable coverage uses the new constraints on both sides. Earlier 299-date denominator is now 295.

| Measure | Before | After |
|---|---:|---:|
| Current stored offers | 1413 | 1417 |
| Search records | 131 | 139 |
| Distinct stored origin/destination/date search keys | 120 | 128 |
| Raw coverage | 112/340 | 120/340 |
| Feasible coverage | 109/295 | 117/295 |
| Opportunity coverage | 109/261 | 117/285 |

18 imported rows produce a net increase of four stored offers because the existing importer replaces same-day route/date snapshots. Historical text files are preserved. Nine searches yield eight newly covered grid dates, with an overlap in existing coverage. New previously unquoted departure cities for Moscow include Chengdu and Wuhan.

## Observed searches
| Origin | Destination | Date | Lowest retained USD | Source |
|---|---|---|---:|---|
| Chengdu | Moscow | 2027-03-12 | 369 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Chengdu%20to%20Moscow%20on%202027-03-12%20one%20way&curr=USD&hl=en&gl=br) |
| Wuhan | Moscow | 2027-03-12 | 394 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Wuhan%20to%20Moscow%20on%202027-03-12%20one%20way&curr=USD&hl=en&gl=br) |
| Geneva | Beijing | 2027-02-13 | 874 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Geneva%20to%20Beijing%20on%202027-02-13%20one%20way&curr=USD&hl=en&gl=br) |
| Warsaw | Beijing | 2027-02-14 | 651 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Warsaw%20to%20Beijing%20on%202027-02-14%20one%20way&curr=USD&hl=en&gl=br) |
| Beijing | Shanghai | 2027-02-19 | 146 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Beijing%20to%20Shanghai%20on%202027-02-19%20one%20way&curr=USD&hl=en&gl=br) |
| Beijing | Shanghai | 2027-02-20 | 146 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Beijing%20to%20Shanghai%20on%202027-02-20%20one%20way&curr=USD&hl=en&gl=br) |
| Beijing | Shanghai | 2027-02-22 | 146 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Beijing%20to%20Shanghai%20on%202027-02-22%20one%20way&curr=USD&hl=en&gl=br) |
| Shanghai | Moscow | 2027-03-12 | 376 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Shanghai%20to%20Moscow%20on%202027-03-12%20one%20way&curr=USD&hl=en&gl=br) |
| Belgrade | Beijing | 2027-02-13 | 498 | [Google Flights](https://www.google.com/travel/flights?q=Flights%20from%20Belgrade%20to%20Beijing%20on%202027-02-13%20one%20way&curr=USD&hl=en&gl=br) |

## Validation and limitations
Quote validation passed, 9 blocks and 18 offers. Rebuild completed in nine seconds and reports 979 complete itineraries. No increase in valid itineraries is claimed because constraints changed and full route comparisons were not executed.
Both local and deployment SQLite integrity checks returned ok.
Full backend suite ran 86 tests, with three failures and two errors in test_explore/test_itineraries after the hard-constraint changes. These fixtures depend on old requirements. Release readiness is not certified.

Remaining unconfirmed searches: Chengdu and Wuhan to Moscow March 15, Geneva to Beijing February 15, Warsaw to Beijing February 16, Beijing to Shanghai February 23 and 24.
Higher-value follow-up: finish these loads, then quote China–Moscow March 16 with same-day arrival, feasible Moscow departures March 20–23 and Madrid arrivals by March 24. Additional hubs and Singapore alternatives remain uncollected.

## Files and checkpoint
Source: data/quotes/browser_quotes_2026-11-11_usd_discovery.txt
Rules: config/trip.json
Generated: data/deploy/quotes.sqlite and data/precomputed/insights.json
Starting commit: bd5fd03. Collection commit can be obtained with git log -1 --format=%H -- reports/ORBIX_FARE_COLLECTION_2026-11-11.md.
