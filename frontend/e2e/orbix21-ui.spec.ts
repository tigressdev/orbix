import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Deterministic UI-only QA. These empty-quote fixtures do NOT replace the live Python/API suite.
const read = (p: string) => JSON.parse(fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const cfg = read('config/trip.json'), airports = read('config/airports.json'), cities = read('config/cities.json');
const fxRows = read('data/fx.json') as { day: string; currency: string; per_usd: number }[];
const fxDays: Record<string, Record<string, number>> = {};
for (const r of fxRows) (fxDays[r.day] ??= {})[r.currency] = r.per_usd;
const latest = Object.keys(fxDays).sort().pop()!;
const meta = {
  trip: cfg.trip, home: 'MAD', home_city: 'MADRID', cities: Object.fromEntries(Object.entries(cities).map(([id, c]) => {
    const ap = Object.values(airports).find((a: any) => a.city === id) as any;
    return [id, { ...(c as object), lat: ap?.lat ?? 0, lon: ap?.lon ?? 0 }];
  })),
  bookings: [{ id: 'in', kind: 'confirmed', origin: 'GRU', destination: 'MAD', flight: 'CA898', airline: 'Air China', dep_local: '2027-02-11 08:25', arr_local: '2027-02-11 22:35' }, { id: 'out', kind: 'confirmed', origin: 'MAD', destination: 'GRU', flight: 'CA897', airline: 'Air China', dep_local: '2027-03-25 22:30', arr_local: '2027-03-26 05:30' }],
  purchased_ticket: {}, fx: { days: fxDays, latest_day: latest, latest: fxDays[latest] }, required: ['BEIJING', 'MOSCOW'], protected_dates: ['2027-03-14'], default_budget: 2700,
  hotel_night: {}, lodging: cfg.lodging_usd, stay_rules_hours: cfg.constraints.stay_rules_hours, airports: Object.fromEntries(Object.entries(airports).map(([k, v]: [string, any]) => [k, v.city])), airport_names: {}, airlines: {}, hosted: false, state_backend: 'test fixture', auth_required: false, is_owner: true, data: [], latest_arrival_local: '2027-03-25 16:30', birthday: cfg.birthday,
};
const summary = { flights: 0, hotel: 0, hotel_full: 0, hotel_shared_nights: 0, hotel_saved: 0, bags: 0, transfers: 0, risk: 0, total: 0, adjusted: 0, nights: {}, visited: ['MADRID'], complete: false, missing_required: ['BEIJING', 'MOSCOW'], legs: 0, city: 'MADRID', here: 'MAD', flags: [] };

for (const theme of ['light', 'dark']) test(`UI fixtures: ${theme}, atlas, calendar, independent scenario and corridors`, async ({ page }, info) => {
  const width = info.project.name === 'desktop' ? 1440 : 390;
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let state: any = null;
  const errors: string[] = [];
  const mediaFailures: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => { if (r.resourceType() === 'image') mediaFailures.push(`${r.url()}: ${r.failure()?.errorText}`); });
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    let data: any;
    if (p === '/api/session') data = { auth: false, user: { id: 'ui-fixture', name: 'UI fixture', owner: true }, users: [] };
    else if (p === '/api/meta') data = meta;
    else if (p === '/api/state') { if (route.request().method() === 'PUT') state = body.state; data = { state, user: 'ui-fixture' }; }
    else if (p === '/api/evaluate') data = { results: body.paths.map(() => ({ summary, metrics: {} })) };
    else if (p === '/api/options') data = { summary, groups: [] };
    else if (p === '/api/trends') data = { summary: { rising: 0, falling: 0, stable: 0, routes: 0, offers: 0, snapshot_days: 0, baseline: 0 }, routes: [] };
    else if (p === '/api/flex/coverage') data = { from_name: cities[body.from]?.name, to_name: cities[body.to]?.name, research_only: body.to === 'TEL_AVIV' ? 'Research only' : null, days: [-2, -1, 0, 1, 2].map((i) => {
      const date = new Date(Date.parse(body.preferred + 'T12:00Z') + i * 86400000).toISOString().slice(0, 10);
      return { date, status: date === '2027-03-14' ? 'protected' : 'missing', preferred: i === 0, url: 'https://example.org/fixture' };
    }).filter((d) => d.date >= body.hard_min && d.date <= body.hard_max) };
    else if (p === '/api/flex/corridors') data = { jobs: 0, baseline_total: null, corridors: cfg.constraints.return_corridors.map((c: any) => ({ id: c.chain.join('>'), label: c.label ?? c.chain.join(' → '), chain: c.chain, status: c.chain.includes('TEL_AVIV') ? 'research_only' : 'incomplete', restricted: {}, missing_legs: ['Observed flight data unavailable in UI fixture'], unpriced: ['Local transfers', 'Entrance fees'], best: null, options: [], option_count: 0, delta_vs_best_safe: null, legs: [] })) };
    else data = {};
    await route.fulfill({ json: data });
  });
  await page.goto('/more/sacred');
  await expect(page.getByRole('heading', { name: 'Where civilizations seek meaning.' })).toBeVisible();
  if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  const shot = async (name: string) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `e2e/shots/orbix21-${width}-${theme}-${name}.png` });
  };
  await page.locator('[data-photo]').first().evaluate(async (el) => { const img = el.querySelector('img'); if (img && !img.complete) await Promise.race([new Promise((r) => { img.onload = r; img.onerror = r; }), new Promise((r) => setTimeout(r, 3000))]); });
  await shot('hero');
  await info.attach('hero-image-state', { body: JSON.stringify(await page.locator('[data-photo]').first().evaluate((el) => ({ state: el.getAttribute('data-photo'), width: el.querySelector('img')?.naturalWidth ?? 0 }))), contentType: 'application/json' });
  await page.getByTestId('site-emei').scrollIntoViewIfNeeded();
  await shot('cards');
  await page.getByTestId('site-emei').click();
  await expect(page.getByTestId('site-sheet')).toBeVisible();
  await shot('sheet');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByRole('button', { name: /Cultural Calendar/ }).click();
  await page.getByTestId('quick-2027-02-13').click();
  await expect(page.getByTestId('arrival-message')).toContainText('final day');
  await expect(page.getByTestId('stay-BEIJING')).toBeVisible();
  await page.getByTestId('quick-2027-02-13').scrollIntoViewIfNeeded();
  await shot('calendar-controls');
  await page.getByTestId('timeline').scrollIntoViewIfNeeded();
  await shot('timeline');
  await page.getByTestId('bar-cny-2027').click();
  await expect(page.getByTestId('event-cny-2027')).toHaveAttribute('data-access', 'passed');
  await page.getByTestId('apply-whatif').click();
  await expect(page.getByText('Saved as a new scenario. Your active journey is unchanged.')).toBeVisible();
  await expect.poll(() => state?.scenarios.length).toBe(2);
  expect(state.activeId).toBe(state.scenarios[0].id);
  expect(Object.keys(state.scenarios[0].nodes)).toHaveLength(1);
  expect(Object.values(state.scenarios[1].nodes).every((n: any) => !n.leg)).toBe(true);
  await page.getByRole('button', { name: /Journey Alternatives/ }).click();
  const template = page.getByTestId('template-sacred-mountains');
  await template.getByRole('button', { name: 'Compare with current journey' }).click();
  await expect(template.getByText(/Template additional cost/)).toContainText('Unknown');
  await template.getByRole('button', { name: 'Save as alternative', exact: true }).click();
  await expect.poll(() => state?.scenarios.length).toBe(3);
  expect(state.activeId).toBe(state.scenarios[0].id);
  await template.scrollIntoViewIfNeeded();
  await shot('theme');
  await template.getByRole('button', { name: 'Search flexible dates', exact: true }).click();
  await expect(template.getByTestId('flexible-dates')).toBeVisible();
  await page.goto('/more/scenarios');
  await expect(page.getByTestId('return-corridors')).toBeVisible();
  await page.getByTestId('flexible-dates').scrollIntoViewIfNeeded();
  await shot('flex');
  await page.getByText('Safety restricted — research only', { exact: true }).scrollIntoViewIfNeeded();
  await shot('corridors');
  for (const path of ['/', '/explore', '/pulse']) {
    await page.goto(path);
    await expect(page.getByTestId('route-date-search')).toBeVisible();
    await page.getByTestId('route-date-search').locator('summary').click();
    await expect(page.getByTestId('flexible-dates')).toBeVisible();
    await shot(path === '/' ? 'journey' : path.slice(1));
  }
  await page.getByRole('button', { name: /Journey budget:/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Journey budget' })).toBeVisible();
  await shot('budget');
  await info.attach('external-image-failures', { body: JSON.stringify(mediaFailures), contentType: 'application/json' });
  expect(errors).toEqual([]);
});
