import { describe, expect, it } from 'vitest';
import { CraftState } from './craft.svelte';
import { ActionState } from './actions.svelte';
import { migrateV1 } from '../../domain/craft/migrate';
import { bbox, toLoops } from '../../domain/geo';

let k = 0;
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
// a tilted bookmark, and one with a bite taken out of its corner (a neighbour lay over it)
const tilted: [number, number][] = [[100, 100], [200, 80], [300, 700], [200, 720]];
const bitten: [number, number][] = [[500, 100], [600, 100], [600, 400], [530, 400], [530, 700], [500, 700]];
function craft() {
  const doc = migrateV1({ id: 'b', name: 'Bookmarks', createdAt: 1, updatedAt: 1, kind: 'flat' }, {
    aspect: 1, widthMm: 300,
    regionList: [{ id: 'a', name: 'A', paths: [tilted] }, { id: 'b', name: 'B', paths: [bitten], holes: [rect(540, 200, 20, 20)] }],
    stack: [{ n: 1, name: 'Fox · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'a', itemName: 'Fox', role: 'cut' }, { n: 2, name: 'Owl · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'b', itemName: 'Owl', role: 'cut' }]
  }, () => `m${++k}`);
  const c = new CraftState(() => 1); c.load(doc);
  return c;
}
// the photo: wood-coloured items on a dark table, the Owl with a dark see-through hole
function photo(w = 400, h = 400) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x / w) * 1000, v = (y / h) * 1000, i = (y * w + x) * 4;
    const inOwl = u >= 500 && u <= 600 && v >= 100 && v <= 700 && !(u >= 540 && u <= 560 && v >= 200 && v <= 220) && !(u > 530 && v > 400);
    const c = inOwl ? [205, 160, 110] : [30, 25, 22];
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { w, h, data };
}

describe('analysis actions', () => {
  it('straighten turns each item upright; twice is the same as once; undo puts the tilt back', async () => {
    const c = craft(), a = new ActionState(c, () => ({ newId: () => `n${++k}`, pixels: async () => null }));
    // as if it had never been straightened
    const d = c.toJSON(); d.items.forEach((i) => { i.frame.fromSource.rotateDeg = 0; }); c.load(d);
    const r = await a.perform('straighten', [{ all: true }]);
    expect(r.ok).toBe(true);
    const turn = c.items[0].turnDeg;
    expect(Math.abs(turn)).toBeGreaterThan(5);
    expect(Math.abs(c.items[1].turnDeg)).toBeLessThan(Math.abs(turn));
    await a.perform('straighten', [{ all: true }]);
    expect(c.items[0].turnDeg).toBe(turn);
    expect(a.done).toHaveLength(1); // the second changed nothing, so it is not a step
    a.undo();
    expect(c.items[0].turnDeg).toBe(0);
  });
  it('interpolate fills the bite in the Owl (its hole kept), leaves the Fox alone, and refuses big guesses', async () => {
    const c = craft(), a = new ActionState(c, () => ({ newId: () => `n${++k}`, pixels: async () => null }));
    const owl = c.items[1];
    const loops0 = toLoops(owl.parts[0].cut!.geometry);
    const r = await a.perform('interpolate', [{ all: true }], { maxAddPct: 40 });
    expect(r.ok && r.entry.summary).toBe('Filled in the hidden edges of Owl');
    const loops = toLoops(owl.parts[0].cut!.geometry);
    expect(loops).toHaveLength(2); // the outline + its hole
    expect(loops0).toHaveLength(2);
    const area = (l: number[][]) => Math.abs(l.reduce((s, p, i) => s + p[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * p[1], 0)) / 2;
    expect(Math.max(...loops.map(area))).toBeGreaterThan(Math.max(...loops0.map(area)));
    a.undo();
    const strict = await a.perform('interpolate', [{ all: true }], { maxAddPct: 2 });
    expect(strict.ok && strict.entry.summary).toMatch(/^Didn’t fill Owl/);
  });
  it('resize: width, height, scale keep the proportions; both sizes without keepAspect stretch it', async () => {
    const c = craft(), a = new ActionState(c, () => ({ newId: () => `n${++k}`, pixels: async () => null }));
    const owl = c.items[1];
    await a.perform('resize', [{ item: 'Owl' }], { hMm: 90 });
    expect(owl.sizeMm.hMm).toBeCloseTo(90, 0);
    const ratio = owl.sizeMm.wMm / owl.sizeMm.hMm;
    await a.perform('resize', [{ item: 'Owl' }], { scale: 2 });
    expect(owl.sizeMm.hMm).toBeCloseTo(180, 0);
    expect(owl.sizeMm.wMm / owl.sizeMm.hMm).toBeCloseTo(ratio, 2);
    await a.perform('resize', [{ item: 'Owl' }], { wMm: 40, hMm: 100, keepAspect: false });
    expect(owl.sizeMm.wMm).toBeCloseTo(40, 0); expect(owl.sizeMm.hMm).toBeCloseTo(100, 0);
    expect((await a.perform('resize', [{ item: 'Owl' }], { hMm: 1 })).ok).toBe(false);
    expect((await a.perform('resize', [{ item: 'Owl' }], {})).ok).toBe(false);
  });
  it('enhance: one tier up, cropped from the photo; SAM (when there) outlines again; holes re-measured; the size in mm stays', async () => {
    const c = craft(), img = photo();
    let asked = 0;
    const a = new ActionState(c, () => ({ newId: () => `n${++k}`, pixels: async () => img, muse: { segmentCrop: async () => { asked++; return { paths: [rect(0, 0, 1000, 1000)], costUsd: 0.0025, latencyMs: 10 }; } } }));
    const owl = c.items[1], size0 = owl.sizeMm, tier0 = owl.doc.frame.tier;
    const r = await a.perform('enhance', [{ item: 'Owl' }]);
    expect(r.ok).toBe(true);
    expect(asked).toBe(1);
    expect(owl.doc.frame.tier).not.toBe(tier0);
    expect(owl.sizeMm.hMm).toBeCloseTo(size0.hMm, 0);
    // the cut now carries the hole it measured (and the bite, as photographed): more than one loop
    expect(toLoops(owl.parts[0].cut!.geometry).length).toBeGreaterThanOrEqual(2);
    expect(bbox(owl.parts[0].cut!.geometry)!.h).toBeGreaterThan(owl.doc.frame.size[1] * 0.8);
    // no photo: nothing to enhance, said plainly
    const b = new ActionState(craft(), () => ({ newId: () => `n${++k}`, pixels: async () => null }));
    const none = await b.perform('enhance', [{ all: true }]);
    expect(none.ok && none.entry?.summary).toMatch(/Nothing could be enhanced/);
  });
});
