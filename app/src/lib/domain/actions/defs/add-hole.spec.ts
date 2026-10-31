import { describe, expect, it } from 'vitest';
import { area, depths, toLoops, type Pt } from '../../geo';
import { addHole } from './add-hole';
import { craftOf, sq, testCtx } from './fixtures';

const bookmark = (frame?: Parameters<typeof craftOf>[0]['items'][0]['frame']) => craftOf({ items: [
  { name: 'Bookmark', frame, parts: [{ name: 'Board', ops: [{ kind: 'cut', loops: [[[0, 10], [60, 10], [60, 50], [0, 50]] as Pt[]] }] }] },
  { name: 'Other', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
] });

describe('add-hole', () => {
  it('cuts a 3mm circle on the long axis, area down πr² within 2%', async () => {
    const doc = bookmark(), before = structuredClone(doc);
    const r = await addHole.run(doc, { targets: ['item0'], opts: { diaMm: 3, at: 'top' } }, testCtx());
    const [geom] = r.items[0].parts.map((p) => p.ops[0].geometry);
    // outline is 60x40px at y 10..50; top y=10, centre x=30, hole edge 12px in, r=6px → centre (30, 28)
    expect(depths(geom)).toEqual([0, 1]);
    const loops = toLoops(geom);
    const hole = loops[1];
    const xs = hole.map((p) => p[0]), ys = hole.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(24, 0);
    expect(Math.max(...xs)).toBeCloseTo(36, 0);
    expect(Math.min(...ys)).toBeCloseTo(22, 0);
    expect(Math.max(...ys)).toBeCloseTo(34, 0);
    const a0 = area(doc.items[0].parts[0].ops[0].geometry);
    expect((a0 - area(geom)) / (Math.PI * 36)).toBeCloseTo(1, 1); // π·6² px²
    expect(r.summary).toContain('3 mm');
    expect(doc).toEqual(before);
  });
  it('top means smallest y after the frame rotation', async () => {
    const doc = bookmark({ size: [100, 100], fromSource: { rotateDeg: 90 } });
    const r = await addHole.run(doc, { targets: ['item0'], opts: { diaMm: 3, at: 'top' } }, testCtx());
    const [geom] = r.items[0].parts.map((p) => p.ops[0].geometry);
    expect(depths(geom)).toEqual([0, 1]);
    const a0 = area(doc.items[0].parts[0].ops[0].geometry);
    expect((a0 - area(geom)) / (Math.PI * 36)).toBeCloseTo(1, 1);
  });
  it('refuses holes too close to the edge, missing outlines, and bad targets', () => {
    const doc = bookmark();
    const good = { diaMm: 3, at: 'top' as const };
    expect(addHole.can(doc, { targets: ['item0'], opts: good })).toBe(true);
    expect(addHole.can(doc, { targets: [], opts: good })).not.toBe(true);
    expect(addHole.can(doc, { targets: ['nope'], opts: good })).not.toBe(true);
    expect(addHole.can(doc, { targets: ['item0'], opts: { diaMm: 0, at: 'top' } })).not.toBe(true);
    expect(addHole.can(doc, { targets: ['item0'], opts: { diaMm: 3, at: 'bottom' as 'top' } })).not.toBe(true);
    // 10px outline cannot hold a 12px hole with a 1mm margin
    const tiny = craftOf({ items: [{ name: 'T', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] }] });
    expect(addHole.can(tiny, { targets: ['item0'], opts: good })).not.toBe(true);
    const noCut = craftOf({ items: [{ name: 'E', parts: [{ name: 'Mark', ops: [{ kind: 'engrave', loops: [sq(0, 0, 10)] }] }] }] });
    expect(addHole.can(noCut, { targets: ['item0'], opts: good })).not.toBe(true);
  });
});
