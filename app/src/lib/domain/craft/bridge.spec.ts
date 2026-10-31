import { describe, expect, it } from 'vitest';
import { craftToFlow } from './bridge';
import { migrateV1, type V1Snapshot } from './migrate';
import { rowsOf } from './index';

const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const project = { id: 'c', name: 'C', createdAt: 1, updatedAt: 1, kind: 'flat' };
const ids = () => { let k = 0; return () => `x${++k}`; };
const roundTrip = (snap: V1Snapshot) => { const a = migrateV1(project, snap, ids()); const f = craftToFlow(a); const b = migrateV1(project, { ...snap, ...f } as V1Snapshot, ids()); return { a, f, b }; };
const strip = (d: ReturnType<typeof migrateV1>) => JSON.parse(JSON.stringify(d.items, (k, v) => (typeof v === 'number' ? Math.round(v) : k === 'regionId' ? undefined : v)));

describe('craft → the screens’ shapes → craft', () => {
  it('separate items: rows (cut, then its engravings) round-trip with the same ids and geometry', () => {
    const snap: V1Snapshot = { aspect: 1, widthMm: 300,
      regionList: [{ id: 'a', name: 'A', paths: [rect(100, 100, 100, 600)], holes: [rect(130, 200, 20, 20)] }, { id: 'a-e', name: 'Ae', paths: [rect(120, 400, 30, 30)] }, { id: 'b', name: 'B', paths: [rect(500, 100, 100, 600)] }],
      stack: [{ n: 1, name: 'Fox · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'a', itemName: 'Fox', role: 'cut' }, { n: 2, name: 'Fox · engraving', colour: '#5A3A22', material: 'birch', visiblePct: 1, hiddenPct: 0, regionId: 'a-e', itemName: 'Fox', role: 'engrave' }, { n: 3, name: 'Owl · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'b', itemName: 'Owl', role: 'cut' }] };
    const { a, f, b } = roundTrip(snap);
    expect(f.stack.map((l) => [l.n, l.name, l.role, l.itemName])).toEqual([[1, 'Fox · cut', 'cut', 'Fox'], [2, 'Fox · engraving', 'engrave', 'Fox'], [3, 'Owl · cut', 'cut', 'Owl']]);
    expect(f.regionList[0].holes).toHaveLength(1);
    expect(rowsOf(b).map((r) => [r.n, r.name, r.part.id, r.op?.id])).toEqual(rowsOf(a).map((r) => [r.n, r.name, r.part.id, r.op?.id]));
    expect(strip(b)).toEqual(strip(a));
  });
  it('stacked art: what shows and the whole sheet both survive; the layer list is the same', () => {
    const snap: V1Snapshot = { build: 'stacked', aspect: 1, widthMm: 300,
      regionList: [0, 1].map((i) => ({ id: `r${i}`, name: `R${i}`, paths: [rect(200 + i * 50, 200, 300, 300)], cutPaths: [rect(100, 100, 600, 600)] })),
      stack: ['Gold', 'Black'].map((n, i) => ({ n: i + 1, name: n, colour: '#000000', material: 'card', visiblePct: 30, hiddenPct: 10, regionId: `r${i}` })) };
    const { a, f, b } = roundTrip(snap);
    expect(f.stack.map((l) => l.name)).toEqual(['Gold', 'Black']);
    expect(f.regionList[1].paths[0][0]).toEqual([250, 200]);
    expect(f.regionList[1].cutPaths![0][0]).toEqual([100, 100]);
    expect(strip(b)).toEqual(strip(a));
  });
});
