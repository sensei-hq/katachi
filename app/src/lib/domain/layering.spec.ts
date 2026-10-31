import { describe, expect, it } from 'vitest';
import { colourLayers, colourOfTitle, maskToPaths, rasterisePaths, subjectMask } from './layering';

// A synthetic "wall art" photo: a beige wall with a darker diagonal shadow, a gold disc (the backer) carrying
// a black disc, a red blob and thin white strokes (whiskers), plus a green plant touching the left edge.
function photo(w = 120, h = 120) {
  const data = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, [r, g, b]: number[]) => { const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const shadow = (x + y) % 40 < 14;
    set(x, y, shadow ? [196, 176, 146] : [226, 208, 178]);
    const d = Math.hypot(x - 64, y - 60);
    if (d < 40) set(x, y, [214, 156, 72]);
    if (d < 32) set(x, y, [22, 20, 20]);
    if (Math.hypot(x - 52, y - 70) < 9) set(x, y, [182, 58, 42]);
    if (y === 50 && x > 60 && x < 90) set(x, y, [240, 232, 226]);
    if (y === 54 && x > 62 && x < 92) set(x, y, [240, 232, 226]);
    if (x < 8 && y > 30 && y < 60) set(x, y, [70, 110, 50]);
  }
  return { data, w, h };
}

describe('background removal by colour (code measures the wall from the photo edge)', () => {
  it('“remove the wall” never eats the art: the strict pass keeps at least most of the normal outline', () => {
    const img = photo();
    const normal = subjectMask(img).areaPct, strict = subjectMask(img, { strict: true }).areaPct;
    expect(strict).toBeGreaterThan(normal * 0.8);
    expect(strict).toBeLessThanOrEqual(normal);
  });
  it('keeps the art, drops the wall with its shadows and the plant at the edge', () => {
    const img = photo();
    const s = subjectMask(img);
    const disc = Math.PI * 40 * 40 / (120 * 120) * 100;
    expect(s.areaPct).toBeGreaterThan(disc * 0.9);
    expect(s.areaPct).toBeLessThan(disc * 1.15);
    expect(s.bits[60 * 120 + 64]).toBe(1);   // centre of the art
    expect(s.bits[45 * 120 + 3]).toBe(0);    // the plant
    expect(s.bits[5 * 120 + 5]).toBe(0);     // shadowed wall
  });
});

describe('colour layers (stacked art is split by colour, not by phrase)', () => {
  const img = photo();
  const subject = subjectMask(img).bits;
  const layers = colourLayers(img, subject, { k: 4, titles: ['Gold backer', 'Black cat', 'Red leaves', 'White whiskers'] });

  it('finds one layer per colour, named from the titles, the outline-carrying layer at the back', () => {
    expect(layers.map((l) => l.name)).toEqual(['Gold backer', 'Black cat', expect.any(String), expect.any(String)]);
    expect(new Set(layers.map((l) => l.name))).toEqual(new Set(['Gold backer', 'Black cat', 'Red leaves', 'White whiskers']));
    expect(layers[0].hiddenPct).toBeGreaterThan(50);
  });

  it('keeps one-pixel white strokes (whiskers) as their own cut paths', () => {
    const white = layers.find((l) => l.name === 'White whiskers')!;
    expect(white.visiblePaths.length).toBeGreaterThanOrEqual(2);
    const bits = rasterisePaths(white.visiblePaths, 120, 120);
    expect(bits[50 * 120 + 75] || bits[51 * 120 + 75]).toBe(1);
  });

  it('every sheet is what shows plus what sits under the layers in front', () => {
    const back = rasterisePaths(layers[0].sheetPaths, 120, 120);
    expect(back[60 * 120 + 64]).toBe(1);
    const red = layers.find((l) => l.name === 'Red leaves')!;
    expect(red.visiblePct).toBeGreaterThan(1);
  });
});

describe('helpers', () => {
  it('reads a colour from a layer title', () => {
    expect(colourOfTitle('Red Leaf Filler')).not.toBeNull();
    expect(colourOfTitle('Cat face features')).toBeNull();
  });
  it('paths ↔ mask round trip', () => {
    const bits = new Uint8Array(40 * 40); for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) bits[y * 40 + x] = 1;
    const back = rasterisePaths(maskToPaths(bits, 40, 40), 40, 40);
    let same = 0; for (let i = 0; i < bits.length; i++) if (bits[i] === back[i]) same++;
    expect(same / bits.length).toBeGreaterThan(0.97);
  });
});

