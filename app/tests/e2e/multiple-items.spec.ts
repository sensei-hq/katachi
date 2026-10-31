import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hasMetaKey } from './invite';
import { uploadFromHome } from './start';

// samples/multiple/bookmarks.avif: five separate finished objects. Spark must say multiple-items,
// SAM's one generic call returns five instance masks, and each bookmark becomes its own layer/sheet.
const sample = readFileSync(new URL('../../../samples/multiple/bookmarks.avif', import.meta.url));
const main = (page: Page) => page.getByRole('main');

test.describe('multiple items · bookmarks (1440px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(300_000);

  test('five bookmarks separate into five independent cuts', async ({ page }) => {
    test.skip(!hasMetaKey(), 'needs a live META_API_KEY for SAM instance masks');
    await uploadFromHome(page, [{ name: 'bookmarks.avif', mimeType: 'image/avif', buffer: sample }]);
    await expect(main(page).getByRole('img', { name: 'Photo view' })).toBeVisible();

    const sceneRes = page.waitForResponse((r) => r.url().includes('/api/scene') && r.request().method() === 'POST', { timeout: 120_000 });
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/);
    const scene = await (await sceneRes).json();
    expect(scene.brief.arrangement).toBe('multiple-items');
    expect(scene.brief.regions.length).toBeGreaterThanOrEqual(5);
    const chat = page.getByRole('complementary', { name: 'Katachi chat' });
    await expect(chat.locator('[data-timeline-entry="step"]').filter({ hasText: /Found \d+ items/ })).toBeVisible({ timeout: 240_000 });
    await expect(page.getByLabel('Items and layers')).toContainText(/bookmark/i, { timeout: 120_000 });
    await page.screenshot({ path: 'test-results/sample/bookmarks-layers.png' });

    await page.getByRole('complementary', { name: 'Katachi chat' }).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/);
    await expect.poll(async () => page.locator('[data-sheet-svg]:visible').count(), { timeout: 180_000 }).toBeGreaterThanOrEqual(4);
    await page.screenshot({ path: 'test-results/sample/bookmarks-sheets.png' });
  });
});

// The same photo with Muse replayed (CI has no Meta key): Spark says four separate items, SAM returns one
// instance mask each. Analyze finds the four items and gives each its own layer — said in the chat as it happens.
test.describe('multiple items · bookmarks, replayed', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);
  const names = ['Fox bookmark', 'Owl bookmark', 'Leaf bookmark', 'Moon bookmark'];
  const brief = { subject: 'four laser-cut bookmarks', class: 'flat', arrangement: 'multiple-items', likelyMaterial: 'wood', subjectPrompt: 'bookmark',
    regions: names.map((label, i) => ({ id: `b${i + 1}`, label, samPrompt: 'bookmark', likelyBought: false, note: '' })), items: names, colourGroupsHint: 1, reference: null, topDownConfidence: 0.9, notes: '', realSizeMm: { w: 50, h: 180, basis: 'a typical bookmark' } };
  const rect = (x: number): [number, number][] => [[x, 150], [x + 160, 150], [x + 160, 850], [x, 850]];

  test('four items, each its own layer: found, split and listed — live in the chat', async ({ page }) => {
    await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [] } }));
    await page.route('**/api/segment', async (r: Route) => {
      const body = r.request().postDataJSON() ?? {};
      if (Array.isArray(body.regions)) return r.fulfill({ json: { regions: body.regions.map((x: { id: string; label: string }, i: number) => ({ ...x, areaPct: 11, paths: [rect(60 + i * 230)], keep: true, itemId: x.id, itemName: x.label })), source: 'live', trace: [] } });
      return r.fulfill({ json: { boxes: [{ x1: 60, y1: 150, x2: 940, y2: 850 }], masks: names.map((_, i) => ({ w: 320, h: 320, ones: 0, paths: [rect(60 + i * 230)] })), source: 'live', trace: [] } });
    });
    await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: 'Four bookmarks', conversionClass: 'flat', pieces: [], variations: [], source: 'live', trace: [] } }));
    await uploadFromHome(page, [{ name: 'bookmarks.avif', mimeType: 'image/avif', buffer: sample }]);
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/);
    const chat = page.getByRole('complementary', { name: 'Katachi chat' });
    const step = (t: RegExp) => chat.locator('[data-timeline-entry="step"]').filter({ hasText: t }).last();
    await expect(step(/Found 4 items/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(step(/Found 4 items/)).toContainText(/Fox bookmark.*Owl bookmark.*Leaf bookmark.*Moon bookmark/);
    // wooden items: each is a cut outline plus its engraving (engraving runs first), sized from the typical bookmark
    await expect(step(/4 items · \d+ layers/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(step(/Found 4 items/)).toContainText(/Fox bookmark \(\d+ × \d+ mm\)/);
    const aside = page.getByLabel('Items and layers');
    for (const n of names) { await expect(aside.getByRole('region', { name: `Item: ${n}` })).toBeVisible(); await expect(aside.getByRole('region', { name: `Item: ${n}` })).toContainText(/\d+ × \d+ mm/); await expect(aside.getByRole('region', { name: `Item: ${n}` })).toContainText('· cut'); }
    await expect(aside).toContainText('4 items');
    await page.screenshot({ path: 'test-results/sample/bookmarks-replayed.png' });
  });
});
