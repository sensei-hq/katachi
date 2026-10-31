import { test, expect } from '@playwright/test';
test('Home renders: start with Upload or Camera, your crafts below, the cost pill', async ({ page }) => {
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'What are we making today?' })).toBeVisible();
  await expect(page.locator('[data-start="upload"]')).toBeVisible();
  await expect(page.locator('[data-start="camera"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your crafts' })).toBeVisible();
  await expect(page.getByText(/\$0\.00/).first()).toBeVisible();
});
