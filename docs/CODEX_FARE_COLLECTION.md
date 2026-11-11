# Coleta de cotações com o Codex

**Como usar:** copie o bloco "PROMPT" abaixo e cole no Codex, na pasta `china-trip-2027`. Ele usa `tools/fare_collector.py` (fila, leitura e
validação) e `tools/gflights_extract.js`. O Codex precisa de um navegador que leia a página do Google Flights; sem navegador, ele deve apenas gerar
a fila e parar (o prompt já diz isso).

O que é automático e o que não é:

| Passo | Quem faz |
|---|---|
| Descobrir quais rota/datas ainda não têm cotação (`queue`) | script |
| Abrir a página do Google Flights e esperar "N results returned" | navegador (agente) |
| Ler o texto de cada voo da página | navegador (agente) |
| Converter o texto em linhas de importação (`parse`) | script |
| Validar o arquivo (`check`) e importar (`trip.py import`) | script |
| Reconstruir os dados de produção e abrir o PR | agente, com o `build_data.py` |

---

## PROMPT

```text
You are collecting real flight fares for ORBIX (repo: C:\Users\helen\Documents\tripAI\china-trip-2027, GitHub tigressdev/orbix).
Work incrementally, report honestly, and never invent a number.

## Goal
Add OBSERVED one-way fares from Google Flights for the route-dates that still have no fresh quote, so the itinerary engine and the
flexible-date corridor comparison (+-2 days) can price complete journeys. Prices live in text files (data/quotes/*.txt); the database is rebuilt from them.

## Trip context (fixed facts; do not reopen)
- Traveller flies GRU>MAD arriving 11 Feb 2027 22:35 and MAD>GRU on 25 Mar 2027 22:30 (both already bought).
- Route: Madrid -> (optional European stopover) -> Beijing first -> Chinese cities -> Moscow (mandatory) -> back to Madrid before 25 Mar.
- 14 Mar 2027 is a no-flight day (birthday): never collect that date.
- Tel Aviv / Jerusalem is a RESEARCH-ONLY corridor (safety advisories). Collect its fares only so they can be compared; do not describe it as
  recommended or bookable.
- Currency: always USD (curr=USD in the URL). Market: gl=br.

## Hard rules
1. Only write prices you actually read from a Google Flights results page after it shows "N results returned". A page still loading shows
   incomplete prices: wait.
2. A missing fare stays missing. Never estimate, interpolate, copy another day's price, or reuse an old quote as new.
3. Do not buy, book, sign in, accept terms beyond a cookie banner (choose reject/minimal), enter any personal or payment data, or solve CAPTCHAs.
   If Google shows a CAPTCHA or blocks the session, stop and report.
4. Do not touch production: no Vercel settings, no environment variables, no secrets (.env*, config/users.local.json, data/.session_secret).
5. Git: work on a new branch (data/quotes-YYYY-MM-DD). Never push to main, never force-push, never rewrite history, never merge the PR yourself.
6. Preserve history: a new file per quote day, never edit or delete older data/quotes/*.txt files.
7. Python standard library only. Do not add dependencies.

## Step 0. Orient (2 minutes, no repo-wide audit)
    git status -sb
    python tools/fare_collector.py status
    python tools/fare_collector.py queue --corridors --flex 2 --limit 40
`status` shows coverage of the planned grid; `queue` lists the route-dates that need a quote, highest priority first, with the exact Google Flights
URL of each. "stale" = quoted before but older than max_offer_age_days (7), so the engine ignores it: quote it again. Quotes taken on 9 Nov expire on
16 Nov, so priority is the highest-priority rows first.

## Step 1. Collect, one search at a time
For each queue row (start from the top; stop when the budget below is spent):

1. Open the URL in the browser (it already contains the route, date, curr=USD, gl=br).
2. Wait until the page text contains "N results returned". If it says there are no flights, record nothing for that row and note it as "no results".
3. In the page's JavaScript console (or the browser tool's JS action) run this, which returns every flight card label as one text block:

       [...new Set([...document.querySelectorAll('[aria-label^="From "]')].map(a => a.getAttribute('aria-label')))].join('\n\n')

   (`tools/gflights_extract.js` does the same conversion in the browser if you prefer it; the Python path below is the reference.)
4. Save that text to a scratch file OUTSIDE the repo (for example the system temp folder), then convert it. The destination city id comes from the
   queue row (dest_city); the date is the departure date of the search:

       python tools/fare_collector.py parse <labels.txt> --dest-city MADRID --date 2027-03-21 --keep 10 >> data/quotes/browser_quotes_YYYY-MM-DD_usd_<tag>.txt

   `parse` keeps flights quoted in US dollars, drops business/first/premium cabins and rail, and keeps the 10 cheapest (the engine uses the cheapest
   per route/date). If it prints a code that starts with `?` (an airport it does not know), add the airport name fragment to EXTRA_AIRPORTS in
   tools/fare_collector.py (and tools/gflights_extract.js), then run `parse` again. Do not leave `?` codes in a quote file.
5. Start a new quote file with these two header lines the first time (the day in the file name is the quote day = today, UTC-3 date is fine):

       #!currency=USD
       # Cotacoes OBSERVADAS no Google Flights (mercado BR, USD, 1 adulto, so ida) em YYYY-MM-DD. <what this batch covers>

Batch size and pacing: do at most 60 searches per session, one page at a time, with a pause between pages. Do not open many tabs in parallel.

## Priorities (use `queue`, which already sorts them)
1. Return: Beijing/Shanghai/Shenzhen -> Moscow (12-16 Mar window); Moscow -> Istanbul -> Madrid; Moscow -> Belgrade -> Madrid; Moscow -> Madrid
   (18-24 Mar); Moscow -> Tel Aviv -> Madrid (research only).
2. China: Beijing -> Chengdu and Beijing -> Xi'an (19-26 Feb), Chengdu -> Shanghai (22 Feb - 2 Mar), Beijing -> Shanghai, Shanghai -> Shenzhen.
3. Outbound: Madrid -> Beijing (12-14 Feb) and Madrid -> {Budapest, Prague, Istanbul, Vienna, Zurich, Warsaw, Belgrade, Zagreb, Krakow, Geneva} ->
   Beijing (13-17 Feb).
Flexible dates: for a preferred departure date D collect D-2 ... D+2 (that is what `queue --corridors --flex 2` generates, already clipped by stay
rules, the Madrid deadline of 25 Mar and the protected 14 Mar). The second leg of a corridor depends on the first: the queue only lists dates that
can still form a valid itinerary, so do not add dates it did not list.

## Step 2. Validate and import
    python tools/fare_collector.py check data/quotes/browser_quotes_YYYY-MM-DD_usd_<tag>.txt
Fix every PROBLEM it prints (unknown airport, duplicate block, protected date, non-USD, bad price). Warnings are informational (for example an
outlier price is kept as read; do not delete it). Then:

    python trip.py import data/quotes/browser_quotes_YYYY-MM-DD_usd_<tag>.txt
    python trip.py fx --date YYYY-MM-DD
    python -m unittest discover -s tests
    python tools/fare_collector.py status
Importing the same route/date again on the same day REPLACES that day's reading; on a later day it adds history (that history feeds Price Pulse).

## Step 3. Rebuild deploy data (slow: it recomputes the Insights analysis; it can take 5+ minutes, run it in the background and wait)
    python trip.py fx --export
    python scripts/build_data.py
This regenerates data/deploy/quotes.sqlite and data/precomputed/insights.json. Production is read-only and only sees what is committed.

## Step 4. Commit on a branch and open a PR (do not merge)
    git checkout -b data/quotes-YYYY-MM-DD
    git add data/quotes/browser_quotes_YYYY-MM-DD_*.txt data/fx.json data/deploy data/precomputed tools
    git commit -m "Price update YYYY-MM-DD (<n> route-dates: <short list>)"
    git push -u origin data/quotes-YYYY-MM-DD
Open a pull request against main. Do not commit frontend/tsconfig.tsbuildinfo, data/quotes.sqlite, .env*, or anything under config/users.local.json.
Production only updates after a human merges the PR.

## Stop conditions (stop and report instead of continuing)
- A CAPTCHA, a sign-in wall, "unusual traffic", or repeated empty pages.
- `check` still fails after you fixed what it names.
- You are about to touch anything listed in the hard rules.

## Final report (be concise and factual)
- Route-dates quoted this session, and route-dates attempted but with no results.
- Coverage before/after (`status`), and what is still missing, in priority order.
- For each return corridor (Moscow>Istanbul>Madrid, Moscow>Belgrade>Madrid, Moscow>Madrid, Moscow>Tel Aviv>Madrid [research only]) the cheapest
  complete observed option from `python trip.py flex --date 2027-03-20 --flex 2`, quoting the numbers printed, not remembered ones.
- Anything that looked odd (outlier prices, airports added to the map, pages that needed retries).
- The branch name and PR link. Say clearly that nothing is live until the PR is merged.
```

---

## Notas para você

- **Validade:** cotações valem 7 dias (`search.max_offer_age_days`). As de 9 nov vencem em 16 nov; depois disso o app mostra "Needs quotation".
- **Histórico:** use um arquivo por dia de coleta. É isso que cria tendência no Price Pulse.
- **Revisar antes de aprovar o PR:** abra o arquivo `.txt` do dia e compare alguns preços com o Google Flights; o `check` valida formato, não verdade.
- **Teste rápido do coletor** (sem navegador): `python tools/fare_collector.py status` e `python tools/fare_collector.py queue --limit 10`.
- **Limite conhecido:** o texto do card não informa bagagem despachada; `bag:carry=no/yes` só indica restrição de bagagem de mão.
