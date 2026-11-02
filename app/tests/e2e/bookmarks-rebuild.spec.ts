import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { uploadFromHome } from './start';
import { difference, fromLoops, toLoops, type Geometry } from '../../src/lib/domain/geo';

// The five fanned bookmarks as SAM really sees them: each bookmark's mask is only what shows. A neighbour lying on
// top takes a bite out of it, and so does a tassel. The bookmarks are measured on the photo (1588 × 1271) as
// their four corners, stacked the way they lie:
// the whale at the back, the fox and the butterfly on it, the elephant on the fox, the phoenix on the butterfly,
// and the tassels across the elephant's and the fox's left edges and the phoenix's right edge: all five are bitten somewhere.
// Everything after the replayed brief and masks is the app's own code on the real pixels: holes and engraving,
// straightening each one upright, filling in the hidden edges, and the clean-up pass.
const sample = (p: string) => readFileSync(new URL(`../../../samples/${p}`, import.meta.url));
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();

const W = 1588, H = 1271;
const at = (pts: number[][]): [number, number][] => pts.map(([x, y]) => [Math.round((x / W) * 10000) / 10, Math.round((y / H) * 10000) / 10]);
const card: Record<string, [number, number][]> = {
  Elephant: at([[88, 362], [300, 310], [590, 1138], [352, 1192]]),
  Fox: at([[376, 252], [578, 205], [766, 1008], [592, 1062]]),
  Whale: at([[690, 172], [928, 150], [945, 985], [768, 995]]),
  Butterfly: at([[1000, 232], [1246, 250], [1092, 1074], [838, 1028]]),
  Phoenix: at([[1262, 342], [1530, 384], [1296, 1176], [1034, 1110]]),
  // the elephant's white tassel hangs across its left edge
  tassel: at([[10, 430], [150, 425], [168, 810], [5, 812]]),
  // and the phoenix's copper tassel across its right edge
  tassel2: at([[1455, 400], [1575, 405], [1588, 790], [1440, 792]]),
  // and the fox's gold tassel across its top left edge
  tassel3: at([[345, 290], [425, 290], [430, 520], [340, 520]])
};
/** what lies on top of each bookmark */
const over: Record<string, string[]> = { Whale: ['Fox', 'Butterfly', 'Elephant', 'Phoenix'], Fox: ['Elephant', 'tassel3'], Butterfly: ['Phoenix'], Elephant: ['tassel'], Phoenix: ['tassel2'] };
const names = ['Elephant', 'Fox', 'Whale', 'Butterfly', 'Phoenix'];
const g = (k: string): Geometry => fromLoops([card[k]]);
/** the mask SAM gives: the card less everything on top of it (the biggest piece that shows) */
function shows(k: string): [number, number][] {
  let v = g(k);
  for (const o of over[k]) v = difference(v, g(o));
  const loops = toLoops(v).sort((a, b) => area(b) - area(a));
  return loops[0].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]);
}
const area = (l: [number, number][]) => Math.abs(l.reduce((a, [x, y], i) => { const [u, v] = l[(i + 1) % l.length]; return a + x * v - u * y; }, 0)) / 2;

async function replay(page: Page) {
  const labels = names.map((n) => `${n} bookmark`);
  const masks = names.map(shows);
  const brief = { subject: 'five laser-cut wooden bookmarks', class: 'flat', arrangement: 'multiple-items', likelyMaterial: 'wood', subjectPrompt: 'five laser-cut wooden bookmarks',
    regions: labels.map((label, i) => ({ id: `i${i + 1}`, label, samPrompt: label, likelyBought: false, note: '' })), items: labels, colourGroupsHint: 1, reference: null, topDownConfidence: 0.9, notes: '', realSizeMm: { w: 50, h: 180, basis: 'a typical bookmark' } };
  await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [] } }));
  await page.route('**/api/segment', async (r: Route) => {
    const body = r.request().postDataJSON() ?? {};
    if (Array.isArray(body.regions)) return r.fulfill({ json: { regions: body.regions.map((x: { id: string; label: string }, i: number) => ({ ...x, areaPct: 9, paths: [masks[i]], keep: true, itemId: x.id, itemName: x.label })), source: 'live', trace: [] } });
    return r.fulfill({ json: { boxes: [{ x1: 30, y1: 30, x2: 970, y2: 970 }], masks: masks.map((o) => ({ w: 320, h: 320, ones: 0, paths: [o] })), source: 'live', trace: [] } });
  });
  await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: 'bookmarks', conversionClass: 'flat', pieces: [], variations: [], source: 'live', trace: [] } }));
  await page.route('**/api/layer-op', (r: Route) => r.fulfill({ json: { answer: { op: 'none', colour: '', other: '', reply: '' }, source: 'live', trace: [] } }));
  return masks;
}

