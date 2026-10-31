import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { uploadFromHome } from './start';

// Regression for the black-cat wall art (samples/layered/layered_floral_black_cat_wall_art.jpg.avif, 2026-10-28).
// The Meta API is not reachable from CI, so the routes replay what the live models returned for this photo:
// Spark's brief and layer names; SAM 3.1 giving no usable outline for the cutout (the run fell back to the
// fixture) and the same cat silhouette for every layer phrase. The app must still remove the textured wall,
// split the art into its colour layers, keep the photo on every step and act on "remove the wall".
const photo = readFileSync(new URL('../../../samples/layered/layered_floral_black_cat_wall_art.jpg.avif', import.meta.url));
const cat = JSON.parse(readFileSync(new URL('./fixtures/cat-sam-silhouette.json', import.meta.url), 'utf8')) as { paths: [number, number][][]; areaPct: number };
const titles = ['Gold Backer Base', 'Black Cat Silhouette', 'Red Leaf Filler', 'White Floral Petals', 'Floral Center Detail', 'Cat Face Features'];
const brief = {
  subject: 'layered floral black cat wall art', class: 'layered', arrangement: 'stacked', likelyMaterial: 'paper', subjectPrompt: 'layered floral black cat wall art',
  regions: titles.map((label, i) => ({ id: `r${i + 1}`, label, samPrompt: label.toLowerCase(), likelyBought: false, note: '' })),
  items: [], colourGroupsHint: 6, reference: null, topDownConfidence: 0.8, notes: 'textured plaster wall behind, plant shadows'
};
const main = (page: Page) => page.getByRole('main');
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });

async function replayMuse(page: Page, { samCutout }: { samCutout: 'none' | 'cat' }) {
  const segmentCalls: unknown[] = [];
  await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [{ model: 'muse-spark-1.3', purpose: 'analyze_image', latencyMs: 900, costUsd: 0.01 }] } }));
  await page.route('**/api/segment', async (r: Route) => {
    const body = r.request().postDataJSON() ?? {};
    segmentCalls.push(body);
    if (Array.isArray(body.regions)) return r.fulfill({ json: { regions: body.regions.map((x: { id: string; label: string }) => ({ ...x, box: { x1: 120, y1: 0, x2: 800, y2: 950 }, areaPct: cat.areaPct, paths: cat.paths, keep: true })), source: 'live', trace: [] } });
    if (samCutout === 'none') return r.fulfill({ json: { boxes: [{ x1: 300, y1: 200, x2: 700, y2: 800 }], source: 'fixture', trace: [] } });
    return r.fulfill({ json: { boxes: [{ x1: 120, y1: 0, x2: 800, y2: 950 }], masks: [{ w: 320, h: 320, ones: 0, paths: cat.paths }], source: 'live', trace: [] } });
  });
  await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: 'Build a 6-layer dimensional paper wall art of a black cat', conversionClass: 'layered', pieces: titles.map((name) => ({ name, kind: 'layer', note: '' })), variations: [], source: 'live', trace: [] } }));
  return segmentCalls;
}

async function toLayers(page: Page) {
  // Home's Upload tile: pick the photo, Capture shows it
  await uploadFromHome(page, [{ name: 'layered_floral_black_cat_wall_art.jpg.avif', mimeType: 'image/avif', buffer: photo }]);
  await expect(main(page).getByRole('img', { name: 'Photo view' })).toBeVisible();
  // one press: Analyze opens Layers, where the background, the items and the layers are worked out live
  await main(page).getByRole('button', { name: 'Analyze' }).click();
  await expect(page).toHaveURL(/\/make\/layers$/);
}
const steps = (page: Page) => chat(page).locator('[data-timeline-entry="step"]');
const step = (page: Page, title: RegExp | string) => steps(page).filter({ hasText: title }).last();

