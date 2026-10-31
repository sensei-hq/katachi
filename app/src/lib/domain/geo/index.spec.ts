import { describe, expect, it } from 'vitest';
import { bbox, flip, fromLoops, rotate, toLoops, toSvgD, transform } from './index';

describe('geo core', () => {
  const sq = fromLoops([[[0, 0], [10, 0], [10, 10], [0, 10]]]);
  it('loops ↔ geometry, bounds, svg', () => {
    expect(toLoops(sq)).toEqual([[[0, 0], [10, 0], [10, 10], [0, 10]]]);
    expect(bbox(sq)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(toSvgD(sq)).toBe('M0 0L10 0L10 10L0 10Z');
  });
  it('curves flatten within tolerance', () => {
    const g = { paths: [{ start: [0, 0] as [number, number], segs: [{ k: 'C' as const, c1: [0, 10] as [number, number], c2: [10, 10] as [number, number], to: [10, 0] as [number, number] }], closed: false }] };
    const pts = toLoops(g, 0.1)[0];
    expect(pts.length).toBeGreaterThan(5); expect(pts.at(-1)).toEqual([10, 0]);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(7.5, 0);
  });
  it('rotate and flip; a mirror keeps the winding (loop reversed)', () => {
    const r = toLoops(transform(sq, rotate(90, [5, 5])))[0].map(([x, y]) => [Math.round(x), Math.round(y)]);
    expect(r[0]).toEqual([10, 0]);
    const f = transform(sq, flip('x', [5, 5]));
    expect(bbox(f)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    const signed = (l: number[][]) => l.reduce((acc, p, i) => { const q = l[(i + 1) % l.length]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0);
    expect(Math.sign(signed(toLoops(f)[0]))).toBe(Math.sign(signed(toLoops(sq)[0])));
  });
});
