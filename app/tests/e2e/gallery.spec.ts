import { test, expect } from '@playwright/test';

// The actions gallery: every action with its live demo and example ask (chains live on /chains).
// A pure page: demos run on the synthetic craft, no models involved.
test('the gallery lists every action with a live demo', async ({ page }) => {
  await page.goto('/actions');
  for (const shelf of ['Stack', 'Shape', 'Photo', 'Clean up']) await expect(page.getByRole('heading', { name: shelf, exact: true })).toBeVisible();
  expect(await page.locator('[data-action-card]').count()).toBeGreaterThan(20);
  // a live demo renders before/after on the deshadow card
  const deshadow = page.locator('[data-action-card="deshadow"]');
  await expect(deshadow.getByRole('img', { name: 'Before' })).toBeVisible();
  await expect(deshadow.getByRole('img', { name: 'After' })).toBeVisible();
  await expect(deshadow.getByText(/Say “fold all the shadows/)).toBeVisible();
});