test.describe('black cat wall art · Analyze: background, items and layers from a real photo', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test('SAM gives no outline: the wall is still removed, one item is found and split into its colour layers — live in the chat', async ({ page }) => {
    const calls = await replayMuse(page, { samCutout: 'none' });
    await toLayers(page);
    // each stage shows in the timeline as it happens, and lands done with its detail and model calls
    await expect(step(page, 'Background removed')).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    const subjectPct = Number((await step(page, 'Background removed').innerText()).match(/the subject is ([\d.]+)%/)?.[1]);
    expect(subjectPct).toBeGreaterThan(25); expect(subjectPct).toBeLessThan(60);
    await expect(step(page, 'Background removed').locator('[data-model-call]').first()).toContainText('SAM 3.1');
    await expect(step(page, /Found 1 item/)).toBeVisible();
    await expect(step(page, /Split into \d layers by colour/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    for (const word of ['Gold', 'Black', 'Red', 'White']) await expect(step(page, /Split into/).getByRole('group', { name: 'Layers found' })).toContainText(word);
    // stacked art: no SAM call per layer phrase (they all return the same cat)
    expect(calls.filter((c) => Array.isArray((c as { regions?: unknown }).regions))).toHaveLength(0);
    // the AVIF upload is sent to Meta as JPEG (Meta rejects AVIF)
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(String((c as { imageDataUrl?: string }).imageDataUrl)).toMatch(/^data:image\/jpeg/);
    const stack = page.getByLabel('Layer stack, back to front');
    for (const word of ['Gold', 'Black', 'Red', 'White']) await expect(stack).toContainText(word);
    // every layer has its own mask: the overlay paths differ from layer to layer
    const stage = main(page).locator('[data-work-area] [data-photo-stage]').first();
    await expect.poll(async () => stage.locator('path[fill-rule="evenodd"]:not([data-layer-sheet-outline])').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
    const ds = await stage.locator('path[fill-rule="evenodd"]:not([data-layer-sheet-outline])').evaluateAll((els) => els.map((e) => e.getAttribute('d')));
    expect(new Set(ds).size).toBe(ds.length);
    // the outlines are hairlines and the selected layer shows the photo itself inside its mask
    expect(await stage.locator('path[fill-rule="evenodd"]:not([data-layer-sheet-outline])').first().getAttribute('stroke-width')).toMatch(/^(0\.\d+|1(\.\d+)?)$/);
    await expect(stage.locator('clipPath path').first()).toBeAttached();
    await page.screenshot({ path: 'test-results/cat/01-layers.png' });

    // the background is gone around the subject (checkerboard), not just dimmed
    await expect(stage.locator('[data-background-removed]')).toBeAttached();
    // the exploded view is the photo's own layers, lifted in an isometric stack
    const view = main(page).getByRole('toolbar', { name: 'Layer tools' });
    await view.getByRole('radio', { name: 'Exploded' }).click();
    await expect(main(page).locator('[data-exploded-photo] [data-exploded-layer]')).toHaveCount(4);
    await page.screenshot({ path: 'test-results/cat/01b-exploded.png' });
    await view.getByRole('radio', { name: 'Its sheet' }).click();
    await expect(main(page).locator('[data-cut-sheet]')).toBeVisible();
    await page.screenshot({ path: 'test-results/cat/01c-sheet.png' });
    await view.getByRole('radio', { name: 'All layers' }).click();
    // hide every layer from its row's actions (said in the chat each time): the photo stays (no stand-in illustration)
    const rows = stack.locator('[data-layer-row]');
    for (let i = 0; i < (await rows.count()); i++) {
      await rows.nth(i).getByRole('button').first().click();
      await rows.nth(i).getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Hide', exact: true }).click();
    }
    await expect(chat(page)).toContainText('Hide this layer');
    await expect(main(page)).toContainText('Every layer is hidden');
    await expect(main(page).getByRole('img', { name: 'Every layer hidden: your photo' }).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/cat/02-all-hidden.png' });

    // reload, then the first step: Capture shows the photo that was uploaded
    await page.reload(); await page.waitForLoadState('networkidle');
    await page.goto('/capture'); await page.waitForLoadState('networkidle');
    await expect(main(page).getByRole('img', { name: 'Photo view' })).toBeVisible({ timeout: 20_000 });
  });

  test('“remove the textured background wall” in the chat (or its inline suggestion) rebuilds the background and layers', async ({ page }) => {
    await replayMuse(page, { samCutout: 'cat' });
    await toLayers(page);
    await expect(step(page, /Split into/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(step(page, 'Background removed').locator('[data-model-call]').first()).toContainText('SAM 3.1');
    // SAM outlined only the cat; the flowers around it stay attached to the subject
    const before = Number((await step(page, 'Background removed').innerText()).match(/the subject is ([\d.]+)%/)?.[1]);
    expect(before).toBeGreaterThan(cat.areaPct + 10);
    // the suggestions sit inline after the last entry; one click goes through the chat
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Remove the wall and shadows' }).click();
    await expect(chat(page)).toContainText('removing the background harder');
    await expect(step(page, 'wall and shadows cleared')).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(steps(page).filter({ hasText: /Split into/ })).toHaveCount(2, { timeout: 30_000 });
    // once the background is gone, it is not suggested again
    await expect(chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Remove the wall and shadows' })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/cat/03-after-remove-wall.png' });
  });

  test('a quoted layer gets the correction; the sliders and tools are said in the chat and land there', async ({ page }) => {
    await replayMuse(page, { samCutout: 'none' });
    await toLayers(page);
    await expect(step(page, /Split into/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    const stack = page.getByLabel('Layer stack, back to front');
    const whiteRow = stack.locator('[data-layer-row]').filter({ hasText: /White/ }).first();
    const before = Number((await whiteRow.innerText()).match(/([\d.]+)% shows/)?.[1] ?? '0');
    // quote the white layer from its row: a card with its preview sits above the composer
    await whiteRow.getByRole('button').first().click();
    await whiteRow.getByRole('toolbar', { name: 'Layer actions' }).getByRole('button', { name: 'Quote this layer in the chat' }).click();
    await expect(chat(page).locator('[data-chat-composer] [data-quote-card], [data-quote-card]').first()).toContainText(/White/);
    await chat(page).locator('[data-chat-composer]').getByRole('textbox').fill('make it bolder');
    await chat(page).getByRole('button', { name: 'Send' }).click();
    // the message carries the quote in the timeline; the correction lands on that layer
    await expect(chat(page).locator('[data-timeline-entry="user"]').last().locator('[data-quote-card]')).toContainText('White');
    await expect(step(page, /Done — White[^:]*: made it bolder/)).toBeVisible({ timeout: 30_000 });
    const after = Number((await whiteRow.innerText()).match(/([\d.]+)% shows/)?.[1] ?? '0');
    expect(after).toBeGreaterThan(before);
    // naming the layer in the chat works too, even when another one is selected
    await stack.locator('[data-layer-row]').filter({ hasText: /Gold/ }).first().getByRole('button').first().click();
    await chat(page).locator('[data-chat-composer]').getByRole('textbox').fill('the white layer is missing the whiskers');
    await chat(page).getByRole('button', { name: 'Send' }).click();
    await expect(step(page, /White[^:]*: kept the fine detail/)).toBeVisible({ timeout: 30_000 });
    // the detail slider on the layer toolbar: said as a message, then applied
    const toolbar = main(page).getByRole('toolbar', { name: 'Layer tools' });
    await toolbar.getByLabel('Detail, blocky to fine').fill('5');
    await expect(chat(page)).toContainText(/Detail 5 of 5 · weight/);
    await expect(step(page, /detail 5 of 5 \(fine\)/)).toBeVisible({ timeout: 30_000 });
    // draw a circle onto the layer with the circle tool
    await toolbar.getByRole('button', { name: 'Draw a circle' }).click();
    const box = (await main(page).locator('[data-work-area] svg').first().boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 4 }); await page.mouse.up();
    await expect(step(page, /added a circle/)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/cat/04-layer-corrections.png' });
  });

  test('Sheets: a virtual run of every pass — blank sheet, cut traced, extra pieces gone; sized from Muse’s estimate', async ({ page }) => {
    await replayMuse(page, { samCutout: 'none' });
    await toLayers(page);
    await expect(step(page, /Split into/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(page.getByLabel('Real size')).toBeVisible();
    await chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Cut the sheets' }).click();
    await expect(page).toHaveURL(/\/make\/output$/);
    const run = main(page).getByRole('region', { name: 'Cutting' });
    await expect(run.locator('[data-cut-preview]')).toHaveAttribute('data-phase', 'feed');
    await run.getByRole('button', { name: 'Play the whole run' }).click();
    await expect(run.locator('[data-cut-preview]')).toHaveAttribute('data-phase', 'cutting', { timeout: 10_000 });
    await page.screenshot({ path: 'test-results/cat/05-run-cutting.png' });
    await expect(run.locator('[data-cut-preview]')).toHaveAttribute('data-phase', 'verify', { timeout: 15_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'test-results/cat/06-run-weeded.png' });
    await expect(run).toContainText('All sheets cut', { timeout: 60_000 });
    // the cut queue: send the sheets — the rail's Cut queue icon counts them
    await main(page).getByRole('button', { name: 'Send to the cut queue' }).click();
    await expect(step(page, 'Added 4 sheets to the cut queue')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Studio sections' }).locator('[data-badge]')).toHaveText('4');
    await chat(page).getByRole('link', { name: 'Open the cut queue' }).last().click();
    await expect(page).toHaveURL(/\/queue$/);
    // one sheet at a time: load it, Start, the tool follows the cutting program, the waste falls away, next
    const bed = main(page).getByRole('region', { name: 'On the bed' });
    const queue = main(page).getByRole('complementary', { name: 'Queue' });
    await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', 'waiting');
    await expect(queue).toContainText('Stick');
    await bed.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '6×' }).click();
    await queue.getByRole('button', { name: 'Start' }).click();
    await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', 'running');
    await expect(bed.locator('[data-program]')).toContainText('DOWN  CUT');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'test-results/cat/08-queue.png' });
    await expect(bed.locator('[data-cut-run]')).toHaveAttribute('data-phase', 'cut', { timeout: 20_000 });
    await page.screenshot({ path: 'test-results/cat/09-queue-cut.png' });
    await queue.getByRole('button', { name: 'Next sheet' }).click();
    await expect(queue.getByRole('listitem').first()).toContainText('to assembly');
    await expect(page.getByRole('navigation', { name: 'Studio sections' }).locator('[data-badge]')).toHaveText('3');
    // the queue is kept: a reload brings it back
    await page.reload(); await page.waitForLoadState('networkidle');
    await expect(main(page).getByRole('complementary', { name: 'Queue' }).getByRole('listitem')).toHaveCount(4);
    // Assemble: each sheet lifts off its card and lands on the stack, until the finished piece
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('link', { name: 'Assemble' }).click();
    await expect(page).toHaveURL(/\/make\/assemble$/);
    const together = main(page).getByRole('region', { name: 'Putting it together' });
    await together.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '2×' }).click();
    await together.getByRole('button', { name: 'Replay' }).click();
    await expect(main(page).getByRole('region', { name: 'Layers to stack' }).getByRole('article', { name: /Layer 2/ })).toHaveAttribute('aria-current', 'step', { timeout: 15_000 });
    await page.screenshot({ path: 'test-results/cat/10-assemble.png' });
    await expect(together.locator('[data-stack-stage]')).toHaveAttribute('data-placed', '4', { timeout: 20_000 });
    await expect(together).toContainText('The finished piece', { timeout: 20_000 });
    await expect(main(page).getByRole('region', { name: 'Layers to stack' })).toContainText('not cut yet');
  });

  test('chat as the main way in: on Capture, “remove the shadow and wall…” analyzes the photo and Layers fills in', async ({ page }) => {
    await replayMuse(page, { samCutout: 'none' });
    await uploadFromHome(page, [{ name: 'layered_floral_black_cat_wall_art.jpg.avif', mimeType: 'image/avif', buffer: photo }]);
    // no Home starters here
    await expect(chat(page).getByRole('button', { name: 'A layered mountain picture' })).toHaveCount(0);
    await expect(chat(page).getByRole('group', { name: 'Suggestions' }).getByRole('button', { name: 'Analyze it' })).toBeVisible();
    await chat(page).locator('[data-chat-composer]').getByRole('textbox').fill('remove the shadow and wall and identify the layers for the shape');
    await chat(page).getByRole('button', { name: 'Send' }).click();
    await expect(page).toHaveURL(/\/make\/layers$/, { timeout: 20_000 });
    await expect(step(page, 'wall and shadows cleared')).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(step(page, /Split into \d layers by colour/)).toHaveAttribute('data-step-status', 'done', { timeout: 30_000 });
    await expect(page.getByLabel('Layer stack, back to front').locator('[data-layer-row]').first()).toBeVisible();
    // a correction typed in the chat shows on the work area: the layer on its own, its whole sheet in its colour
    await chat(page).locator('[data-chat-composer]').getByRole('textbox').fill('make the gold layer one solid outline');
    await chat(page).getByRole('button', { name: 'Send' }).click();
    await expect(step(page, /Gold[^:]*: filled the inner sections/)).toBeVisible({ timeout: 30_000 });
    await expect(main(page).locator('[data-work-area] [data-layer-sheet]')).toBeAttached();
    await page.screenshot({ path: 'test-results/cat/07-chat-first.png' });
  });
});