describe('one-layer corrections from the chat', async () => {
  const { parseLayerOp, refineLayer } = await import('./layering');
  it('reads the common asks', () => {
    expect(parseLayerOp('the whiskers are missing')).toEqual({ kind: 'detail' });
    expect(parseLayerOp('make it bolder')).toEqual({ kind: 'bolder' });
    expect(parseLayerOp('take the wall out of this layer')).toEqual({ kind: 'remove', backdrop: true });
    expect(parseLayerOp('remove the red parts')).toMatchObject({ kind: 'remove', word: 'red' });
    expect(parseLayerOp('add the gold rim')).toMatchObject({ kind: 'add', word: 'gold' });
    expect(parseLayerOp('make it prettier')).toBeNull();
  });
  it('bolder grows one layer; fine detail brings thin strokes back', () => {
    const img = photo(); const subject = subjectMask(img).bits;
    const layers = colourLayers(img, subject, { k: 4, titles: ['Gold backer', 'Black cat', 'Red leaves', 'White whiskers'] });
    const i = layers.findIndex((l) => l.name === 'White whiskers');
    const ctx = { colours: layers.map((l) => l.hex), index: i, front: layers.slice(i + 1).flatMap((l) => l.visiblePaths) };
    const bold = refineLayer(img, subject, { ...ctx, current: layers[i].visiblePaths, op: { kind: 'bolder' } });
    expect(bold.visiblePct).toBeGreaterThan(layers[i].visiblePct);
    const thin = refineLayer(img, subject, { ...ctx, current: [], op: { kind: 'detail' } });
    expect(thin.visiblePct).toBeGreaterThan(0);
    expect(thin.describe).toContain('fine detail');
  });
  it('the sliders re-measure the layer from the photo: finer keeps more, weight grows it', () => {
    const img = photo(); const subject = subjectMask(img).bits;
    const layers = colourLayers(img, subject, { k: 4, titles: ['Gold backer', 'Black cat', 'Red leaves', 'White whiskers'] });
    const i = layers.findIndex((l) => l.name === 'White whiskers');
    const ctx = { colours: layers.map((l) => l.hex), index: i, front: layers.slice(i + 1).flatMap((l) => l.visiblePaths), current: layers[i].visiblePaths };
    const fine = refineLayer(img, subject, { ...ctx, op: { kind: 'tune', detail: 5, weight: 0 } });
    const blocky = refineLayer(img, subject, { ...ctx, op: { kind: 'tune', detail: 1, weight: 0 } });
    const bold = refineLayer(img, subject, { ...ctx, op: { kind: 'tune', detail: 5, weight: 2 } });
    expect(fine.visiblePct).toBeGreaterThan(blocky.visiblePct);
    expect(bold.visiblePct).toBeGreaterThan(fine.visiblePct);
    expect(fine.describe).toContain('detail 5 of 5 (fine), weight 0');
    expect(blocky.describe).toContain('blocky');
    expect(refineLayer(img, subject, { ...ctx, op: { kind: 'tune', detail: 3, weight: -1 } }).describe).toContain('weight -1');
  });
  it('drawn shapes are added to or cut from the layer; an area is smoothed in place', () => {
    const img = photo(); const subject = subjectMask(img).bits;
    const ctx = { colours: ['#000000'], index: 0, front: [] as [number, number][][], current: [] as [number, number][][] };
    const circle = refineLayer(img, subject, { ...ctx, op: { kind: 'shape', shape: { type: 'circle', cx: 500, cy: 500, r: 100 }, mode: 'add' } });
    expect(circle.visiblePaths.length).toBe(1);
    expect(circle.describe).toContain('added a circle');
    const line = refineLayer(img, subject, { ...ctx, op: { kind: 'shape', shape: { type: 'line', x1: 100, y1: 100, x2: 800, y2: 300, width: 30 }, mode: 'add' } });
    expect(line.visiblePaths.length).toBe(1);
    const cut = refineLayer(img, subject, { ...ctx, current: circle.visiblePaths, op: { kind: 'shape', shape: { type: 'circle', cx: 500, cy: 500, r: 40 }, mode: 'erase' } });
    expect(cut.visiblePaths.length).toBe(2);
    expect(cut.describe).toContain('cut a circle out');
    const area = refineLayer(img, subject, { ...ctx, current: circle.visiblePaths, op: { kind: 'smoothArea', box: { x1: 0, y1: 0, x2: 1000, y2: 1000 }, strength: 3 } });
    expect(area.describe).toContain('jitter');
    expect(refineLayer(img, subject, { ...ctx, current: circle.visiblePaths, op: { kind: 'smoothArea', box: { x1: 600, y1: 0, x2: 400, y2: 1000 }, strength: 1 } }).describe).toContain('smoothed the curves');
  });
  it('shapes, moves and the jitter ask', async () => {
    const { shapePolygon, translatePaths, traceFor } = await import('./layering');
    expect(shapePolygon({ type: 'circle', cx: 0, cy: 0, r: 10 })).toHaveLength(48);
    expect(shapePolygon({ type: 'line', x1: 0, y1: 0, x2: 0, y2: 0, width: 4 }).length).toBeGreaterThan(4);
    expect(translatePaths([[[1, 2], [3, 4]]], 10, -1)).toEqual([[[11, 1], [13, 3]]]);
    expect(traceFor(1).tolerance).toBeGreaterThan(traceFor(5).tolerance);
    expect(parseLayerOp('reduce the jitter')).toEqual({ kind: 'smoother' });
    expect(parseLayerOp('it should be one solid piece')).toEqual({ kind: 'fill' });
    expect(parseLayerOp('complete the hidden edges of the fox bookmark')).toEqual({ kind: 'complete' });
    expect(parseLayerOp('the corner is covered by the owl, the edges are cut off')).toEqual({ kind: 'complete' });
    expect(parseLayerOp('just a full outline, inner sections merged')).toEqual({ kind: 'fill' });
  });
  it('completes an outline a neighbour bit into (its convex hull comes back)', () => {
    const img = photo(); const subject = subjectMask(img).bits;
    // a square with a bite taken out of one corner
    const bitten: [number, number][][] = [[[200, 200], [800, 200], [800, 500], [500, 500], [500, 800], [200, 800]]];
    const r = refineLayer(img, subject, { colours: ['#000000'], index: 0, current: bitten, front: [], op: { kind: 'complete' } });
    expect(r.describe).toContain('completed the hidden edges');
    expect(r.visiblePct).toBeGreaterThan(0);
  });
});

