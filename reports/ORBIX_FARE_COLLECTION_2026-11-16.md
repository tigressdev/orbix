# ORBIX fare discovery ledger — 2026-11-16

Source: Google Flights, market BR (`gl=br`), USD, 1 adult, one way. Every page was accepted only after "N results returned".
No CAPTCHA, sign-in or block occurred. Quote file: `data/quotes/browser_quotes_2026-11-16_usd_discovery.txt`.
Per search: the 5 cheapest economy offers, plus the cheapest nonstop and the fastest option when they were not already among them.

## Totals

| batch | attempts | successful searches | offers | new route-dates (airport level) | errors |
|---|---|---|---|---|---|
| 1 | 10 | 10 | 54 | 14 | 0 |
| 2 | 10 | 10 | 59 | 21 | 0 |
| 3 | 10 | 10 | 55 | 16 | 0 |
| 4 | 10 | 10 | 54 | 15 | 0 |
| 5 | 10 | 10 | 54 | 16 | 0 |
| **all** | **50** | **50** | **276** | **82** | **0** |

Coverage (`fare_collector.py status`), before -> after: raw 60% -> 63%; **feasible 68% -> 71%** (201 -> 212 of 295);
opportunity 65% -> 66% (235/357 -> 247/373). Complete itineraries in the precomputed analysis: 4,120 -> 14,470.
The coverage KPIs only count the planned grid; 26 of the 50 searches are on city pairs that were not in the grid, so they add route
diversity without moving those percentages. Tests: 86 pass.

Effort split: 14 missing grid route-dates, 26 new corridors/hubs, 6 flexible-date return legs, 4 refreshes of quotes that expired today.
Skipped on purpose: queue rows such as Istanbul/Belgrade -> Madrid on 8-13 Mar. Moscow cannot be left before 16 Mar (arrival 12-16 Mar
plus the 96 h stay), so no valid itinerary can use those dates.

## Corridors researched for the first time

Classification: **verified** = priced flights observed today; a verified corridor is still a research candidate until it is added to
`stages` in `config/trip.json` (not done here: that is a route decision).

| Corridor | Status | Cheapest observed | Note |
|---|---|---|---|
| Baku -> Beijing | verified | $290 nonstop (AZAL, 14 Feb); $540 with 1 stop on 15 Feb | The nonstop is not daily. |
| Madrid -> Baku | verified | $193, 1 stop (Pegasus, 13 Feb) | Madrid -> Baku -> Beijing = $483 on separate tickets. |
| Milan -> Beijing | verified | $563, 1 stop (AZAL); nonstop $1,012 | Madrid -> Milan $51 nonstop. |
| Barcelona -> Beijing | verified | $624, 1 stop; nonstop $1,373 | Not cheaper than Madrid. |
| Brussels -> Beijing | verified | $660, 1 stop (Hainan) | Not cheaper than Madrid. |
| Berlin -> Beijing | verified | $632, 1 stop (Turkish) | One Deutsche Bahn rail combination was dropped: not a flight. |
| Athens -> Beijing | verified | $658, 1 stop (Turkish) | Not cheaper than Madrid. |
| Guangzhou -> Moscow | verified | $359, 1 stop; nonstop $451 (15 Mar) / $773 (12-13 Mar) | Shanghai -> Guangzhou $68. |
| Hangzhou -> Moscow | verified | $355, 1 stop (China Southern) | Hangzhou is about 1 h from Shanghai by train (ground leg, not priced here). |
| Harbin -> Moscow | verified | $364, 1 stop | |
| Hong Kong -> Moscow | verified | $403, 1 stop (Etihad) | |
| Moscow -> Casablanca | verified | $204 nonstop (Royal Air Maroc, 18 Mar); $261 on 20 Mar | |
| Casablanca -> Madrid | verified | $52 (21 Mar), $76 (19 Mar), nonstop | Moscow -> Casablanca -> Madrid = $256-$337 on separate tickets. |
| Xi'an -> Shanghai | verified | $114-$131 nonstop (Spring) | |
| Wuhan -> Shanghai | verified | $302 nonstop | Expensive for the distance; high-speed rail exists (ground leg). |
| Shenzhen -> Shanghai | verified | $87 nonstop (Spring) | |
| Beijing -> Dali | verified | $256 nonstop (Air China) | |
| Dali -> Shanghai | verified | $236 (2 stops), $239 nonstop (Spring) | |
| Shanghai -> Xi'an / Chengdu / Guangzhou | verified | $98 / $116 / $68 nonstop (Spring) | |

