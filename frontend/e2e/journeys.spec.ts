import { expect, test, type Page } from '@playwright/test';

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const budgetText = (page: Page) => page.getByRole('button', { name: /Journey budget/ }).first().innerText();

async function addBeijing(page: Page) {
  await page.getByRole('button', { name: 'Explore next' }).click();
  const sheet = page.getByRole('dialog', { name: 'Where next?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /^Beijing, from/ }).click();
  const add = sheet.getByRole('button', { name: 'Add to journey' }).first();
  await expect(add).toBeVisible();
  await add.click();
  await expect(sheet).toBeHidden();
}

test.beforeEach(async ({ page, request }) => {
  await new Promise((r) => setTimeout(r, 900));                                              // let the previous test's debounced save land before resetting
  await request.put('/api/state', { data: { state: null } });                              // isolate: the server keeps the saved workspace
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?debug');
  await expect(page.getByRole('heading', { name: 'Across continents.' })).toBeVisible({ timeout: 30_000 });
});

test('journey 1: add a destination, pick a flight; timeline, budget and map update', async ({ page }, info) => {
  const before = await budgetText(page);
  await addBeijing(page);
  await expect(page.locator('ol').getByText('Beijing', { exact: true })).toBeVisible();
  await expect.poll(async () => budgetText(page)).not.toBe(before);                       // budget moved (server-evaluated)
  await expect(page.getByRole('button', { name: /Journey budget/ }).first()).not.toContainText('$0 /');
  const routes = await page.evaluate(() => ((window as unknown as { __map: { getSource(id: string): { serialize(): { data: { features: unknown[] } } } } }).__map.getSource('selected').serialize().data.features.length));
  expect(routes).toBe(1);                                                                    // map route follows the same canonical itinerary
  await noOverflow(page);
  await page.screenshot({ path: `e2e/shots/journey-after-add-${info.project.name}.png`, fullPage: false });
});

test('journey 2: two scenarios keep independent budgets', async ({ page }) => {
  await addBeijing(page);
  await expect.poll(async () => budgetText(page)).not.toContain('$0 /');
  await page.goto('/more/scenarios');
  await page.getByRole('button', { name: 'New' }).click();
  await expect.poll(async () => budgetText(page)).toContain('$0 /');                         // the new scenario starts empty
  await page.getByRole('button', { name: 'Open', exact: true }).first().click();                          // back to the first one
  await expect.poll(async () => budgetText(page)).not.toContain('$0 /');
  await expect(page.getByText('Scenario A')).toBeVisible();
  await expect(page.getByText('Scenario B')).toBeVisible();
});

test('journey 3: price pulse shows freshness and honest trend states', async ({ page }, info) => {
  await page.goto('/pulse');
  await expect(page.getByRole('heading', { name: 'Where prices are moving' })).toBeVisible();
  const card = page.locator('div', { hasText: /MAD → PEK/ }).first();
  await expect(card).toBeVisible();
  await expect(page.getByText(/Last observed/).first()).toBeVisible();
  await expect(page.getByText(/Baseline only/).first()).toBeVisible();                       // a one-day baseline is never called a trend
  await expect(page.getByText(/Needs 2 days/).first()).toBeVisible();
  await expect(page.getByText(/No notification delivery is configured/)).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: `e2e/shots/pulse-${info.project.name}.png` });
});

test('journey 4: the itinerary survives a reload', async ({ page }) => {
  await addBeijing(page);
  await page.waitForTimeout(1500);                                                           // state save is debounced
  await page.reload();
  await expect(page.locator('ol').getByText('Beijing', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Journey budget/ }).first()).not.toContainText('$0 /');
});

test('journey 5: every tab, the bottom sheet and the map, without horizontal overflow', async ({ page }, info) => {
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024;
  for (const [path, heading] of [['/', 'Across continents.'], ['/explore', 'Where next?'], ['/atlas', 'Explore geographically'], ['/pulse', 'Where prices are moving'], ['/more', 'Everything else'], ['/more/scenarios', 'Branches'], ['/more/insights', 'Why a route is worth it'], ['/more/preferences', 'Your assumptions']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `e2e/shots/tab${path.replace(/\//g, '-') || '-home'}-${info.project.name}.png` });
  }
  if (mobile) {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();
    for (const name of ['Journey', 'Explore', 'Atlas', 'Pulse', 'More']) await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  await page.goto('/atlas?debug');
  await expect(page.getByTestId('atlas-map')).toHaveAttribute('data-status', 'ready');
  await page.getByRole('button', { name: /^Beijing$/ }).first().click();                     // tapping a city opens its card
  await expect(page.getByRole('dialog', { name: /Beijing details/ })).toBeVisible();
  await page.getByRole('button', { name: 'Explore flights' }).click();
  await expect(page.getByRole('dialog', { name: 'Beijing', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');                                                       // accessible dismissal
  await expect(page.getByRole('dialog', { name: 'Beijing', exact: true })).toBeHidden();
  await page.getByRole('button', { name: /Journey budget/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Journey budget' })).toBeVisible();
  await page.screenshot({ path: `e2e/shots/budget-sheet-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Journey budget' })).toBeHidden();
  await noOverflow(page);
});

test('moscow stays visible and explains why it is locked', async ({ page }) => {
  await page.getByRole('button', { name: 'Explore next' }).click();
  const sheet = page.getByRole('dialog', { name: 'Where next?' });
  await expect(sheet.getByRole('button', { name: /^Moscow, from/ })).toBeVisible();
  await expect(sheet.getByText(/Order: first Beijing/).first()).toBeVisible();
});

for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
  test(`no horizontal overflow at ${width}px on every page`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 800 : 900 });
    for (const path of ['/', '/explore', '/atlas', '/pulse', '/more', '/more/scenarios', '/more/insights', '/more/preferences']) {
      await page.goto(path);
      await page.waitForLoadState('load');
      await noOverflow(page);
    }
  });
}
