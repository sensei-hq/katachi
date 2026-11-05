import { test, expect } from '@playwright/test';

// Chains live apart from the action gallery: run one on the open craft, or build and save your own.
// A pure page: no models involved.
test('chains run, build and save', async ({ page }) => {
  await page.goto('/chains');
  await expect(page.getByRole('heading', { name: 'Chains', exact: true })).toBeVisible();
  // the built-in polish chain (Run waits for an open craft), and a saved chain round-trip
  const polish = page.locator('[data-chain-card="polish"]');
  // the cards render after hydration (the heading above is SSR); the dev server is slow under a parallel suite
  await expect(polish).toBeVisible({ timeout: 30_000 });
  await expect(polish.getByRole('button', { name: 'Run' })).toBeDisabled();
  await page.locator('[data-chain-name]').fill('Gallery shine');
  await page.locator('[data-chain-add]').selectOption('tidy');
  await page.locator('[data-chain-add]').selectOption('smooth');
  await page.getByRole('button', { name: 'Save chain' }).click();
  await expect(page.getByText(/Saved “Gallery shine”/)).toBeVisible();
  await expect(page.locator('[data-chain-card]', { hasText: 'Gallery shine' })).toBeVisible();
});
