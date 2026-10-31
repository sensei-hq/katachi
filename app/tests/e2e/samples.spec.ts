import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { uploadFromHome } from './start';

// The sample crafts end to end, on the real photos. The Meta models are replayed (no key in CI): Spark's brief and
// SAM's outlines are what they return for these photos (outlines placed by hand around each object); everything
// after that — holes, engraving, straightening, filling in what neighbours hide, reading a cut plan, edits by name
// or number, undo — is the app's own code running on the real pixels.
const sample = (p: string) => readFileSync(new URL(`../../../samples/${p}`, import.meta.url));
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();
async function say(page: Page, text: string) {
  const box = chat(page).locator('[data-chat-composer]').getByRole('textbox');
  await box.fill(text); await box.press('Enter');
}
const rows = (page: Page) => page.getByLabel('Items and layers').locator('[data-layer-row]');

/** Spark says "separate items" in wood; SAM gives each item its outline (0-1000 photo units) */
async function replayItems(page: Page, { subject, names, outlines, realSizeMm, areaPct }: { subject: string; names: string[]; outlines: [number, number][][]; realSizeMm: { w: number; h: number; basis: string }; /** how much of the photo each item covers */ areaPct: number }) {
  const brief = { subject, class: 'flat', arrangement: 'multiple-items', likelyMaterial: 'wood', subjectPrompt: subject,
    regions: names.map((label, i) => ({ id: `i${i + 1}`, label, samPrompt: label, likelyBought: false, note: '' })), items: names, colourGroupsHint: 1, reference: null, topDownConfidence: 0.9, notes: '', realSizeMm };
  await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [] } }));
  await page.route('**/api/segment', async (r: Route) => {
    const body = r.request().postDataJSON() ?? {};
    if (Array.isArray(body.regions)) return r.fulfill({ json: { regions: body.regions.map((x: { id: string; label: string }, i: number) => ({ ...x, areaPct, paths: [outlines[i]], keep: true, itemId: x.id, itemName: x.label })), source: 'live', trace: [] } });
    return r.fulfill({ json: { boxes: [{ x1: 30, y1: 30, x2: 970, y2: 970 }], masks: outlines.map((o) => ({ w: 320, h: 320, ones: 0, paths: [o] })), source: 'live', trace: [] } });
  });
  await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: subject, conversionClass: 'flat', pieces: [], variations: [], source: 'live', trace: [] } }));
  // a free-text edit Spark cannot map to a mask op: the app's own stack commands take it
  await page.route('**/api/layer-op', (r: Route) => r.fulfill({ json: { answer: { op: 'none', colour: '', other: '', reply: '' }, source: 'live', trace: [] } }));
}
// outlines from corner points measured on a picture of size w × h
const quad = (w: number, h: number, pts: number[][]) => pts.map(([x, y]) => [Math.round((x / w) * 1000), Math.round((y / h) * 1000)] as [number, number]);
const box = (w: number, h: number, x1: number, y1: number, x2: number, y2: number) => quad(w, h, [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]);

