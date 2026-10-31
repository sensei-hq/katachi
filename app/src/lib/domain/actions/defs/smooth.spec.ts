import { describe, expect, it } from 'vitest';
import { area, hausdorff, type Pt } from '../../geo';
import { smooth } from './smooth';
import { craftOf, sq, testCtx } from './fixtures';

/** a 40px square with a ±1px wobble on each edge */
const wobbly = (): Pt[] => {
  const pts: Pt[] = [];
  const edges: Pt[][] = [[[0, 0], [40, 0]], [[40, 0], [40, 40]], [[40, 40], [0, 40]], [[0, 40], [0, 0]]];
  for (const [[x1, y1], [x2, y2]] of edges) {
    for (let i = 0; i < 4; i++) {
      const t = i / 4, w = Math.sin(t * Math.PI * 2) * 1;
      const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny);
      pts.push([x1 + (x2 - x1) * t + (nx / l) * w, y1 + (y2 - y1) * t + (ny / l) * w]);
    }
  }
  return pts;
};

const twoParts = () => craftOf({ items: [
  { name: 'Fox', parts: [
    { name: 'Jagged', ops: [{ kind: 'cut', loops: [wobbly()] }, { kind: 'engrave', loops: [sq(10, 10, 10)] }] },
    { name: 'Other', ops: [{ kind: 'cut', loops: [sq(0, 0, 20)] }] },
  ] },
] });

describe('smooth', () => {
  it('keeps area within 3% and hausdorff within tolerance, both ops smoothed', async () => {
    const doc = twoParts(), before = structuredClone(doc);
    const r = await smooth.run(doc, { targets: ['part0-0'], opts: { strength: 2, passes: 1, keepCorners: true, cornerDeg: 35 } }, testCtx());
    expect(r.items.length).toBe(1);
    const [part] = r.items[0].parts;
    expect(part.ops.length).toBe(2);
    expect(part.ops.every((o) => o.geometry.paths.some((p) => p.segs.some((s) => s.k === 'C')))).toBe(true);
    for (let i = 0; i < 2; i++) {
      const a0 = area(doc.items[0].parts[0].ops[i].geometry);
      const a1 = area(part.ops[i].geometry);
      expect(a1 / a0).toBeGreaterThan(0.97);
      expect(a1 / a0).toBeLessThan(1.03);
      // strength 2 → 0.1 mm → 0.4 px at pxPerMm 4
      expect(hausdorff(part.ops[i].geometry, doc.items[0].parts[0].ops[i].geometry)).toBeLessThanOrEqual(0.4 * 1.5);
    }
    expect(r.detail).toMatch(/within \d+\.\d\d mm/);
    expect(r.summary).toContain('strength 2');
    expect(doc).toEqual(before);
  });
  it('leaves untargeted parts alone and refuses out-of-range options', () => {
    const doc = twoParts();
    const good = { strength: 2, passes: 1, keepCorners: true, cornerDeg: 35 };
    expect(smooth.can(doc, { targets: ['part0-0'], opts: good })).toBe(true);
    expect(smooth.can(doc, { targets: [], opts: good })).not.toBe(true);
    expect(smooth.can(doc, { targets: ['nope'], opts: good })).not.toBe(true);
    expect(smooth.can(doc, { targets: ['part0-0'], opts: { ...good, strength: 0 } })).not.toBe(true);
    expect(smooth.can(doc, { targets: ['part0-0'], opts: { ...good, strength: 6 } })).not.toBe(true);
    expect(smooth.can(doc, { targets: ['part0-0'], opts: { ...good, passes: 0 } })).not.toBe(true);
    expect(smooth.can(doc, { targets: ['part0-0'], opts: { ...good, passes: 4 } })).not.toBe(true);
    expect(smooth.can(doc, { targets: ['part0-0'], opts: { ...good, cornerDeg: 200 } })).not.toBe(true);
  });
});
