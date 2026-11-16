# ORBIX lodging research — handoff (phase two, not started)

Written 2026-11-16 after the flight-collection round. No hotel price has been collected. Nothing below is an observed lodging price.

## Goal

For the best flight itineraries, find real, bookable rooms for **two adults sharing one private room**, and record them so ORBIX can
compare total trip cost (flights + lodging).

## Budget (per ROOM per night, two people, taxes and mandatory fees included)

| Where | Acceptable | Preferred |
|---|---|---|
| Every destination except Shanghai | BRL 120-300 | about BRL 200 |
| Shanghai | up to BRL 800 (BRL 400 per person) | cheaper when quality and location are met |

Never mix up price per person and price per room. Convert with the rate of the observation day (`python trip.py fx --date YYYY-MM-DD`;
on 2026-11-16: 1 USD = 5.6637 BRL) and store both the original currency and BRL.

## Dates: take them from the flights, do not guess

1. Read the top itineraries (app Insights, or `data/precomputed/insights.json`); check-in = arrival date of the leg into the city,
   check-out = departure date of the leg out. An arrival after midnight still needs the previous night.
2. Fixed frame: arrive Madrid 11 Feb 2027 22:35; leave Madrid 25 Mar 2027 22:30.
3. Stay rules: Beijing >= 96 h, Shanghai >= 120 h, Moscow >= 96 h. Moscow arrival 12-16 Mar. 14 Mar has no flights and should have no
   airport transfer: the 13-15 Mar nights are in one city.
4. Typical windows today (to be replaced by the chosen itinerary): Madrid 11-12/13 Feb; optional European stopover 1-2 nights
   (Istanbul, Budapest and Baku are the cheapest gateways observed); Beijing from 13-16 Feb for 4+ nights; Shanghai 5+ nights;
   optional Chinese detour (Xi'an, Chengdu, Shenzhen, Dali, Guangzhou/Hangzhou); Moscow 12-16 Mar to 16-20 Mar; return hub night if the
   route goes through Istanbul, Belgrade or Casablanca; Madrid until 25 Mar.

## Existing assumptions to keep unless the user changes them

- `config/trip.json` -> `lodging_usd`: Moscow is "hosted, zero cost". Do not research Moscow hotels unless asked.
- Stays in China are split between two people: a private room costs each person half; dorm beds are per person.
- Tel Aviv is research-only.

## Record for every option (no field may be invented; missing = "unknown")

Property name and address · source site and URL · observation date/time · check-in/check-out · room type (private, bed type, private
bathroom yes/no) · occupancy (2 adults) · nightly price and total stay price · taxes and mandatory fees (included or added) · currency
and BRL conversion · refundability and free-cancellation deadline · payment timing (now / at property) · rating and number of reviews ·
distance to metro/centre and to the arrival airport or station · availability at observation time (bookable yes/no).

China-specific check: confirm the property accepts foreign guests (not all are licensed to) and how it can be paid.

## Rules

- Real properties, real dates, real prices only. No estimates, no "typical" prices, no relabelling of old observations.
- At least 3 options per city-stay: cheapest acceptable, best value, best location.
- Do not book, do not enter personal or payment data, do not create accounts, do not solve CAPTCHAs.
- Do not build a scraper or a booking integration yet. Suggested storage, mirroring the fare files: one dated text/CSV file per
  observation day under `data/lodging/`, never edited afterwards.

## Inputs produced by the flight phase

- Ledger: `reports/ORBIX_FARE_COLLECTION_2026-11-16.md`.
- Fares: `data/quotes/browser_quotes_2026-11-1{3,4,6}_*.txt` (valid 7 days from observation).