Unsupported / not attempted: no corridor was added on geography alone. Yerevan, Tbilisi and Tashkent were considered for the return and
left out because no connectivity evidence was collected for them.

## Lowest observed fares on trip-relevant legs (today)

- Madrid -> stopover, 12 Feb: Budapest $36, Geneva $37, Milan $51, Warsaw $59, Prague $66, Vienna $88, Istanbul $126, Belgrade $139.
  13 Feb: Budapest $31, Istanbul $93 (1 stop; nonstop $165).
- Into Beijing: Istanbul $356 (15 Feb, 1 stop) and $423 (14 Feb); Budapest $461 (15 Feb); Baku $290 nonstop (14 Feb);
  Madrid direct search $607 (13 Feb, 1 stop).
- Cheapest observed ways to reach Beijing from Madrid on separate tickets: via Istanbul about $449 (93 + 356), via Budapest about $467-$492,
  via Baku $483. Separate tickets carry self-transfer risk (missed connection is not protected).
- China -> Moscow: Hangzhou $355, Guangzhou $359, Harbin $364, Shenzhen $367 (12 Mar), Hong Kong $403. Existing reference: Shanghai $348.
- Moscow -> hubs: Istanbul $124-$129 nonstop on 16, 17, 22, 23 Mar; Belgrade $270 (1 stop) on 16 and 23 Mar; Casablanca $204-$261 nonstop.

## Anomalies and data notes

- `check` warning: one offer arrives 3 days after departure (kept as observed).
- Offers that depart 13 Mar and land on 14 Mar (protected day) are stored as observed; the itinerary engine applies the rule.
- Config: 13 airports and 11 cities were added to `config/airports.json` and `config/cities.json` so the importer accepts the new hubs
  (Barcelona, Milan x3 airports, Brussels, Berlin, Baku, Athens, Guangzhou, Hangzhou, Harbin, Hong Kong, Casablanca). Cities are tagged
  "Fare discovery hub · research candidate", interest 3. No `stages`, stay rules or constraints were changed.
- 11-09 quotes passed the 7-day validity today (for example Beijing -> Moscow 12 Mar, Moscow -> Belgrade 20 Mar).

## High-value searches still missing

1. Shanghai -> Hangzhou/Guangzhou are ground or cheap-flight legs; to compare them fairly collect Hangzhou -> Moscow and Guangzhou -> Moscow on
   10, 11, 16 Mar (only 12, 13, 15 Mar exist).
2. Madrid -> Baku 12 and 14 Feb, and Baku -> Beijing 13 and 16 Feb (to find which days the $290 nonstop runs).
3. Moscow -> Casablanca 16, 17, 19, 21, 22 Mar and Casablanca -> Madrid 17, 18, 20, 22, 23 Mar.
4. Planned grid still open: Beijing -> Chengdu (10 dates), Beijing -> Xi'an (9), Shanghai -> Shenzhen (9), Shanghai -> Singapore (11),
   Shenzhen <-> Singapore (15), Beijing -> Wuhan (5). All optional detours.
5. Refresh of the 11-11 quotes, which expire on 18 Nov.

## Reproducing / continuing

- Machine-readable checkpoint (local, git-ignored): `data/queue/collection_checkpoint_2026-11-16.json` (completed keys, counts per batch,
  failed jobs, source file, git state).
- Remaining queue: `python tools/fare_collector.py queue --limit 50`. Filter out return-leg dates before 16 Mar, as explained above.
- Limitations: one reading per route-date, economy only, checked-bag price not visible on the result card, prices in USD from the BR market.
  Nothing here is a booking; fares change.
