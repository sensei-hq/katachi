import { describe, expect, it } from 'vitest';
import { fromLoops, type Geometry, type Pt } from './index';
import { hausdorff } from './measure';
import { simplify } from './simplify';

const circle = (r: number, n: number, c: Pt = [0, 0]): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Pt;
  });
const countPts = (g: Geometry) => g.paths.reduce((n, p) => n + 1 + p.segs.length, 0);

describe('geo simplify', () => {
  it('1000-point circle at tol 0.5 → under 80 points, hausdorff ≤ 0.5', () => {
    const g = fromLoops([circle(50, 1000)]);
    const s = simplify(g, 0.5);
    expect(countPts(s)).toBeLessThan(80);
    expect(hausdorff(s, g)).toBeLessThanOrEqual(0.5);
  });
  it('closed paths keep at least 3 points', () => {
    const s = simplify(fromLoops([[[0, 0], [1, 0], [0, 1]]]), 100);
    expect(countPts(s)).toBe(3);
    expect(s.paths[0].closed).toBe(true);
  });
  it('open strokes stay open, curves come out as L', () => {
    const bez: Geometry = {
      paths: [{ start: [0, 0], segs: [{ k: 'C', c1: [0, 10], c2: [10, 10], to: [10, 0] }], closed: false }],
    };
    const s = simplify(bez, 0.5);
    expect(s.paths[0].closed).toBe(false);
    expect(s.paths[0].segs.every((sg) => sg.k === 'L')).toBe(true);
  });
  it('empty geometry in → empty out, no throw', () => {
    expect(simplify({ paths: [] }, 0.5)).toEqual({ paths: [] });
  });
});