test.describe('bookmarks · overlapping, rebuilt whole', () => {
  test.use({ viewport: { width: 1440, height: 1500 } });
  test.setTimeout(240_000);

  test('all five are partly hidden and get their missing parts back; all five come out upright, cleaned up, one per sheet', async ({ page }) => {
    const masks = await replay(page);
    // the masks really are bitten: every one shows less than its whole card
    const hidden = names.filter((n, i) => area(masks[i]) < area(card[n]) * 0.99);
    expect(hidden).toEqual(names);
    await uploadFromHome(page, [{ name: 'bookmarks.avif', mimeType: 'image/avif', buffer: sample('multiple/bookmarks.avif') }]);
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/, { timeout: 30_000 });
    await expect(step(page, /Found 5 items/)).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    // perspective first: the cards shot at an angle are keystones, corrected to true rectangles before straighten
    const persp = step(page, /Corrected the perspective of \d+ items?/);
    await expect(persp).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    console.log('PERSPECTIVE', (await persp.innerText()).replace(/\s+/g, ' '));
    // upright: each turned along its long axis
    const upright = step(page, 'Each of the 5 items is on its own sheet, upright');
    await expect(upright).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    await expect(upright).toContainText(/turned .*Elephant bookmark .*°/);
    // the missing parts: all five are filled in from what shows of them
    const filled = step(page, /Filled in the hidden edges of/);
    await expect(filled).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    for (const n of hidden) await expect(filled).toContainText(`${n} bookmark`);
    // one set, one size: like the one the photo shows squarest and whole
    const same = step(page, /the same size as their set/);
    await expect(same).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    console.log('SAME', (await same.innerText()).replace(/\s+/g, ' '));
    // the clean-up pass
    await expect(step(page, /Cleaned up \d+ layers/)).toHaveAttribute('data-step-status', 'done', { timeout: 120_000 });
    // each one sized as cut: upright, a bookmark's proportions (about 50 × 180 mm)
    await page.screenshot({ path: 'test-results/bookmarks-rebuild/1-layers.png' });
    // the five as generated: Cut, one sheet per bookmark
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    const sheets = main(page).getByRole('region', { name: 'Sheets' });
    await expect(sheets).toHaveAttribute('data-plan-sheets', '5', { timeout: 30_000 });
    await expect(main(page).locator('[data-plan-sheet]')).toHaveCount(5);
    await sheets.screenshot({ path: 'test-results/bookmarks-rebuild/2-the-five.png' });
    // each sheet's piece, as cut: upright, a bookmark's proportions (about 50 × 180 mm)
    const sizes = (await main(page).locator('[data-plan-sheet]').evaluateAll((els) => els.map((e) => e.closest('div.rounded-lg')?.textContent ?? '')))
      .map((t) => { const m = t.match(/(\d+) × (\d+) mm/)!; return [t.replace(/\s+/g, ' ').trim().slice(0, 30), Number(m[1]), Number(m[2])] as [string, number, number]; });
    console.log('SIZES', JSON.stringify(sizes));
    expect(sizes).toHaveLength(5);
    for (const [n, w, h] of sizes) {
      expect(h / w, `${n}: ${w} × ${h} mm`).toBeGreaterThan(2.8);
      expect(Math.abs(w - sizes[0][1]), `${n}: one width`).toBeLessThanOrEqual(1);
      expect(Math.abs(h - sizes[0][2]), `${n}: one length`).toBeLessThanOrEqual(1);
      expect(h / w, `${n}: ${w} × ${h} mm`).toBeLessThan(4.2);
    }
  });
});
