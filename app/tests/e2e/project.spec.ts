import { test, expect } from '@playwright/test';
import { cameraFromHome, uploadFromHome } from './start';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('a project: start, name, gate, save, reopen (1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('without a project the flow sends you to the start', async ({ page }) => {
    await page.goto('/make/layers'); await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/workshop$/);
    await expect(page.getByRole('region', { name: 'Start a craft' })).toBeVisible();
  });

  test('Upload on Home → named from the file → Analyze → Cut opens once the layers are in → reopened from Your crafts', async ({ page }) => {
    await uploadFromHome(page, [{ name: 'alpine-forest.png', mimeType: 'image/png', buffer: png }]);
    await page.getByRole('main').getByRole('button', { name: 'Analyze' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alpine forest');
    const craft = page.getByRole('navigation', { name: 'Studio sections' }).getByRole('region', { name: 'Current craft' });
    await expect(craft.getByRole('link', { name: 'Layers' })).toBeVisible();
    // Cut and Assemble open as soon as the craft has its layers
    await expect(page.getByLabel('Layer stack, back to front').locator('[data-layer-row]').first()).toBeVisible({ timeout: 60_000 });
    await craft.getByRole('link', { name: 'Cut', exact: true }).click();
    await expect(page).toHaveURL(/\/make\/output$/);
    await page.reload(); await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alpine forest');
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Home', exact: true }).click();
    const card = page.getByRole('region', { name: 'Your crafts' }).getByRole('article', { name: 'Alpine forest' });
    await expect(card).toContainText('Step 3 of 4 · Cut');
    await card.getByRole('button', { name: 'Open Alpine forest' }).click();
    await expect(page).toHaveURL(/\/make\/output$/);
  });

  test('the rail opens the current craft where you left it', async ({ page }) => {
    await cameraFromHome(page);
    await page.getByRole('button', { name: 'Take photo' }).click();
    await page.getByRole('main').getByRole('button', { name: 'Analyze' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Photo · /);
    await expect(page).toHaveURL(/\/make\/layers$/);
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/workshop$/);
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: /^Current craft: / }).click();
    await expect(page).toHaveURL(/\/make\/layers$/);
  });
});
