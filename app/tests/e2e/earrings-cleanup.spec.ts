import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { uploadFromHome } from './start';

// The earrings tray as SAM sees it live: each earring its own silhouette (fixtures/earrings-masks.json — the 24
// earrings found on the photo, in reading order; the one by the branch at the top right is left out), named the way
// live Spark names them ("top row earring 3"). Everything after is the app's code on the real pixels: the holes,
// pairs found by shape, the clean-up (tidy, repeat-pattern, symmetry, smoothing) and same size per pair.
const sample = (p: string) => readFileSync(new URL(`../../../samples/${p}`, import.meta.url));
const masks = JSON.parse(readFileSync(new URL('./fixtures/earrings-masks.json', import.meta.url), 'utf8')) as [number, number][][];
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();

async function replay(page: Page) {
  const names = masks.map((_, i) => `${['top', 'second', 'third', 'bottom'][Math.min(3, Math.floor(i / 6.1))]} row earring ${i + 1}`);
  const brief = { subject: 'laser-cut wooden earrings', class: 'flat', arrangement: 'multiple-items', likelyMaterial: 'wood', subjectPrompt: 'laser-cut wooden earrings',
    regions: names.map((label, i) => ({ id: `i${i + 1}`, label, samPrompt: label, likelyBought: false, note: '' })), items: names, colourGroupsHint: 1, reference: null, topDownConfidence: 0.9, notes: '', realSizeMm: { w: 40, h: 70, basis: 'a typical drop earring' } };
  await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [] } }));
  await page.route('**/api/segment', async (r: Route) => {
    const body = r.request().postDataJSON() ?? {};
    if (Array.isArray(body.regions)) return r.fulfill({ json: { regions: body.regions.map((x: { id: string; label: string }, i: number) => ({ ...x, areaPct: 2, paths: [masks[i]], keep: true, itemId: x.id, itemName: x.label })), source: 'live', trace: [] } });
    return r.fulfill({ json: { boxes: [{ x1: 30, y1: 30, x2: 970, y2: 970 }], masks: masks.map((o) => ({ w: 320, h: 320, ones: 0, paths: [o] })), source: 'live', trace: [] } });
  });
  await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: 'earrings', conversionClass: 'flat', pieces: [], variations: [], source: 'live', trace: [] } }));
  await page.route('**/api/layer-op', (r: Route) => r.fulfill({ json: { answer: { op: 'none', colour: '', other: '', reply: '' }, source: 'live', trace: [] } }));
}

test.describe('earrings · clean-up on the real tray', () => {
  test.use({ viewport: { width: 1440, height: 1500 } });
  test.setTimeout(300_000);

  test('24 earrings in pairs; repeated holes evened out, outlines smoothed, each pair one size — before and after', async ({ page }) => {
    await replay(page);
    await uploadFromHome(page, [{ name: 'earrings.avif', mimeType: 'image/avif', buffer: sample('multiple/earrings.avif') }]);
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/, { timeout: 30_000 });
    await expect(step(page, /Found 24 items/)).toHaveAttribute('data-step-status', 'done', { timeout: 90_000 });
    await expect(step(page, 'Background removed')).toContainText('SAM 3.1 outlines each item next');
    const clean = step(page, /Cleaned up \d+ layers/);
    await expect(clean).toHaveAttribute('data-step-status', 'done', { timeout: 180_000 });
    for (const s of [/Corrected the perspective|No perspective/, /upright/, /Filled in|Nothing is hidden/, /same size/, /Cleaned up/]) {
      const e = step(page, s);
      if (await e.count()) console.log('STEP', (await e.innerText()).replace(/\s+/g, ' ').slice(0, 400));
    }
    // the photo shows through each earring's own outline (not the colour pass's fragments), clearly
    const stage = main(page).locator('[data-work-area] [data-photo-stage]').first();
    await expect.poll(async () => stage.locator('clipPath[id$="-subject"] path').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(24);
    expect(Number(await stage.locator('image[clip-path$="-subject)"]').getAttribute('opacity'))).toBeGreaterThanOrEqual(0.5);
    await main(page).locator('[data-work-area]').screenshot({ path: 'test-results/cleanup/earrings-all-layers.png' });
    // the children of the clean-up (one undo): what each found
    // pairs: twelve, found by shape
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    const panel = chat(page).getByRole('region', { name: 'Output' });
    await panel.getByRole('radio', { name: 'Pairs together' }).click({ timeout: 15_000 });
    await expect(panel.locator('[data-cut-plan]')).toHaveAttribute('data-sheets', '12', { timeout: 60_000 });
    const sheets = main(page).getByRole('region', { name: 'Sheets' });
    await expect(sheets).toHaveAttribute('data-plan-sheets', '12', { timeout: 30_000 });
    await sheets.screenshot({ path: 'test-results/cleanup/earrings-after.png' });
    // before: the clean-up undone
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Layers' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/, { timeout: 30_000 });
    await main(page).getByRole('toolbar', { name: 'Layer tools' }).getByRole('button', { name: 'Undo' }).click();
    await expect(step(page, /Undone: Cleaned up/)).toBeVisible({ timeout: 30_000 });
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    await expect(sheets).toHaveAttribute('data-plan-sheets', '12', { timeout: 30_000 });
    await sheets.screenshot({ path: 'test-results/cleanup/earrings-before.png' });
  });

  test('Assemble keeps the pairs: each pair’s two earrings one after the other, side by side, named by their pair', async ({ page }) => {
    await replay(page);
    await uploadFromHome(page, [{ name: 'earrings.avif', mimeType: 'image/avif', buffer: sample('multiple/earrings.avif') }]);
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(step(page, /Cleaned up \d+ layers/)).toHaveAttribute('data-step-status', 'done', { timeout: 180_000 });
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Assemble' }).click();
    await expect(page).toHaveURL(/\/make\/assemble$/, { timeout: 30_000 });
    const cards = main(page).locator('article[aria-label^="Layer "]');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const eyebrows = (await cards.locator('.eyebrow').allInnerTexts()).map((t) => t.trim());
    console.log('ASSEMBLE', eyebrows.slice(0, 8).join(' | '));
    const pairOf = eyebrows.map((t) => /^(pair[^·]*?)(\s·|$)/i.exec(t)?.[1]?.trim() ?? null);
    expect(pairOf.filter(Boolean).length).toBeGreaterThanOrEqual(20);
    // every pair's two cards are next to each other
    for (const name of new Set(pairOf.filter(Boolean))) {
      const at = pairOf.map((p, i) => (p === name ? i : -1)).filter((i) => i >= 0);
      expect(at.length, name!).toBe(2);
      expect(at[1] - at[0], name!).toBe(1);
    }
    await main(page).screenshot({ path: 'test-results/cleanup/earrings-assemble.png' });
  });
});
