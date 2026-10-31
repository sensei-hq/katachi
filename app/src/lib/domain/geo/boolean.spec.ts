import { describe, expect, it } from 'vitest';
import { fromLoops, type Geometry, type Pt } from './index';
import { bridge, difference, hull, offset, union, weld } from './boolean';
import { area, depths, islands } from './measure';

const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const EMPTY: Geometry = { paths: [] };

describe('geo boolean', () => {
  it('offset: square 10 grown by 1 → 100 + 40 + π within 1%', () => {
    const o = offset(fromLoops([sq(0, 0, 10)]), 1);
    expect(area(o)).toBeCloseTo(100 + 40 + Math.PI, 0);
    expect(area(o) / (100 + 40 + Math.PI)).toBeGreaterThan(0.99);
  });
  it('offset: shrinking a 2x2 square by 2 → no paths; holes move the opposite way', () => {
    expect(offset(fromLoops([sq(0, 0, 2)]), -2).paths).toEqual([]);
    const o = offset(fromLoops([sq(0, 0, 10), sq(3, 3, 4)]), 1);
    expect(area(o)).toBeCloseTo(100 + 40 + Math.PI - 4, 0); // round outer, hole shrunk to 2x2
  });
  it('union/weld: two overlapping squares → 1 loop, area = sum − overlap', () => {
    const a = fromLoops([sq(0, 0, 10)]), b = fromLoops([sq(5, 0, 10)]);
    const u = union(a, b);
    expect(u.paths.length).toBe(1);
    expect(area(u)).toBeCloseTo(150, 0);
    const w = weld(fromLoops([sq(0, 0, 10), sq(5, 0, 10)]));
    expect(w.paths.length).toBe(1);
    expect(area(w)).toBeCloseTo(150, 0);
  });
  it('difference: square minus centred smaller → 1 outer + 1 hole', () => {
    const d = difference(fromLoops([sq(0, 0, 10)]), fromLoops([sq(3, 3, 4)]));
    expect(d.paths.length).toBe(2);
    expect(depths(d)).toEqual([0, 1]);
    expect(area(d)).toBeCloseTo(84, 0);
  });
  it('hull: square plus interior point → the square', () => {
    const h = hull(fromLoops([[...sq(0, 0, 10), [5, 5]]]));
    expect(area(h)).toBeCloseTo(100, 6);
  });
  it('bridge: O with width 1, per 2 → no islands, area grows ~2·width·gap', () => {
    const g = fromLoops([sq(0, 0, 10), sq(2, 2, 6), sq(4, 4, 2)]);
    const before = area(g); // 100 − 36 + 4 = 68, gap = 2
    const r = bridge(g, { width: 1, per: 2 });
    expect(islands(r)).toEqual([]);
    expect(area(r) - before).toBeCloseTo(2 * 1 * 2, 0);
  });
  it('empty geometry in → empty out, no throw', () => {
    expect(offset(EMPTY, 1)).toEqual(EMPTY);
    expect(union(EMPTY, EMPTY)).toEqual(EMPTY);
    expect(difference(EMPTY, EMPTY)).toEqual(EMPTY);
    expect(weld(EMPTY)).toEqual(EMPTY);
    expect(hull(EMPTY)).toEqual(EMPTY);
    expect(bridge(EMPTY, { width: 1 })).toEqual(EMPTY);
  });
});
