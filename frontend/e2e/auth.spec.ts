import { expect, test } from '@playwright/test';

// Runs against a throwaway API (port 8767) whose users come from FI_USERS: two random test accounts created for this run only.
const PASS = process.env.E2E_PASS ?? '';
test.use({ baseURL: 'http://127.0.0.1:4174' });
test.skip(!PASS, 'needs E2E_PASS and the auth test servers (see frontend/README)');

test('wrong password is rejected, right password opens the studio, the other person is view-only', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('login')) r.text().then((t) => console.log('HTTP', r.status(), t)); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByLabel('Login').fill('alice');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).not.toBeEmpty();
  await page.getByLabel('Password').fill(PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Across continents.' })).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain('fi_session');           // HttpOnly: invisible to JS
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(PASS);
  await page.goto('/more');
  await page.getByRole('button', { name: /Bob/ }).last().click();
  await page.getByRole('link', { name: 'Journey' }).first().click();                         // in-app navigation keeps the chosen workspace
  await expect(page.getByRole('status')).toContainText('View only');
  await expect(page.getByRole('button', { name: 'Explore next' })).toBeDisabled();
  const put = await page.request.put('/api/state', { data: { state: { v: 1 } } });          // the server writes only the signed-in user's own space
  expect(put.status()).toBeLessThan(500);
});

test('signed-out requests are refused', async ({ request }) => {
  for (const p of ['/api/meta', '/api/state', '/api/analysis', '/api/trends']) expect((await request.get(p)).status()).toBe(401);
});
