import { describe, expect, it, vi } from 'vitest';
import { AppState, BACKDROP_ASK, buildFor } from './app.svelte';
import { MemoryStorage, ProjectStore } from './project.svelte';
import type { ImageBrief } from '../domain/schemas';

// The same synthetic wall-art photo as domain/layering.spec: wall with shadows, gold backer, black body,
// red blob, two one-pixel white strokes, a plant at the edge.
function photo(w = 120, h = 120) {
  const data = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, [r, g, b]: number[]) => { const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    set(x, y, (x + y) % 40 < 14 ? [196, 176, 146] : [226, 208, 178]);
    const d = Math.hypot(x - 64, y - 60);
    if (d < 40) set(x, y, [214, 156, 72]);
    if (d < 32) set(x, y, [22, 20, 20]);
    if (Math.hypot(x - 52, y - 70) < 9) set(x, y, [182, 58, 42]);
    if ((y === 50 && x > 60 && x < 90) || (y === 54 && x > 62 && x < 92)) set(x, y, [240, 232, 226]);
    if (x < 8 && y > 30 && y < 60) set(x, y, [70, 110, 50]);
  }
  return { data, w, h };
}
const brief: ImageBrief = {
  realSizeMm: { w: 400, h: 400, basis: 'layered wall art is usually 30–45 cm' },
  subject: 'layered wall art', class: 'layered', arrangement: 'stacked', likelyMaterial: 'paper', subjectPrompt: 'wall art',
  regions: ['Gold backer', 'Black cat', 'Red leaves', 'White whiskers'].map((label, i) => ({ id: `r${i}`, label, samPrompt: label, likelyBought: false, note: '' })),
  items: [], colourGroupsHint: 4, reference: null, topDownConfidence: 0.8, notes: ''
};
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

async function craft() {
  const app = new AppState(new ProjectStore(new MemoryStorage()));
  globalThis.fetch = (async (u: string) => ({ ok: true, json: async () => (String(u).includes('scene') ? { brief, source: 'live', trace: [] } : String(u).includes('segment') ? { boxes: [{ x1: 300, y1: 200, x2: 700, y2: 800 }], source: 'fixture', trace: [] } : { pieces: [], source: 'fixture', trace: [] }) })) as unknown as typeof fetch;
  app.muse.pixels = async () => photo();
  app.startCraft('flat');
  app.startFromCapture({ images: ['data:image/png;base64,AAAA'], mode: 'single' });
  for (const s of ['cutout', 'segment', 'layers'] as const) app.visit(s);
  await app.planReady; await settle();
  return app;
}

