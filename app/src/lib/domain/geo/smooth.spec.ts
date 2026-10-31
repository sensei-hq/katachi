import { describe, expect, it } from 'vitest';
import { fromLoops, toLoops, type Geometry, type Pt } from './index';
import { hausdorff } from './measure';
import { smooth } from './smooth';

/** circle with a ±0.4 radial wobble (deterministic jitter) */
const wobblyCircle = (r: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    const rr = r + 0.4 * Math.sin(7 * a);
    return [r + rr * Math.cos(a), r + rr * Math.sin(a)] as Pt;
  });

describe('geo smooth', () => {
  it('jittery circle at tol 0.5 → ≤12 C segs, hausdorff ≤ 0.75', () => {
    const g = fromLoops([wobblyCircle(20, 200)]);
    const s = smooth(g, { tol: 0.5 });
    const nC = s.paths.reduce((n, p) => n + p.segs.filter((sg) => sg.k === 'C').length, 0);
    expect(nC).toBeGreaterThan(0);
    expect(nC).toBeLessThanOrEqual(12);
    expect(hausdorff(s, g)).toBeLessThanOrEqual(0.75);
  });
  it('square keeps 4 sharp corners', () => {
    const corners: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const g = fromLoops([corners]);
    const s = smooth(g, { tol: 0.5 });
    expect(s.paths[0].segs.every((sg) => sg.k === 'C')).toBe(true);
    const ends = s.paths.flatMap((p) => [p.start, ...p.segs.map((sg) => sg.to)]);
    for (const c of corners) {
      expect(Math.min(...ends.map((e) => Math.hypot(e[0] - c[0], e[1] - c[1])))).toBeLessThanOrEqual(0.5);
    }
    expect(hausdorff(s, g)).toBeLessThanOrEqual(0.75);
  });
  it('open stroke stays open with fixed endpoints', () => {
    const g: Geometry = {
      paths: [{ start: [0, 0], segs: [{ k: 'L', to: [5, 1] }, { k: 'L', to: [10, 0] }], closed: false }],
    };
    const s = smooth(g, { tol: 0.5 });
    expect(s.paths[0].closed).toBe(false);
    expect(s.paths[0].start).toEqual([0, 0]);
    expect(s.paths[0].segs.at(-1)!.to).toEqual([10, 0]);
  });
  it('empty geometry in → empty out, no throw', () => {
    expect(smooth({ paths: [] }, { tol: 0.5 })).toEqual({ paths: [] });
  });
});

/** pixel staircase of a circle (traced-mask style): rounded samples joined by axis steps */
function staircaseCircle(cx: number, cy: number, r: number): Pt[] {
  const stairs: Pt[] = [];
  for (let a = 0; a < 360; a++) {
    const x = Math.round(cx + r * Math.cos((a * Math.PI) / 180)), y = Math.round(cy + r * Math.sin((a * Math.PI) / 180));
    const l = stairs.at(-1);
    if (!l || l[0] !== x || l[1] !== y) {
      if (l && l[0] !== x && l[1] !== y) stairs.push([x, l[1]]);
      stairs.push([x, y]);
    }
  }
  return stairs;
}

/** pixel staircase of a rotated square: fine samples rounded to pixels, joined by axis steps */
function staircaseSquare(cx: number, cy: number, s: number, deg: number): { loop: Pt[]; corners: Pt[] } {
  const t = (deg * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t);
  const corners: Pt[] = [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]].map(
    ([x, y]) => [cx + x * co - y * si, cy + x * si + y * co] as Pt,
  );
  const loop: Pt[] = [];
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = corners[e], [bx, by] = corners[(e + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.ceil(len / 0.5));
    for (let i = e === 0 ? 0 : 1; i <= n; i++) {
      const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n);
      const l = loop.at(-1);
      if (!l || l[0] !== x || l[1] !== y) {
        if (l && l[0] !== x && l[1] !== y) loop.push([x, l[1]]);
        loop.push([x, y]);
      }
    }
  }
  return { loop, corners };
}

const countC = (g: Geometry) => g.paths.reduce((n, p) => n + p.segs.filter((sg) => sg.k === 'C').length, 0);

describe('geo smooth, ragged outlines (T1 review)', () => {
  it('staircase circle r40 at tol 0.5 → ≤16 C segs, near the input and the true circle', () => {
    const g = fromLoops([staircaseCircle(50, 50, 40)]);
    const s = smooth(g, { tol: 0.5 });
    expect(countC(s)).toBeLessThanOrEqual(16);
    expect(hausdorff(s, g)).toBeLessThanOrEqual(0.75);
    for (const p of toLoops(s, 0.05).flat()) {
      expect(Math.abs(Math.hypot(p[0] - 50, p[1] - 50) - 40)).toBeLessThanOrEqual(0.75);
    }
  });
  it('per-vertex ±0.4 jitter r50 at tol 0.5 → ≤16 C segs, hausdorff ≤ 0.75', () => {
    const loop: Pt[] = Array.from({ length: 200 }, (_, i) => {
      const a = (2 * Math.PI * i) / 200, rr = 50 + (i % 2 === 0 ? 0.4 : -0.4);
      return [50 + rr * Math.cos(a), 50 + rr * Math.sin(a)] as Pt;
    });
    const g = fromLoops([loop]);
    const s = smooth(g, { tol: 0.5 });
    expect(countC(s)).toBeLessThanOrEqual(16);
    expect(hausdorff(s, g)).toBeLessThanOrEqual(0.75);
  });
  it('staircase square 40x40 rotated 20° at tol 0.5 → 4 sharp corners, ≤12 C segs', () => {
    const { loop, corners } = staircaseSquare(50, 50, 40, 20);
    const s = smooth(fromLoops([loop]), { tol: 0.5 });
    expect(countC(s)).toBeLessThanOrEqual(12);
    const ends = s.paths.flatMap((p) => [p.start, ...p.segs.map((sg) => sg.to)]);
    for (const c of corners) {
      expect(Math.min(...ends.map((e) => Math.hypot(e[0] - c[0], e[1] - c[1])))).toBeLessThanOrEqual(0.75);
    }
  });
});