describe('readPlan · a cut plan from its picture (the castle kit, samples/3D/castle/castle_5.webp)', () => {
  it('finds the 11 framed sheets, named as the plan groups them (A1–A4, B1–B7), with pieces and engraving', async () => {
    const sharp = (await import('sharp')).default;
    const { readPlan } = await import('./layering');
    const { data, info } = await sharp(`${process.cwd()}/../samples/3D/castle/castle_5.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const sheets = readPlan({ w: info.width, h: info.height, data: new Uint8ClampedArray(data) });
    expect(sheets.map((s) => s.name)).toEqual(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
    for (const s of sheets) { expect(s.pieces).toBeGreaterThan(5); expect(s.cut.length).toBeGreaterThan(5); expect(s.sizeMm[0]).toBe(300); }
    expect(sheets.reduce((a, s) => a + s.pieces, 0)).toBeGreaterThan(150);
  }, 20_000);
});

describe('woodPiece · fretwork: holes cut through, thin lines engraved', () => {
  it('a dark blob inside the item is a hole; thin dark lines are engraving', async () => {
    const { woodPiece, rasterisePaths } = await import('./layering');
    const w = 100, h = 100, data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, hole = Math.hypot(x - 50, y - 35) < 10, line = y > 60 && y < 85 && x > 25 && x < 75 && y % 6 === 0, outside = x < 20 || x >= 80 || y < 10 || y >= 90;
      // a dark surface around the item: the hole shows it
      const c = outside || hole ? [30, 22, 18] : line ? [80, 50, 25] : [210, 170, 120];
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
    const item = rasterisePaths([[[200, 100], [800, 100], [800, 900], [200, 900]]], w, h);
    const r = woodPiece({ w, h, data }, item);
    expect(r.holesPct).toBeGreaterThan(5); expect(r.holesPct).toBeLessThan(10);
    expect(r.engravePct).toBeGreaterThan(1);
    expect(r.holePaths.length).toBe(1);
    expect(r.cutPaths.length).toBe(2);
  });
});
