import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { uploadFromHome } from './start';

// The action set (design/14) through the UI, on the bookmarks replay from samples.spec.ts: Spark's brief and SAM's
// outlines are routed; everything after that — the chat fast path, the planner, the buttons, undo/redo — is real.
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
const rowNames = (page: Page) => rows(page).evaluateAll((els) => els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''));
const quad = (w: number, h: number, pts: number[][]) => pts.map(([x, y]) => [Math.round((x / w) * 1000), Math.round((y / h) * 1000)] as [number, number]);

async function bookmarksToLayers(page: Page) {
  const names = ['Elephant bookmark', 'Fox bookmark', 'Whale bookmark', 'Butterfly bookmark', 'Phoenix bookmark'];
  const W = 800, H = 640;
  const outlines = [[[42, 183], [155, 157], [296, 555], [165, 597]], [[190, 125], [300, 103], [385, 515], [275, 535]], [[348, 85], [468, 78], [490, 495], [385, 500], [380, 440], [425, 430], [415, 300], [364, 290]],
    [[500, 130], [625, 125], [580, 540], [425, 525]], [[645, 160], [770, 180], [690, 590], [525, 565]]].map((p) => quad(W, H, p));
  const brief = { subject: 'five laser-cut wooden bookmarks', class: 'flat', arrangement: 'multiple-items', likelyMaterial: 'wood', subjectPrompt: 'five laser-cut wooden bookmarks',
    regions: names.map((label, i) => ({ id: `i${i + 1}`, label, samPrompt: label, likelyBought: false, note: '' })), items: names, colourGroupsHint: 1, reference: null, topDownConfidence: 0.9, notes: '', realSizeMm: { w: 50, h: 180, basis: 'a typical bookmark' } };
  await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [] } }));
  await page.route('**/api/segment', async (r: Route) => {
    const body = r.request().postDataJSON() ?? {};
    if (Array.isArray(body.regions)) return r.fulfill({ json: { regions: body.regions.map((x: { id: string; label: string }, i: number) => ({ ...x, areaPct: 9, paths: [outlines[i]], keep: true, itemId: x.id, itemName: x.label })), source: 'live', trace: [] } });
    return r.fulfill({ json: { boxes: [{ x1: 30, y1: 30, x2: 970, y2: 970 }], masks: outlines.map((o) => ({ w: 320, h: 320, ones: 0, paths: [o] })), source: 'live', trace: [] } });
  });
  await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: 'five laser-cut wooden bookmarks', conversionClass: 'flat', pieces: [], variations: [], source: 'live', trace: [] } }));
  await page.route('**/api/layer-op', (r: Route) => r.fulfill({ json: { answer: { op: 'none', colour: '', other: '', reply: '' }, source: 'live', trace: [] } }));
  await uploadFromHome(page, [{ name: 'bookmarks.avif', mimeType: 'image/avif', buffer: sample('multiple/bookmarks.avif') }]);
  await main(page).getByRole('button', { name: 'Analyze' }).click();
  await expect(page).toHaveURL(/\/make\/layers$/, { timeout: 30_000 });
  await expect(step(page, /Found 5 items/)).toHaveAttribute('data-step-status', 'done', { timeout: 60_000 });
}