describe('photo → outline → colour layers in AppState (code measures; no SAM phrase per layer)', () => {
  it('removes the wall even when SAM finds nothing, then splits the art into its colour layers', async () => {
    const app = await craft();
    const f = app.layers;
    expect(f.subjectPaths.length).toBeGreaterThan(0);
    expect(f.cutoutChecks.map((c) => c.text).join(' ')).toMatch(/backdrop measured from the photo edge.*SAM 3.1 found no outline/);
    expect(f.layers.map((l) => l.name)).toEqual(expect.arrayContaining(['Gold backer', 'Black cat', 'Red leaves', 'White whiskers']));
    expect(f.layers[0].name).toBe('Gold backer');
    expect(f.regions.every((r) => r.paths?.length && r.cutPaths?.length)).toBe(true);
    expect(app.noteFor('cutout')).toMatch(/Background removed/);
  });

  it('a correction aimed at one layer re-measures that layer only', async () => {
    const app = await craft();
    const f = app.layers;
    const white = f.layers.find((l) => l.name === 'White whiskers')!;
    const others = f.layers.filter((l) => l.n !== white.n).map((l) => f.regionForLayer(l)!.paths);
    f.selectLayer(1);
    await app.ask('the white whiskers layer should be bolder', '/make/layers');
    await settle();
    expect(app.flow.conversation.log.at(-1)?.text).toMatch(/Done — White whiskers: made it bolder/);
    expect(f.layers.find((l) => l.n === white.n)!.visiblePct).toBeGreaterThan(white.visiblePct);
    expect(f.layers.filter((l) => l.n !== white.n).map((l) => f.regionForLayer(l)!.paths)).toEqual(others);
    expect(f.notes.at(-1)).toMatchObject({ layer: expect.stringContaining('White whiskers') });
  });

  it('an ask it cannot apply is kept as a note on the layer', async () => {
    const app = await craft();
    expect(await app.refineLayer(1, 'make it prettier')).toBe(false);
    expect(app.flow.conversation.log.at(-1)?.text).toContain('Noted for ');
  });

  it('“remove the wall” on any step rebuilds the outline strictly; at Import it is applied before tracing', async () => {
    expect(BACKDROP_ASK.test('the background textured wall needs to be removed')).toBe(true);
    expect(BACKDROP_ASK.test('background was not removed')).toBe(true);
    expect(BACKDROP_ASK.test('make it warmer')).toBe(false);
    const app = await craft();
    await app.ask('please remove the textured wall behind it', '/make/layers');
    expect(app.layers.removeBackdrop).toBe(true);
    await settle(); await app.planReady; await settle();
    expect(app.layers.cutoutChecks[0].text).toContain('wall and props cleared');
    expect(app.flow.conversation.log.map((e) => e.text).join('\n')).toContain('Background removed · wall and shadows cleared');

    const early = new AppState(new ProjectStore(new MemoryStorage()));
    early.muse.pixels = async () => photo();
    early.startCraft('flat');
    early.startFromCapture({ images: ['data:image/png;base64,AAAA'], mode: 'single' });
    await early.askForBrief('remove the wall around it');
    expect(early.layers.removeBackdrop).toBe(true);
    early.visit('cutout'); await early.cutoutReady; await settle();
    expect(early.layers.cutoutChecks[0].text).toContain('wall and props cleared');
  });

  it('“3 layers” regroups the colours', async () => {
    const app = await craft();
    await app.ask('use 3 layers', '/make/layers');
    await settle(); await app.planReady; await settle();
    expect(app.layers.regions.length).toBeLessThanOrEqual(3);
  });

  it('the breakdown is said in the chat as it happens: thinking, working, done — with each model call on its step', async () => {
    const app = await craft();
    const steps = app.flow.conversation.log.filter((e) => e.step).map((e) => e.step!);
    expect(steps.map((s) => [s.title, s.status])).toEqual([
      ['I see layered wall art', 'done'], ['Background removed', 'done'], ['Found 1 item: layered wall art', 'done'], ['Split into 4 layers by colour', 'done']
    ]);
    expect(steps[3].swatches?.map((x) => x.label)).toEqual(expect.arrayContaining(['Gold backer']));
    expect(steps[1].calls.map((c) => c.model)).toEqual(['SAM 3.1']);
    expect(steps[3].calls.map((c) => c.model)).toEqual(['Code', 'Muse Spark 1.3']);
    expect(app.flow.conversation.busy).toBe(false);
    expect(app.messages.some((m) => m.data?.step)).toBe(true);
    app.guideStep('layers');
    expect(app.suggestions).toContain('Remove the wall and shadows');
  });

  it('a quoted layer is what a chat correction applies to; a quoted message rides along as context', async () => {
    const app = await craft();
    const f = app.layers;
    const red = f.layers.find((l) => l.name === 'Red leaves')!;
    app.quoteLayer(red.n);
    expect(app.quote).toMatchObject({ kind: 'layer', n: red.n, label: 'Red leaves' });
    expect(app.quote?.d).toBeTruthy();
    f.selectLayer(1);
    await app.ask('make it bolder', '/make/layers');
    await settle();
    expect(app.quote).toBeNull();
    const said = app.flow.conversation.log.filter((e) => e.role === 'user').at(-1)!;
    expect(said.quote?.label).toContain('Red leaves');
    expect(app.flow.conversation.log.at(-1)?.text).toMatch(/Done — Red leaves: made it bolder/);
    app.quoteMessage('x'.repeat(200));
    expect(app.quote?.text?.length).toBeLessThanOrEqual(160);
    app.quoteMessage('   '); expect(app.quote?.kind).toBe('message');
    app.clearQuote(); expect(app.quote).toBeNull();
    app.quoteLayer(99); expect(app.quote).toBeNull();
  });

  it('every toolbar action is said in the chat with the layer quoted, then lands as a step', async () => {
    const app = await craft();
    const f = app.layers, c = app.flow.conversation;
    const n = f.layers.find((l) => l.name === 'White whiskers')!.n;
    const last = () => c.log.at(-1)!;
    const said = () => c.log.filter((e) => e.role === 'user').at(-1)!;
    await app.layerAction(n, { kind: 'hide' });
    expect(f.isLayerVisible(n)).toBe(false);
    expect(said()).toMatchObject({ text: 'Hide this layer', quote: { n } });
    expect(last().step?.title).toMatch(/^Hidden/);
    await app.layerAction(n, { kind: 'show' });
    expect(f.isLayerVisible(n)).toBe(true);
    await app.layerAction(n, { kind: 'tune', detail: 5, weight: 1 });
    expect(said().text).toBe('Detail 5 of 5 · weight +1');
    expect(last().step?.title).toMatch(/detail 5 of 5 \(fine\), weight \+1/);
    expect(f.layers[n - 1].tune).toEqual({ detail: 5, weight: 1 });
    await app.layerAction(n, { kind: 'shape', shape: { type: 'circle', cx: 500, cy: 500, r: 50 }, mode: 'add' });
    expect(last().step?.title).toContain('added a circle');
    await app.layerAction(n, { kind: 'smoothArea', box: { x1: 0, y1: 0, x2: 1000, y2: 1000 }, strength: 3 });
    expect(said().text).toBe('Reduce the jitter in this area');
    const before = f.regionForLayer(f.layers[n - 1])!.paths![0][0];
    await app.layerAction(n, { kind: 'move', dx: 10, dy: -20 });
    expect(f.regionForLayer(f.layers[n - 1])!.paths![0][0]).toEqual([before[0] + 10, before[1] - 20]);
    expect(last().step?.title).toMatch(/^Moved/);
    const count = f.layers.length;
    await app.layerAction(1, { kind: 'duplicate' }); expect(f.layers.length).toBe(count + 1);
    await app.layerAction(1, { kind: 'merge' }); expect(f.layers.length).toBe(count);
    await app.layerAction(1, { kind: 'split' }); expect(f.layers.length).toBe(count + 1);
    await app.layerAction(f.layers.length, { kind: 'merge' }); expect(last().step?.title).toContain('already the front layer');
    await app.layerAction(f.layers.length, { kind: 'split' }); expect(last().step?.title).toMatch(/one piece/i);
    await app.layerAction(99, { kind: 'hide' });
    expect(app.layerPath(1)).toMatch(/^M/);
    // show only this layer: a view of one layer, said in the chat
    await app.layerAction(2, { kind: 'only' });
    expect(f.view).toBe('only'); expect(f.selected.n).toBe(2);
    expect(said().text).toBe('Show only this layer');
    // merge any two layers: one layer where the front one sat, its mask the union of both (split brings them back)
    const count0 = f.layers.length, [a, b] = [f.layers[0], f.layers[2]];
    await app.layerAction(1, { kind: 'mergeWith', other: 3 });
    expect(f.layers.length).toBe(count0 - 1);
    const merged = f.layers[1];
    expect(merged.name).toBe(`${a.name} + ${b.name}`);
    expect(f.regionForLayer(merged)?.paths?.length).toBeGreaterThan(0);
    expect(f.cutPathFor(merged.n)).toMatch(/^M/);
    expect(last().step?.title).toContain(`Merged ${a.name} with ${b.name}`);
    await app.layerAction(1, { kind: 'mergeWith', other: 1 }); expect(last().step?.title).toContain('Nothing to merge');
    await app.layerAction(merged.n, { kind: 'split' }); expect(f.layers.length).toBe(count0);
    expect(f.layers.map((l) => l.name)).toContain(a.name);
    // one history: undo the split, then the merge
    app.undoLast(); expect(f.layers.length).toBe(count0 - 1);
    app.undoLast(); expect(f.layers.map((l) => l.name)).toEqual(expect.arrayContaining([a.name, b.name]));
  }, 20_000);

  it('separate items (bookmarks): found as items, one layer each, grouped by item; a failed outline says so', async () => {
    const names = ['Fox bookmark', 'Owl bookmark'];
    const multi: ImageBrief = { ...brief, subject: 'two bookmarks', arrangement: 'multiple-items', items: [], regions: names.map((label, i) => ({ id: `b${i}`, label, samPrompt: 'bookmark', likelyBought: false, note: '' })) };
    const rect = (x: number): [number, number][] => [[x, 100], [x + 200, 100], [x + 200, 900], [x, 900]];
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    globalThis.fetch = (async (u: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}');
      const json = String(u).includes('scene') ? { brief: multi, source: 'live', trace: [] }
        : String(u).includes('segment') && Array.isArray(body.regions) ? { regions: body.regions.map((r: { id: string; label: string }, i: number) => ({ ...r, areaPct: 16, paths: [rect(100 + i * 400)], keep: true, itemId: r.id, itemName: r.label })), source: 'live', trace: [] }
        : String(u).includes('segment') ? { boxes: [{ x1: 100, y1: 100, x2: 700, y2: 900 }], source: 'fixture', trace: [] } : { pieces: [], source: 'fixture', trace: [] };
      return { ok: true, json: async () => json };
    }) as unknown as typeof fetch;
    app.muse.pixels = async () => null;
    app.startCraft('flat');
    app.startFromCapture({ images: ['data:image/png;base64,AAAA'], mode: 'single' });
    app.visit('layers');
    await app.briefReady; await settle(); await app.planReady; await settle();
    const titles = app.flow.conversation.log.filter((e) => e.step).map((e) => [e.step!.title, e.step!.status]);
    expect(titles).toContainEqual(['Outline not found in this photo', 'failed']);
    expect(titles).toContainEqual(['Found 2 items', 'done']);
    expect(titles).toContainEqual(['2 items · 2 layers', 'done']);
    expect(app.layers.items.map((i) => [i.name, i.layers.length])).toEqual([['Fox bookmark', 1], ['Owl bookmark', 1]]);
    expect(app.layers.layerAt(150, 500)).toBe(1);
    expect(app.layers.layerAt(550, 500)).toBe(2);
    expect(app.layers.layerAt(950, 50)).toBeNull();
    expect(app.working).toBeNull();
  });

  it('the work-area tools: pick, area, stroke width, draw mode', () => {
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    const f = app.layers;
    f.setTool('area'); f.setArea({ x1: 500, y1: 600, x2: 100, y2: 200 });
    expect(f.area).toEqual({ x1: 100, y1: 200, x2: 500, y2: 600 });
    f.setArea({ x1: 1, y1: 1, x2: 2, y2: 2 }); expect(f.area).toBeNull();
    f.setArea({ x1: 0, y1: 0, x2: 50, y2: 50 }); f.setTool('line'); expect(f.area).toBeNull();
    f.setStrokeWidth(200); expect(f.strokeWidth).toBe(60);
    f.setDrawMode('erase'); expect(f.drawMode).toBe('erase');
    expect(f.items).toEqual([]);
  });

  it('“one solid outline” fills a layer in; “merge the gold and red layers” joins two named layers', async () => {
    const app = await craft();
    const f = app.layers;
    const black = f.layers.find((l) => l.name === 'Black cat')!;
    await app.ask('the black cat layer should be one solid outline, the inner sections can be merged', '/make/layers');
    await settle();
    expect(app.flow.conversation.log.at(-1)?.text).toMatch(/Black cat: filled the inner sections/);
    expect(f.layers.find((l) => l.name === 'Black cat')!.visiblePct).toBeGreaterThanOrEqual(black.visiblePct);
    const n = f.layers.length;
    await app.ask('merge the gold and the red layers', '/make/gaps');
    expect(f.layers.length).toBe(n - 1);
    expect(f.layers.some((l) => /Gold backer \+ Red leaves|Red leaves \+ Gold backer/.test(l.name))).toBe(true);
    expect(app.flow.conversation.log.at(-1)?.text).toContain('merged');
  });

  it('how it is built: stacked (additive, on a backing), inlay (pieces) or engrave + cut (engraving first)', async () => {
    expect(buildFor(brief)).toBe('stacked');
    expect(buildFor({ ...brief, class: 'pattern-shape', notes: 'soft shadows under each layer' })).toBe('stacked');
    expect(buildFor({ ...brief, class: 'pattern-shape', notes: '', likelyMaterial: 'wood' })).toBe('engrave');
    expect(buildFor({ ...brief, class: 'pattern-shape', notes: '', likelyMaterial: 'paper' })).toBe('inlay');
    expect(buildFor(null)).toBe('stacked');
    const app = await craft();
    const f = app.layers;
    expect(f.build).toBe('stacked');
    const n = f.layers.length;
    // stacked: a front layer's sheet includes what sits under the layers in front; the back is the whole outline
    const stackedSheet = f.sheetPointsFor(2), ownPiece = f.regionForLayer(f.layers[1])!.paths!;
    expect(stackedSheet).not.toEqual(ownPiece);
    app.setBuild('inlay');
    expect(f.sheetPointsFor(2)).toEqual(ownPiece);
    expect(f.sheetPointsFor(1)).toEqual(f.regionForLayer(f.layers[0])!.cutPaths);
    expect(app.flow.conversation.log.at(-2)?.text).toBe('Build it as separate pieces');
    expect(app.flow.conversation.log.at(-1)?.step?.title).toBe('Separate pieces on a backing');
    app.setBuild('engrave');
    expect(f.passOrder).toEqual([...Array.from({ length: n - 1 }, (_, i) => i + 2), 1]);
    expect([f.opFor(1), f.opFor(2)]).toEqual(['cut', 'engrave']);
    expect(f.jobLayer.n).toBe(2);
    expect(f.sheetStatus(2)).toBe('current'); expect(f.sheetStatus(1)).toBe('waiting');
    app.exportSheets(); await settle();
    expect(f.sheetPaths.map((s) => s.layer)).toEqual(f.passOrder);
    expect(f.sheetPaths.map((s) => s.op)).toEqual([...Array(n - 1).fill('engrave'), 'cut']);
    expect(f.sheetFor(1)?.op).toBe('cut');
  });

  it('a photo has no scale: Spark’s real-size estimate sets the mm; the user scales it, proportions kept', async () => {
    const app = await craft();
    const f = app.layers;
    const z = f.pieceSize!;
    expect(Math.max(z.wMm, z.hMm)).toBeGreaterThanOrEqual(395); expect(Math.max(z.wMm, z.hMm)).toBeLessThanOrEqual(405);
    expect(f.sizeBasis).toContain('wall art');
    const bg = app.flow.conversation.log.find((e) => e.step?.title === 'Background removed')!;
    expect(bg.step!.detail).toMatch(/about \d+ × \d+ mm/);
    const ratio = z.wMm / z.hMm;
    await app.ask('make it 200 mm wide', '/make/layers');
    expect(f.pieceSize!.wMm).toBeGreaterThanOrEqual(199); expect(f.pieceSize!.wMm).toBeLessThanOrEqual(201);
    expect(f.pieceSize!.wMm / f.pieceSize!.hMm).toBeCloseTo(ratio, 1);
    expect(app.flow.conversation.log.at(-1)?.step?.title).toMatch(/^Scaled to 20\d × \d+ mm/);
    app.setSize(30, 'h');
    expect(f.pieceSize!.hMm).toBeGreaterThanOrEqual(29); expect(f.pieceSize!.hMm).toBeLessThanOrEqual(31);
    expect(app.flow.conversation.log.at(-2)?.text).toBe('Make it 30 mm tall');
    await app.ask('scale it to 50%', '/make/layers');
    expect(f.pieceSize!.hMm).toBeLessThanOrEqual(16);
    // the sheets are traced at the real size, framed on the piece
    app.exportSheets(); await settle();
    expect(f.sheetPaths[0].bbox!.w).toBeGreaterThan(0);
    expect(f.sheetPaths[0].bbox!.w).toBeLessThan(25);
  });

  it('wooden bookmarks: each item is a cut outline plus its engraving (engrave first), sized from the typical item; a virtual run plays every pass', async () => {
    // two wooden bookmarks with a dark engraved pattern inside each, on a pale wall
    const w = 120, h = 120, data = new Uint8ClampedArray(w * h * 4);
    const set = (x: number, y: number, [r, g, b]: number[]) => { const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      set(x, y, [235, 232, 226]);
      for (const x0 of [12, 72]) if (x >= x0 && x < x0 + 30 && y >= 12 && y < 108) set(x, y, (x - x0 > 8 && x - x0 < 22 && y > 30 && y < 90 && (y % 6 < 2)) ? [70, 42, 20] : [205, 160, 110]);
    }
    const px = { data, w, h };
    const names = ['Fox bookmark', 'Owl bookmark'];
    const multi: ImageBrief = { ...brief, subject: 'two wooden bookmarks', class: 'pattern-shape', arrangement: 'multiple-items', likelyMaterial: 'wood', items: [], realSizeMm: { w: 50, h: 180, basis: 'a typical bookmark' }, regions: names.map((label, i) => ({ id: `b${i}`, label, samPrompt: 'bookmark', likelyBought: false, note: '' })) };
    const rect = (x0: number): [number, number][] => [[(x0 / w) * 1000, 100], [((x0 + 30) / w) * 1000, 100], [((x0 + 30) / w) * 1000, 900], [(x0 / w) * 1000, 900]];
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    globalThis.fetch = (async (u: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}');
      const json = String(u).includes('scene') ? { brief: multi, source: 'live', trace: [] }
        : String(u).includes('segment') && Array.isArray(body.regions) ? { regions: body.regions.map((r: { id: string; label: string }, i: number) => ({ ...r, areaPct: 20, paths: [rect(i ? 72 : 12)], keep: true, itemId: r.id, itemName: r.label })), source: 'live', trace: [] }
        : String(u).includes('segment') ? { boxes: [{ x1: 100, y1: 100, x2: 900, y2: 900 }], source: 'fixture', trace: [] } : { pieces: [], source: 'fixture', trace: [] };
      return { ok: true, json: async () => json };
    }) as unknown as typeof fetch;
    app.muse.pixels = async () => px;
    app.startCraft('flat');
    app.startFromCapture({ images: ['data:image/png;base64,AAAA'], mode: 'single' });
    app.visit('layers');
    await app.briefReady; await settle(); await app.planReady; await settle();
    const f = app.layers;
    expect(f.items.map((i) => [i.name, i.layers.map((l) => l.role)])).toEqual([['Fox bookmark', ['cut', 'engrave']], ['Owl bookmark', ['cut', 'engrave']]]);
    const fox = f.itemSize('Fox bookmark')!;
    expect(fox.hMm).toBeGreaterThanOrEqual(170); expect(fox.hMm).toBeLessThanOrEqual(190);
    const found = app.flow.conversation.log.find((e) => e.step?.title === 'Found 2 items')!;
    expect(found.step!.detail).toMatch(/Fox bookmark \(\d+ × \d+ mm\).*engrave first, then cut.*a typical bookmark/);
    // each item on its own sheet, upright, its engraving turned and moved with it
    expect(f.separateItems).toBe(true);
    const foxCut = f.layers.find((l) => l.itemName === 'Fox bookmark' && l.role === 'cut')!, foxEng = f.layers.find((l) => l.itemName === 'Fox bookmark' && l.role === 'engrave')!;
    const pc = f.pieceFor(foxCut.n), pe = f.pieceFor(foxEng.n);
    expect(pc.turn).toBe(0); expect(pc.sheetMm).toEqual(pe.sheetMm);
    expect(pc.sheetMm[1]).toBeGreaterThan(pc.sheetMm[0] * 2);
    expect(Math.min(...pc.shapes.flat().map((p) => p[0]))).toBeCloseTo(5, 0);
    await app.ask('straighten each of the bookmarks as separate items', '/make/layers');
    expect(app.flow.conversation.log.at(-1)?.step?.title).toBe('Each of the 2 items is on its own sheet, upright');
    expect(f.view).toBe('cut');
    expect(app.hiddenItems()).toEqual([]);
    // the cut queue takes the cut plan's sheets: each bookmark is one sheet, its engraving and its cut together
    // (engraving first), turned upright
    app.queue.items = [];
    expect(app.queueSheets()).toBe(2);
    expect(app.queue.items.map((i) => i.name)).toEqual(['Fox bookmark', 'Owl bookmark']);
    const q = app.queue.items[0];
    expect(q.op).toBe('cut');
    expect(q.sheetMm[1]).toBeGreaterThan(q.sheetMm[0] * 2);
    expect(q.shapes.length).toBeGreaterThan(1);
    expect(q.cut).toMatch(/^M/);
    // engraving runs first, then the cuts
    expect(f.passOrder.map((n) => f.opFor(n))).toEqual(['engrave', 'engrave', 'cut', 'cut']);
    const pv = f.previewFor(f.passOrder[0]);
    expect(pv).toMatchObject({ mode: 'engrave' }); expect(pv.cut).toMatch(/^M/); expect(pv.engrave).toMatch(/^M/);
    expect(f.previewFor(f.passOrder[2]).mode).toBe('cut');
    expect(f.previewFor(99).cut).toBe('');
    // the whole run, start to end
    vi.useFakeTimers();
    const run = app.playRun();
    for (let i = 0; i < 400 && f.job.phase !== 'done'; i++) await vi.advanceTimersByTimeAsync(200);
    await run; vi.useRealTimers();
    expect(f.job.phase).toBe('done');
    expect(app.flow.conversation.log.some((e) => /virtual run of all 4 passes — engraving first/.test(e.text))).toBe(true);
    app.stopRun();
  }, 20_000);

  it('free text the keywords miss is read by Muse Spark as one edit, and code applies it', async () => {
    const app = await craft();
    const f = app.layers;
    const gold = f.layers.find((l) => l.name === 'Gold backer')!;
    const base = globalThis.fetch;
    const answers = [{ op: 'fill', colour: '', other: '', reply: 'I’ll fill the enclosing shape of the backing.' }, { op: 'merge', colour: '', other: 'red leaves', reply: 'Merging with the red leaves.' }, { op: 'none', colour: '', other: '', reply: '' }];
    globalThis.fetch = (async (u: string, init?: unknown) => String(u).includes('layer-op') ? { ok: true, json: async () => ({ answer: answers.shift(), source: 'live', trace: [{ costUsd: 0.002 }] }) } : (base as (u: string, i?: unknown) => Promise<unknown>)(u, init)) as unknown as typeof fetch;
    app.quoteLayer(gold.n);
    await app.ask('identify the outer boundary and make the backing complete', '/make/layers'); await settle(); await settle();
    const steps = app.flow.conversation.log.filter((e) => e.step).map((e) => e.step!);
    expect(steps.at(-2)?.title).toBe('I’ll fill the enclosing shape of the backing.');
    expect(steps.at(-2)?.calls[0]?.model).toBe('Muse Spark 1.3');
    expect(steps.at(-1)?.title).toMatch(/Gold backer: filled the inner sections/);
    expect(f.view).toBe('only');
    const n = f.layers.length;
    app.quoteLayer(1);
    await app.ask('join it up with the leafy one', '/make/layers'); await settle();
    expect(f.layers.length).toBe(n - 1);
    expect(app.flow.conversation.log.at(-1)?.step?.title).toMatch(/^Merged Gold backer with Red leaves/);
    app.quoteLayer(1);
    await app.ask('make it prettier for my mum', '/make/layers'); await settle();
    expect(app.flow.conversation.log.at(-1)?.step).toMatchObject({ status: 'done', title: expect.stringMatching(/^Noted for /) });
    globalThis.fetch = base;
  });

  it('on Capture the chat analyzes the photo (instruction applied first); Home starters only show on Home', async () => {
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ brief, source: 'live', trace: [] }) })) as unknown as typeof fetch;
    app.muse.pixels = async () => photo();
    app.page = '/workshop';
    expect(app.suggestions).toContain('A layered mountain picture');
    app.startCraft('flat');
    app.page = '/capture';
    expect(app.suggestions).toEqual([]);
    expect(await app.ask('analyze it', '/capture')).toBeNull();
    expect(app.flow.conversation.log.at(-1)?.text).toMatch(/Add a photo first/);
    app.capture.capture('data:image/png;base64,AAAA', 'upload');
    expect(app.suggestions).toContain('Analyze it');
    expect(await app.ask('remove the shadow and wall and identify the layers for the shape', '/capture')).toBe('/make/layers');
    expect(app.layers.removeBackdrop).toBe(true);
    expect(app.flow.conversation.log.at(-1)?.text).toMatch(/remove the wall and shadows/);
    app.page = '/make/gaps';
    expect(app.suggestions).not.toContain('A layered mountain picture');
  });

  it('each craft keeps its own chat: a new craft starts a new one, reopening brings it back', async () => {
    const store = new ProjectStore(new MemoryStorage());
    const app = new AppState(store);
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ brief, source: 'live', trace: [] }) })) as unknown as typeof fetch;
    app.muse.pixels = async () => null;
    app.startCraft('flat');
    app.startFromCapture({ images: ['data:image/png;base64,AAAA'], mode: 'single' });
    await app.briefReady; await settle();
    app.flow.conversation.ingestTranscript('the cat one, please');
    app.save(); await settle();
    const first = app.project!.id;
    const said = app.flow.conversation.log.length;
    app.startCraft('a birdhouse like this');
    expect(app.flow.conversation.log.map((e) => e.text)).not.toContain('the cat one, please');
    expect(app.flow.conversation.log[0]).toMatchObject({ role: 'user', text: 'a birdhouse like this' });
    app.open(first); await app.hydrating;
    expect(app.flow.conversation.log).toHaveLength(said);
    expect(app.flow.conversation.log.at(-1)?.text).toBe('the cat one, please');
  });

  it('several pictures of one object, any number: Muse sorts them; close-ups and plans are reference; the views unfold', async () => {
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    const pictures = [{ index: 1, kind: 'view', angle: 'front', note: '' }, { index: 2, kind: 'detail', angle: 'unknown', note: 'lit doorway' }, { index: 3, kind: 'view', angle: 'three-quarter', note: '' }, { index: 4, kind: 'view', angle: 'top', note: '' }, { index: 5, kind: 'plan', angle: 'unknown', note: 'parts layout' }];
    globalThis.fetch = (async (u: string) => ({ ok: true, json: async () => (String(u).includes('views') ? { brief: { subject: 'a lit wooden castle', likelyMaterial: 'wood', realSizeMm: { w: 260, h: 300, d: 260, basis: 'a desk-sized model' }, pictures }, source: 'live', trace: [{ costUsd: 0.03 }] } : {}) })) as unknown as typeof fetch;
    app.startCraft('flat');
    for (let i = 0; i < 5; i++) app.capture.setMode('multi');
    const imgs = Array.from({ length: 5 }, (_, i) => `data:image/jpeg;base64,${i}`);
    app.capture.upload(imgs);
    expect(app.capture.done).toBe(true);
    app.startFromCapture({ images: imgs.slice(0, 1), mode: 'multi', views: imgs });
    await app.briefReady; await settle();
    const look = app.flow.conversation.log.find((e) => e.step?.title === 'I see a lit wooden castle')!;
    expect(look.step!.detail).toMatch(/front · close-up · ¾ view · top · cut plan — close-ups and plans are kept as reference · not seen: .*about 260 × 300 × 260 mm/);
    expect(app.layers.done).toEqual(['front', 'right', 'top']);
    expect(app.layers.outline.sizeMm).toBe(300);
    app.visit('views'); await settle(); await settle();
    // a cut plan among them is read first (no pixels here, so no sheets: the views are stitched instead)
    await vi.waitFor(() => expect(app.layers.objectSpec).not.toBeNull(), { timeout: 12000 });
    expect(app.flow.conversation.log.some((e) => e.step?.title === 'I couldn’t find the sheets in the plan')).toBe(true);
    app.page = '/make/views';
    expect(app.suggestions.some((x) => typeof x !== 'string' && x.label === 'Cut the parts')).toBe(true);
  }, 20_000);

  it('on Cut, “play the whole run” in the chat runs every pass', async () => {
    const app = await craft();
    app.visit('output');
    vi.useFakeTimers();
    await app.ask('play the whole run', '/make/output');
    for (let i = 0; i < 400 && app.layers.job.phase !== 'done'; i++) await vi.advanceTimersByTimeAsync(200);
    vi.useRealTimers();
    expect(app.layers.job.phase).toBe('done');
    app.page = '/make/output';
    expect(app.suggestions).toEqual([{ label: 'Put it together', href: '/make/assemble', id: 'say' }]);
  }, 20_000);

  it('the cut queue: a craft’s sheets go in (said in the chat), in cutting order; one layer on its own', async () => {
    const app = await craft();
    app.queue.items = [];
    expect(app.queueSheets()).toBe(4);
    expect(app.queue.items.map((i) => i.layer)).toEqual(app.layers.passOrder);
    expect(app.flow.conversation.log.at(-1)?.step?.title).toBe('Added 4 sheets to the cut queue');
    expect(app.flow.conversation.log.at(-1)?.actions?.[0]).toEqual({ label: 'Open the cut queue', href: '/queue' });
    expect(app.queueSheets([1])).toBe(0);
    expect(app.flow.conversation.log.at(-1)?.step?.title).toBe('Already in the cut queue');
    app.guideStep('layers');
    expect(app.suggestions.some((x) => typeof x !== 'string' && x.id === 'queue')).toBe(true);
  });
});
