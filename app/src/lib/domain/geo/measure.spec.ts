import { describe, expect, it } from 'vitest';
import { fromLoops, type Geometry, type Pt } from './index';
import { area, depths, hausdorff, islands, longAxisDeg } from './measure';

const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const rev = (l: Pt[]): Pt[] => [...l].reverse();
const EMPTY: Geometry = { paths: [] };

describe('geo measure', () => {
  it('area: square = 100', () => {
    expect(area(fromLoops([sq(0, 0, 10)]))).toBeCloseTo(100, 6);
  });
  it('area: square with a 4x4 hole = 84, either winding', () => {
    const hole = sq(3, 3, 4);
    expect(area(fromLoops([sq(0, 0, 10), hole]))).toBeCloseTo(84, 6);
    expect(area(fromLoops([sq(0, 0, 10), rev(hole)]))).toBeCloseTo(84, 6);
  });
  it('depths/islands: O shape (outer, hole, island)', () => {
    const g = fromLoops([sq(0, 0, 10), sq(2, 2, 6), sq(4, 4, 2)]);
    expect(depths(g)).toEqual([0, 1, 2]);
    expect(islands(g)).toEqual([2]);
  });
  it('hausdorff: identical = 0, shifted square = shift', () => {
    const a = fromLoops([sq(0, 0, 10)]);
    expect(hausdorff(a, a)).toBeCloseTo(0, 6);
    expect(hausdorff(a, fromLoops([sq(1, 0, 10)]))).toBeCloseTo(1, 1);
  });
  it('longAxisDeg: 10x40 rect rotated 30deg', () => {
    const c: Pt = [20, 20];
    const rot = (p: Pt, deg: number): Pt => {
      const r = (deg * Math.PI) / 180, co = Math.cos(r), s = Math.sin(r);
      const dx = p[0] - c[0], dy = p[1] - c[1];
      return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co];
    };
    const rect: Pt[] = [[15, 0], [25, 0], [25, 40], [15, 40]].map((p) => rot(p as Pt, 30));
    const d = longAxisDeg(fromLoops([rect]));
    expect(Math.abs(d - 30) < 0.5 || Math.abs(Math.abs(d) - 60) < 0.5).toBe(true);
  });
  it('empty geometry: no throw', () => {
    expect(area(EMPTY)).toBe(0);
    expect(depths(EMPTY)).toEqual([]);
    expect(islands(EMPTY)).toEqual([]);
    expect(hausdorff(EMPTY, EMPTY)).toBe(0);
    expect(() => longAxisDeg(EMPTY)).not.toThrow();
  });
});