test.describe('actions · the action set through the UI', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test('chat: flip, mirror, smooth and rotate each land as a done step', async ({ page }) => {
    await bookmarksToLayers(page);
    // flip: the step, and the fox's sheet carries the flip
    await say(page, 'flip the fox bookmark');
    await expect(step(page, /Flipped the Fox bookmark/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await rows(page).filter({ hasText: 'Fox bookmark' }).first().getByRole('button').first().click();
    await main(page).getByRole('toolbar', { name: 'Layer tools' }).getByRole('radio', { name: 'Its sheet' }).click();
    const sheet = main(page).locator('[data-cut-sheet]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('aria-label', /Fox bookmark/);
    await expect(sheet).toHaveAttribute('data-flipped', 'true');
    // mirror: a new paired item in Items and layers
    await say(page, 'mirror the fox bookmark');
    await expect(step(page, /Mirrored Fox bookmark/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(page.getByLabel('Items and layers').getByRole('region', { name: 'Item: Fox bookmark (mirrored)' })).toBeVisible();
    // smooth: the step says how close it stayed
    await say(page, 'smooth the whale bookmark a lot');
    const smoothed = step(page, /Smoothed Whale bookmark/);
    await expect(smoothed).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(smoothed).toContainText(/within .* mm of your shape/);
    // rotate: turned by the degrees asked
    await say(page, 'rotate the phoenix bookmark 90 degrees');
    await expect(step(page, /Turned Phoenix bookmark 90°/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    // nothing fell through to a silent note
    await expect(chat(page)).not.toContainText('Noted');
    await page.screenshot({ path: 'test-results/samples/bookmarks-5-actions.png' });
  });

  test('chat: "make 3 copies of the fox bookmark" → the cut queue has 3 Fox sheets', async ({ page }) => {
    await bookmarksToLayers(page);
    await say(page, 'make 3 copies of the fox bookmark');
    await expect(step(page, /Making 3 of Fox bookmark/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/, { timeout: 30_000 });
    await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
    await expect(step(page, /Added 7 sheets to the cut queue/)).toBeVisible({ timeout: 30_000 });
    await chat(page).getByRole('link', { name: 'Open the cut queue' }).last().click();
    await expect(page).toHaveURL(/\/queue$/, { timeout: 30_000 });
    const queue = main(page).getByRole('complementary', { name: 'Queue' });
    await expect(queue.getByRole('listitem')).toHaveCount(7);
    await expect(queue.getByRole('listitem').filter({ hasText: 'Fox bookmark' })).toHaveCount(3);
  });

  test('undo and redo, buttons and words, restore the row count and names exactly', async ({ page }) => {
    await bookmarksToLayers(page);
    const before = await rowNames(page);
    await say(page, 'delete layer 2');
    await expect(step(page, /Deleted Fox bookmark/)).toBeVisible({ timeout: 30_000 });
    const afterDel = await rowNames(page);
    expect(afterDel.length).toBe(before.length - 1);
    const tools = main(page).getByRole('toolbar', { name: 'Layer tools' });
    await tools.getByRole('button', { name: 'Undo' }).click();
    await expect(step(page, /Undone:/)).toBeVisible({ timeout: 30_000 });
    expect(await rowNames(page)).toEqual(before);
    await tools.getByRole('button', { name: 'Redo' }).click();
    await expect(step(page, /Redone:/)).toBeVisible({ timeout: 30_000 });
    expect(await rowNames(page)).toEqual(afterDel);
    await say(page, 'undo');
    await expect.poll(async () => (await rows(page).count()), { timeout: 30_000 }).toBe(before.length);
    expect(await rowNames(page)).toEqual(before);
    await say(page, 'redo');
    await expect.poll(async () => (await rows(page).count()), { timeout: 30_000 }).toBe(afterDel.length);
    expect(await rowNames(page)).toEqual(afterDel);
  });

  test('the planner’s two calls land as one step, undone by one Undo', async ({ page }) => {
    // the route is stubbed: merge layers 1+2, then smooth the result. The phrase only has to reach the planner —
    // "flip layer 1 and mirror layer 2" is the two-action shape the legacy branches don't catch (see next test).
    await page.route('**/api/actions/plan', (r: Route) => r.fulfill({ json: { answer: { calls: [
      { action: 'merge', refs: [{ kind: 'n', value: '1' }, { kind: 'n', value: '2' }], opts: {} },
      { action: 'smooth', refs: [{ kind: 'n', value: '1' }], opts: { strength: 2 } },
    ], reply: 'Merged and smoothed', ask: '' }, source: 'live', trace: [] } }));
    await bookmarksToLayers(page);
    const before = await rowNames(page);
    await say(page, 'flip layer 1 and mirror layer 2');
    const planned = step(page, 'Merged and smoothed');
    await expect(planned).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(planned).toContainText('2 steps · one undo');
    expect(await rows(page).count()).toBe(before.length - 1);
    await say(page, 'undo');
    await expect(step(page, /Undone:/)).toBeVisible({ timeout: 30_000 });
    expect(await rows(page).count()).toBe(before.length);
    expect(await rowNames(page)).toEqual(before);
  });

  test.fail('two-step "merge layers 1 and 2 and then smooth it" is sent through the planner', async ({ page }) => {
    // BUG (T7 hand-back): the legacy merge branch (namedLayers ≥ 2) catches this before the planner, so
    // /api/actions/plan is never consulted, the smooth half is dropped, and no step lands.
    let planHits = 0;
    await page.route('**/api/actions/plan', (r: Route) => { planHits++; return r.fulfill({ json: { answer: { calls: [], reply: '', ask: '' }, source: 'live', trace: [] } }); });
    await bookmarksToLayers(page);
    await say(page, 'merge layers 1 and 2 and then smooth it');
    await expect(chat(page)).toContainText('merged', { timeout: 30_000 });
    expect(planHits).toBe(1);
  });

  test.fail('split refuses on a one-piece layer, saying why', async ({ page }) => {
    // BUG (T7 hand-back): "split the elephant bookmark" splits it into 22 speckle pieces instead of refusing
    // with "One piece — nothing to split" — split has no minimum-piece filter.
    await bookmarksToLayers(page);
    await say(page, 'split the elephant bookmark');
    await expect(step(page, 'One piece — nothing to split')).toBeVisible({ timeout: 30_000 });
    await expect(chat(page)).not.toContainText('Noted');
  });

  test('buttons: delete, duplicate, merge with… and split-back, each quoted in the chat', async ({ page }) => {
    await bookmarksToLayers(page);
    const quoted = () => chat(page).locator('[data-timeline-entry="user"]').last().locator('[data-quote-card]');
    // duplicate the first row
    await rows(page).first().getByRole('button').first().click();
    await rows(page).first().getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Duplicate this layer' }).click();
    await expect(step(page, /Duplicated/)).toBeVisible({ timeout: 30_000 });
    await expect(chat(page)).toContainText('Duplicate this layer');
    await expect(quoted()).toContainText(/Elephant/);
    const afterDup = (await rowNames(page)).sort();
    // merge the elephant with its copy (same item, so split can give both back)
    const elephantIdx = (await rowNames(page)).findIndex((n) => /^Elephant bookmark · cut/.test(n) && !n.includes('copy'));
    expect(elephantIdx).toBeGreaterThanOrEqual(0);
    await rows(page).nth(elephantIdx).getByRole('button').first().click();
    await rows(page).nth(elephantIdx).getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Merge with…' }).click();
    await page.getByRole('menu', { name: 'Merge with' }).getByRole('menuitem', { name: 'Elephant bookmark copy · cut' }).click();
    await expect(step(page, /Merged Elephant bookmark with Elephant bookmark copy/)).toBeVisible({ timeout: 30_000 });
    await expect(chat(page)).toContainText(/Merge this layer with/);
    // split the merged row back into its originals
    const mergedIdx = (await rowNames(page)).findIndex((n) => n.includes('+'));
    expect(mergedIdx).toBeGreaterThanOrEqual(0);
    await rows(page).nth(mergedIdx).getByRole('button').first().click();
    const splitBtn = rows(page).nth(mergedIdx).getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Split' });
    await expect(splitBtn).toBeEnabled();
    await splitBtn.click();
    await expect(step(page, /Split .* back into/)).toBeVisible({ timeout: 30_000 });
    await expect(chat(page)).toContainText('Split this layer into its pieces');
    expect((await rowNames(page)).sort()).toEqual(afterDup);
    // delete the first row
    await rows(page).first().getByRole('button').first().click();
    await rows(page).first().getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Delete this layer' }).click();
    await expect(step(page, /Deleted/)).toBeVisible({ timeout: 30_000 });
    await expect(chat(page)).toContainText('Delete this layer');
    await expect(quoted()).toContainText(/Elephant|Fox|Whale|Butterfly|Phoenix/);
    expect(await rows(page).count()).toBe(afterDup.length - 1);
    await page.screenshot({ path: 'test-results/samples/bookmarks-6-buttons.png' });
  });
});
