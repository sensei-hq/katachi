import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { uploadFromHome } from './start';

// The run that failed live (11/2): a note with the photo ("remove the hook wires, smoothen the curves… on a single
// board"), Spark listing each earring as a pendant on a bought hook, items with no top-level regions; then, from the
// cut queue, "lay the earrings on a single board". The items must be found, the note done, and the layout said
// anywhere must reach Cut — never the old mug-and-card scene demo.
const sample = (p: string) => readFileSync(new URL(`../../../samples/${p}`, import.meta.url));
const masks = JSON.parse(readFileSync(new URL('./fixtures/earrings-masks.json', import.meta.url), 'utf8')) as [number, number][][];
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();
async function say(page: Page, text: string) {
  const box = chat(page).locator('[data-chat-composer]').getByRole('textbox');
  await box.fill(text); await box.press('Enter');
}

async function replay(page: Page) {
  const names = masks.map((_, i) => `earring ${i + 1}`);
  // items only, each a wood pendant on a bought fish hook; no top-level regions
  const items = names.map((label, i) => ({ id: `e${i + 1}`, label, samPrompt: label, arrangement: 'stacked', regions: [{ id: `e${i + 1}-p`, label: 'wood pendant', samPrompt: 'wooden pendant', likelyBought: false, note: '' }, { id: `e${i + 1}-h`, label: 'fish hook', samPrompt: 'metal fish hook', likelyBought: true, note: 'bought' }] }));
  const brief = { subject: 'Set of 14 pairs of wooden laser-cut dangle earrings', class: 'pattern-shape', arrangement: 'multiple-items', likelyMaterial: 'wood', subjectPrompt: 'wooden earrings',
    regions: [], items, colourGroupsHint: 1, reference: null, topDownConfidence: 0.9, notes: '28 earrings = 14 left/right pairs in 4 rows', realSizeMm: { w: 40, h: 70, basis: 'one pendant' } };
  await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [] } }));
  await page.route('**/api/segment', async (r: Route) => {
    const body = r.request().postDataJSON() ?? {};
    // what the server returns for items: one region per item, outlined (the sam unit tests cover how)
    if (Array.isArray(body.items) && body.items.length) return r.fulfill({ json: { regions: body.items.map((x: { id: string; label: string }, i: number) => ({ id: x.id, label: x.label, samPrompt: x.label, areaPct: 2, paths: [masks[i]], keep: true, itemId: x.id, itemName: x.label })), source: 'live', trace: [] } });
    return r.fulfill({ json: { boxes: [{ x1: 30, y1: 30, x2: 970, y2: 970 }], masks: masks.map((o) => ({ w: 320, h: 320, ones: 0, paths: [o] })), source: 'live', trace: [] } });
  });
  await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: 'earrings', conversionClass: 'flat', pieces: [], variations: [], source: 'live', trace: [] } }));
}

test.describe('earrings · a note with the photo, and the layout said from anywhere', () => {
  test.use({ viewport: { width: 1440, height: 1200 } });
  test.setTimeout(300_000);

  test('items found from items-only; hooks off and one board, as asked; "lay the earrings on a single board" from the cut queue', async ({ page }) => {
    await replay(page);
    await uploadFromHome(page, [{ name: 'earrings.avif', mimeType: 'image/avif', buffer: sample('multiple/earrings.avif') }]);
    await say(page, 'remove the hook wires, smoothen the curves, there are 14 pairs of earrings cut on a single board');
    await expect(page).toHaveURL(/\/make\/layers$/, { timeout: 30_000 });
    await expect(step(page, /Found \d+ items/)).toBeVisible({ timeout: 120_000 });
    await expect(steps(page).filter({ hasText: 'No items found yet' })).toHaveCount(0);
    const clean = step(page, /Cleaned up \d+ layers/);
    await expect(clean).toHaveAttribute('data-step-status', 'done', { timeout: 180_000 });
    await expect(clean).toContainText('hooks removed (holes kept)');
    // pairs by shape, on Layers
    await expect.poll(async () => main(page).locator('[data-item-group]').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
    // the note's "on a single board": the layout is fit to board
    await expect(step(page, /Fit to board: \d+ sheet/)).toBeVisible({ timeout: 30_000 });

    // to the cut queue, and say it from there
    await page.goto('/make/output');
    await expect(main(page).locator('[data-sheet-layouts]')).toBeVisible({ timeout: 30_000 });
    await main(page).locator('[data-sheet-layouts]').getByRole('radio', { name: 'One per sheet' }).click();
    const many = Number(await main(page).getByRole('region', { name: 'Sheets' }).getAttribute('data-plan-sheets'));
    await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: /Cut queue/ }).click();
    await expect(page).toHaveURL(/\/queue$/);
    await say(page, 'lay the earrings on a single board');
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    await expect.poll(async () => Number(await main(page).getByRole('region', { name: 'Sheets' }).getAttribute('data-plan-sheets')), { timeout: 60_000 }).toBeLessThan(many);
    await expect(chat(page)).not.toContainText('mug');
    await main(page).getByRole('region', { name: 'Sheets' }).screenshot({ path: 'test-results/note/earrings-one-board.png' });
  });
});
