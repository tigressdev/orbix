import { expect, test } from '@playwright/test';

test('atlas draws countries and pins, no page overflow', async ({ page }, info) => {
  await page.goto('/atlas');
  const map = page.getByTestId('atlas-map');
  await expect(map).toHaveAttribute('data-status', 'ready');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `e2e/shots/atlas-${info.project.name}.png` });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
