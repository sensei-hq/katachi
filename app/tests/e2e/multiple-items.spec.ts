import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hasMetaKey } from './invite';

// samples/multiple/bookmarks.avif: five separate finished objects. Spark must say multiple-items,
// SAM's one generic call returns five instance masks, and each bookmark becomes its own layer/sheet.
const sample = readFileSync(new URL('../../../samples/multiple/bookmarks.avif', import.meta.url));
const main = (page: Page) => page.getByRole('main');

test.describe('multiple items · bookmarks (1440px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(300_000);

  test('five bookmarks separate into five independent cuts', async ({ page }) => {
    test.skip(!hasMetaKey(), 'needs a live META_API_KEY for SAM instance masks');
    await page.goto('/workshop'); await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Layered picture/ }).click();
    await page.setInputFiles('input[type="file"]', [{ name: 'bookmarks.avif', mimeType: 'image/avif', buffer: sample }]);
    await expect(main(page).getByRole('img', { name: 'Photo view' })).toBeVisible();

    const sceneRes = page.waitForResponse((r) => r.url().includes('/api/scene') && r.request().method() === 'POST', { timeout: 120_000 });
    await main(page).getByRole('button', { name: 'Continue' }).click();
    const scene = await (await sceneRes).json();
    expect(scene.brief.arrangement).toBe('multiple-items');
    expect(scene.brief.regions.length).toBeGreaterThanOrEqual(5);

    const segRes = page.waitForResponse((r) => r.url().includes('/api/segment'), { timeout: 180_000 });
    await main(page).getByRole('button', { name: 'Find the outline' }).click();
    await segRes;
    const itemsRes = page.waitForResponse((r) => r.url().includes('/api/segment'), { timeout: 180_000 });
    await main(page).getByRole('button', { name: 'Find the objects' }).click();
    const seg = await (await itemsRes).json();
    const withPaths = (seg.regions as { paths?: unknown[] }[]).filter((r) => (r.paths?.length ?? 0) > 0);
    expect(withPaths.length).toBeGreaterThanOrEqual(4);

    await main(page).getByRole('button', { name: /Separate into layers/ }).click();
    await expect(page).toHaveURL(/\/make\/layers$/);
    const list = page.getByRole('navigation', { name: 'Layer stack, back to front' });
    await expect.poll(async () => list.getByRole('button').count(), { timeout: 120_000 }).toBeGreaterThanOrEqual(10); // 5 items + hide toggles
    await expect(list).toContainText('bookmark', { timeout: 120_000 });
    await page.screenshot({ path: 'test-results/sample/bookmarks-layers.png' });

    await main(page).getByRole('button', { name: /gaps/i }).first().click();
    await main(page).getByRole('button', { name: /Stack & cut/ }).click();
    await expect(page).toHaveURL(/\/make\/output$/);
    await expect.poll(async () => page.locator('[data-sheet-svg]:visible').count(), { timeout: 180_000 }).toBeGreaterThanOrEqual(4);
    await page.screenshot({ path: 'test-results/sample/bookmarks-sheets.png' });
  });
});
