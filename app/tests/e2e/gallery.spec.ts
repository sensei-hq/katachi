import { test, expect } from '@playwright/test';

// The actions gallery: every action with its live demo and example ask (chains live on /chains).
// A pure page: demos run on the synthetic craft, no models involved.
test('the gallery lists every action with a live demo', async ({ page }) => {
  await page.goto('/actions');
  for (const shelf of ['Stack', 'Shape', 'Photo', 'Clean up']) await expect(page.getByRole('heading', { name: shelf, exact: true })).toBeVisible();
  // the cards render after hydration (the headings above are SSR); the dev server is slow under a parallel suite
  await expect.poll(async () => page.locator('[data-action-card]').count(), { timeout: 30_000 }).toBeGreaterThan(20);
  // a live demo renders before/after on the deshadow card
  const deshadow = page.locator('[data-action-card="deshadow"]');
  await expect(deshadow.getByRole('img', { name: 'Before' })).toBeVisible({ timeout: 30_000 });
  await expect(deshadow.getByRole('img', { name: 'After' })).toBeVisible({ timeout: 30_000 });
  await expect(deshadow.getByText(/Say “fold all the shadows/)).toBeVisible();
});