test.describe('samples · end to end', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test('bookmarks: five overlapping fretwork items → holes cut, engraving, straightened, hidden edges filled; edits and undo', async ({ page }) => {
    const names = ['Elephant bookmark', 'Fox bookmark', 'Whale bookmark', 'Butterfly bookmark', 'Phoenix bookmark'];
    const W = 800, H = 640;
    // SAM's mask is what shows: the whale lies under the fox and the butterfly, so its outline has a bite out of it
    const outlines = [[[42, 183], [155, 157], [296, 555], [165, 597]], [[190, 125], [300, 103], [385, 515], [275, 535]], [[348, 85], [468, 78], [490, 495], [385, 500], [380, 440], [425, 430], [415, 300], [364, 290]],
      [[500, 130], [625, 125], [580, 540], [425, 525]], [[645, 160], [770, 180], [690, 590], [525, 565]]].map((p) => quad(W, H, p));
    await replayItems(page, { subject: 'five laser-cut wooden bookmarks', names, outlines, realSizeMm: { w: 50, h: 180, basis: 'a typical bookmark' }, areaPct: 9 });
    await uploadFromHome(page, [{ name: 'bookmarks.avif', mimeType: 'image/avif', buffer: sample('multiple/bookmarks.avif') }]);
    await expect(chat(page)).toContainText('Your picture is in. Press Analyze');
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/, { timeout: 30_000 });
    await expect(step(page, /Found 5 items/)).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    // the passes after the layers: align & straighten, then interpolation for the ones a neighbour lies over
    await expect(step(page, 'Each of the 5 items is on its own sheet, upright')).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    await expect(step(page, 'Each of the 5 items is on its own sheet, upright')).toContainText(/turned .*°/);
    await expect(step(page, /Filled in the hidden edges of .*Whale bookmark/)).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    // fretwork: each bookmark's sheet cuts its holes out
    const aside = page.getByLabel('Items and layers');
    for (const n of names) await expect(aside.getByRole('region', { name: `Item: ${n}` })).toBeVisible();
    // the engraving of each bookmark is its own pass (the dark see-through areas are holes in the cut)
    await expect(aside.locator('[data-layer-row]').filter({ hasText: /engraving/ })).not.toHaveCount(0);
    // sized as cut: upright, so taller than wide
    const size = (await aside.getByRole('region', { name: 'Item: Elephant bookmark' }).innerText()).match(/(\d+) × (\d+) mm/)!;
    expect(Number(size[2])).toBeGreaterThan(Number(size[1]) * 2);
    await page.screenshot({ path: 'test-results/samples/bookmarks-1-layers.png' });
    const count = await rows(page).count();
    expect(count).toBeGreaterThanOrEqual(5);
    // edits by number, then undo puts it back
    await say(page, 'delete layer 2');
    await expect(step(page, /Deleted Fox bookmark/)).toBeVisible();
    await expect(rows(page)).toHaveCount(count - 1);
    await say(page, 'undo');
    await expect(step(page, /Undone: Deleted Fox bookmark/)).toBeVisible();
    await expect(rows(page)).toHaveCount(count);
    await main(page).getByRole('toolbar', { name: 'Layer tools' }).getByRole('radio', { name: 'Its sheet' }).click();
    await expect(main(page).locator('[data-cut-sheet]')).toBeVisible();
    await page.screenshot({ path: 'test-results/samples/bookmarks-2-sheet.png' });
    // to the end: Cut → the queue takes 5 sheets (one per bookmark, engraving and cut together)
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
    await expect(step(page, 'Added 5 sheets to the cut queue')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('navigation', { name: 'Studio sections' }).locator('[data-badge]')).toHaveText('5');
    await chat(page).getByRole('link', { name: 'Open the cut queue' }).last().click();
    await expect(page).toHaveURL(/\/queue$/, { timeout: 30_000 });
    const bed = main(page).getByRole('region', { name: 'On the bed' });
    const queue = main(page).getByRole('complementary', { name: 'Queue' });
    await expect(queue.getByRole('listitem')).toHaveCount(5);
    await bed.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '6×' }).click();
    await queue.getByRole('button', { name: 'Start' }).click();
    await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
    await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', /weeding|cut/, { timeout: 60_000 });
    await page.screenshot({ path: 'test-results/samples/bookmarks-3-queue.png' });
    // Assemble: one cell per bookmark on the stack stage, as layers to stack
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Assemble' }).click();
    await expect(page).toHaveURL(/\/make\/assemble$/, { timeout: 30_000 });
    const cards = main(page).getByRole('region', { name: 'Layers to stack' }).getByRole('article');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const items = await cards.evaluateAll((els) => [...new Set(els.map((e) => e.querySelector('.eyebrow')?.textContent?.split('·')[0].trim() ?? ''))]);
    expect(items).toHaveLength(5);
    await expect(main(page).locator('[data-stack-stage]')).toBeAttached();
    await page.screenshot({ path: 'test-results/samples/bookmarks-4-assemble.png' });
  });

  test('earrings: cut-through items, no empty engraving layers; merge by name, delete with the button, undo', async ({ page }) => {
    const W = 800, H = 729;
    const placed: [string, number[]][] = [['Lattice teardrop left', [36, 45, 132, 185]], ['Lattice teardrop right', [138, 45, 232, 185]], ['Open teardrop left', [385, 48, 482, 185]], ['Open teardrop right', [497, 48, 595, 185]],
      ['Swirl drop left', [265, 365, 360, 522]], ['Swirl drop right', [372, 365, 468, 522]], ['Mandala circle left', [487, 370, 620, 530]], ['Mandala circle right', [632, 370, 768, 530]]];
    await replayItems(page, { subject: 'laser-cut wooden earrings', names: placed.map(([n]) => n), outlines: placed.map(([, b]) => box(W, H, b[0], b[1], b[2], b[3])), realSizeMm: { w: 40, h: 70, basis: 'a typical drop earring' }, areaPct: 2 });
    await uploadFromHome(page, [{ name: 'earrings.avif', mimeType: 'image/avif', buffer: sample('multiple/earrings.avif') }]);
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(step(page, /Found 8 items/)).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    await expect(step(page, /Each of the 8 items is on its own sheet/)).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    // no layer that shows nothing
    const pcts = await rows(page).evaluateAll((els) => els.map((e) => Number(e.textContent?.match(/([\d.]+)% shows/)?.[1] ?? '1')));
    expect(pcts.filter((p) => p === 0)).toEqual([]);
    await page.screenshot({ path: 'test-results/samples/earrings-1-layers.png' });
    const count = await rows(page).count();
    // two layers by name become one
    await say(page, 'merge the swirl drop left and the swirl drop right');
    await expect(rows(page)).toHaveCount(count - 1);
    await say(page, 'undo');
    await expect(rows(page)).toHaveCount(count);
    // the layer's own Delete
    await rows(page).first().getByRole('button').first().click();
    await rows(page).first().getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Delete this layer' }).click();
    await expect(rows(page)).toHaveCount(count - 1);
    await main(page).getByRole('toolbar', { name: 'Layer tools' }).getByRole('button', { name: 'Undo' }).click();
    await expect(rows(page)).toHaveCount(count);
    await page.screenshot({ path: 'test-results/samples/earrings-2-undo.png' });
    // to the queue: one sheet per earring until the L3 layout choice lands
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
    await expect(step(page, 'Added 8 sheets to the cut queue')).toBeVisible({ timeout: 30_000 });
    await chat(page).getByRole('link', { name: 'Open the cut queue' }).last().click();
    await expect(page).toHaveURL(/\/queue$/, { timeout: 30_000 });
    await expect(main(page).getByRole('complementary', { name: 'Queue' }).getByRole('listitem')).toHaveCount(8);
    await page.screenshot({ path: 'test-results/samples/earrings-3-queue.png' });
  });

  test.fixme('earrings: with the "pairs together" layout (L3), each left + right pair shares one sheet', async ({ page }) => {
    // The Cut page has no layout choice yet (Claude's L3 work): one earring per sheet until it lands.
    const W = 800, H = 729;
    const placed: [string, number[]][] = [['Lattice teardrop left', [36, 45, 132, 185]], ['Lattice teardrop right', [138, 45, 232, 185]], ['Open teardrop left', [385, 48, 482, 185]], ['Open teardrop right', [497, 48, 595, 185]],
      ['Swirl drop left', [265, 365, 360, 522]], ['Swirl drop right', [372, 365, 468, 522]], ['Mandala circle left', [487, 370, 620, 530]], ['Mandala circle right', [632, 370, 768, 530]]];
    await replayItems(page, { subject: 'laser-cut wooden earrings', names: placed.map(([n]) => n), outlines: placed.map(([, b]) => box(W, H, b[0], b[1], b[2], b[3])), realSizeMm: { w: 40, h: 70, basis: 'a typical drop earring' }, areaPct: 2 });
    await uploadFromHome(page, [{ name: 'earrings.avif', mimeType: 'image/avif', buffer: sample('multiple/earrings.avif') }]);
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(step(page, /Found 8 items/)).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    await main(page).getByRole('radio', { name: 'pairs together' }).click({ timeout: 10_000 });
    await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
    await expect(step(page, 'Added 4 sheets to the cut queue')).toBeVisible({ timeout: 30_000 });
  });

  test('castle: five pictures, one a cut plan → the pictures show on Views, the plan is read into its 11 sheets', async ({ page }) => {
    const pictures = [{ index: 1, kind: 'view', angle: 'front', note: '' }, { index: 2, kind: 'view', angle: 'three-quarter', note: '' }, { index: 3, kind: 'detail', angle: 'unknown', note: 'lit windows' },
      { index: 4, kind: 'view', angle: 'top', note: '' }, { index: 5, kind: 'plan', angle: 'unknown', note: 'parts layout, 11 sheets' }];
    await page.route('**/api/views', (r: Route) => r.fulfill({ json: { brief: { subject: 'a lit wooden castle kit', likelyMaterial: 'wood', realSizeMm: { w: 300, h: 320, d: 300, basis: 'a desk-sized kit' }, pictures }, source: 'live', trace: [] } }));
    await page.route('**/api/segment', (r: Route) => r.fulfill({ json: { boxes: [{ x1: 100, y1: 100, x2: 900, y2: 900 }], source: 'live', trace: [] } }));
    await uploadFromHome(page, [1, 2, 3, 4, 5].map((i) => ({ name: `castle_${i}.webp`, mimeType: 'image/webp', buffer: sample(`3D/castle/castle_${i}.webp`) })));
    await expect(chat(page)).toContainText('5 pictures in. Press Analyze');
    await expect(chat(page)).not.toContainText('A layered picture');
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    // five photos are downscaled and stored first
    await expect(page).toHaveURL(/\/make\/views$/, { timeout: 30_000 });
    // the pictures you gave, never stand-in drawings
    await expect(main(page).locator('figure[data-picture] img')).toHaveCount(5, { timeout: 30_000 });
    await expect(main(page).getByLabel('Picture 5: cut plan')).toBeVisible({ timeout: 30_000 });
    await expect(step(page, 'Read 11 sheets from your cut plan')).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    await expect(step(page, 'Read 11 sheets from your cut plan')).toContainText(/A1 · A2 · A3 · A4 · B1 · B2 · B3 · B4 · B5 · B6 · B7/);
    await expect(step(page, 'Read 11 sheets from your cut plan')).toContainText(/approximate/);
    await page.screenshot({ path: 'test-results/samples/castle-1-views.png' });
    await chat(page).getByRole('button', { name: 'Cut the parts' }).click();
    // 22 passes of plan outlines to draw
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    await expect.poll(async () => page.locator('[data-sheet-svg]').count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(11);
    await page.screenshot({ path: 'test-results/samples/castle-2-sheets.png', fullPage: true });
    // to the end: the queue takes the sheets, one runs
    await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
    const added = step(page, /Added \d+ sheets to the cut queue/);
    await expect(added).toBeVisible({ timeout: 30_000 });
    const n = Number((await added.innerText()).match(/Added (\d+) sheets/)?.[1] ?? '0');
    expect(n).toBeGreaterThanOrEqual(11);
    await chat(page).getByRole('link', { name: 'Open the cut queue' }).last().click();
    await expect(page).toHaveURL(/\/queue$/, { timeout: 30_000 });
    const bed = main(page).getByRole('region', { name: 'On the bed' });
    const queue = main(page).getByRole('complementary', { name: 'Queue' });
    await expect(queue.getByRole('listitem')).toHaveCount(n);
    await bed.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '6×' }).click();
    await queue.getByRole('button', { name: 'Start' }).click();
    await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
    await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', /weeding|cut/, { timeout: 60_000 });
    await page.screenshot({ path: 'test-results/samples/castle-3-queue.png' });
  });

  test.fixme('castle: per-sheet SVG / DXF downloads (L3)', async ({ page }) => {
    // The download buttons land with L3: a `download` event whose file starts with `<?xml` (SVG) or `0\nSECTION` (DXF).
    const pictures = [{ index: 1, kind: 'view', angle: 'front', note: '' }, { index: 2, kind: 'view', angle: 'three-quarter', note: '' }, { index: 3, kind: 'detail', angle: 'unknown', note: 'lit windows' },
      { index: 4, kind: 'view', angle: 'top', note: '' }, { index: 5, kind: 'plan', angle: 'unknown', note: 'parts layout, 11 sheets' }];
    await page.route('**/api/views', (r: Route) => r.fulfill({ json: { brief: { subject: 'a lit wooden castle kit', likelyMaterial: 'wood', realSizeMm: { w: 300, h: 320, d: 300, basis: 'a desk-sized kit' }, pictures }, source: 'live', trace: [] } }));
    await page.route('**/api/segment', (r: Route) => r.fulfill({ json: { boxes: [{ x1: 100, y1: 100, x2: 900, y2: 900 }], source: 'live', trace: [] } }));
    await uploadFromHome(page, [1, 2, 3, 4, 5].map((i) => ({ name: `castle_${i}.webp`, mimeType: 'image/webp', buffer: sample(`3D/castle/castle_${i}.webp`) })));
    await main(page).getByRole('button', { name: 'Analyze' }).click();
    await expect(page).toHaveURL(/\/make\/views$/, { timeout: 30_000 });
    await expect(step(page, 'Read 11 sheets from your cut plan')).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
    await chat(page).getByRole('button', { name: 'Cut the parts' }).click();
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await main(page).getByRole('button', { name: 'Download SVG' }).click({ timeout: 10_000 });
    const path = await (await dl).path();
    const head = readFileSync(path!).subarray(0, 9).toString();
    expect(head === '<?xml' || head.startsWith('0\nSECT')).toBe(true);
  });
});
