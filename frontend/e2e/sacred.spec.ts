import { expect, test, type Page } from '@playwright/test';

// Sacred Atlas end to end: real rendering against the production build + the no-users API (see playwright.config.ts).
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const budgetText = (page: Page) => page.getByRole('button', { name: /Journey budget/ }).first().innerText();

async function addBeijing(page: Page) {
  await page.getByRole('button', { name: 'Explore next' }).click();
  const sheet = page.getByRole('dialog', { name: 'Where next?' });
  await sheet.getByRole('button', { name: /^Beijing, from/ }).click();
  await sheet.getByRole('button', { name: 'Add to journey' }).first().click();
  await expect(sheet).toBeHidden();
}

test.beforeEach(async ({ page, request }) => {
  await new Promise((r) => setTimeout(r, 900));
  await request.put('/api/state', { data: { state: null } });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?debug');
  await expect(page.getByRole('heading', { name: 'Across continents.' })).toBeVisible({ timeout: 30_000 });
  await addBeijing(page);
  await expect.poll(async () => budgetText(page)).toMatch(/\$[1-9][\d,]* \//);
});

test('vertical slice: open, explore a tradition, pick Mount Emei, evaluate, add as a branch, return to Journey', async ({ page }, info) => {
  const budgetBefore = await budgetText(page);
  // 1. open Sacred Atlas (More on phones, sidebar on desktop)
  if (info.project.name === 'desktop') await page.getByRole('navigation', { name: 'Primary' }).first().getByRole('link', { name: 'Sacred Atlas' }).click();
  else { await page.getByRole('link', { name: 'More' }).click(); await page.getByRole('link', { name: /Sacred Atlas/ }).click(); }
  await expect(page.getByRole('heading', { name: 'Where civilizations seek meaning.' })).toBeVisible();
  await expect(page.getByTestId('sacred-map')).toHaveAttribute('data-status', 'ready');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `e2e/shots/sacred-landing-${info.project.name}.png` });

  // 2. explore a tradition
  await page.getByRole('button', { name: /Traditions/ }).first().click();
  await page.getByRole('tab', { name: 'Suffering' }).click();
  await expect(page.getByTestId('trad-buddhism')).toContainText('first two Noble Truths');
  await expect(page.getByTestId('trad-daoism')).toBeVisible();
  await expect(page.getByText('do not share a single historical origin')).toBeVisible();
  // 3. select a sacred location from the tradition card
  await page.getByTestId('trad-buddhism').getByRole('button', { name: 'Mount Emei' }).click();
  const sheet = page.getByRole('dialog', { name: 'Mount Emei' });
  await expect(sheet).toBeVisible();
  // 4. historical meaning
  await expect(sheet.getByText('Why this place matters')).toBeVisible();
  await expect(sheet.getByText(/How did Chinese Buddhism integrate/)).toBeVisible();
  // 5. calendar
  await sheet.getByRole('tab', { name: 'Calendar' }).click();
  await expect(sheet.getByText('Lantern Festival')).toBeVisible();
  // 6–7. feasibility and incremental cost
  await sheet.getByRole('tab', { name: 'Journey impact' }).click();
  await sheet.getByTestId('evaluate').click();
  await expect(sheet.getByTestId('impact')).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByText('Sacred journey economics · versus active branch')).toBeVisible();
  await expect(sheet.getByText(/Ground transportation/)).toBeVisible();
  await expect(sheet.getByTestId('recommend')).toBeVisible();
  await page.screenshot({ path: `e2e/shots/sacred-impact-${info.project.name}.png` });
  // 8. add as a new branch
  await sheet.getByTestId('add-alternative').click();
  await expect(sheet.getByText(/Saved as a new scenario/)).toBeVisible();
  await expect(sheet.getByText(/is unchanged and still active/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).first().click();
  // 9. back to the Journey: same active branch, same budget
  await page.goto('/');
  await expect(page.locator('ol').getByText('Beijing', { exact: true })).toBeVisible();
  await expect.poll(async () => budgetText(page)).toBe(budgetBefore);
  await page.goto('/more/scenarios');
  await expect(page.getByText('Sacred · Mount Emei').first()).toBeVisible();
});

test('Lhasa is permit dependent and not recommendable even with a route engine', async ({ page }) => {
  await page.goto('/more/sacred?site=lhasa&tab=impact');
  const sheet = page.getByRole('dialog', { name: 'Lhasa' });
  await expect(sheet.getByText('Permit dependent').first()).toBeVisible();
  await sheet.getByTestId('evaluate').click();
  await expect(sheet.getByTestId('recommend')).toHaveText(/Not recommendable/, { timeout: 30_000 });
});

test('calendar distinguishes the end of the holiday from the Lantern Festival', async ({ page }, info) => {
  await page.goto('/more/sacred?mode=calendar');
  const whatIf = page.getByTestId('whatif');
  await whatIf.fill('2027-02-14');
  await page.getByTestId('bar-spring-holiday-2027').click();
  await expect(page.getByTestId('event-spring-holiday-2027')).toHaveAttribute('data-access', 'passed');
  await page.getByTestId('bar-lantern-2027').click();
  await expect(page.getByTestId('event-lantern-2027')).toHaveAttribute('data-access', 'within-stay');
  await whatIf.fill('2027-02-13');
  await page.getByTestId('bar-spring-holiday-2027').click();
  await expect(page.getByTestId('event-spring-holiday-2027')).toHaveAttribute('data-access', 'final-days');
  await whatIf.fill('2027-02-21');
  await expect(page.getByText('the principal Lunar New Year festival period has passed')).toBeVisible();
  await page.screenshot({ path: `e2e/shots/sacred-calendar-${info.project.name}.png` });
});

test('no page-level horizontal overflow at 320–768 px in any mode', async ({ page }) => {
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const mode of ['geography', 'traditions', 'calendar', 'journeys']) {
      await page.goto(`/more/sacred?mode=${mode}`);
      await expect(page.getByRole('heading', { name: 'Where civilizations seek meaning.' })).toBeVisible();
      await page.waitForTimeout(250);
      expect(await overflow(page), `${mode} @ ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.goto('/more/sacred?site=emei&tab=impact');
    await expect(page.getByRole('dialog', { name: 'Mount Emei' })).toBeVisible();
    expect(await overflow(page), `sheet @ ${width}px`).toBeLessThanOrEqual(0);
    if (width < 1024) await expect(page.locator('nav[aria-label="Primary"] ul > li')).toHaveCount(5);
  }
});
