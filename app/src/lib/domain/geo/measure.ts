// Geometry measurement (task T1): area, nesting, outline distance, long axis. Pure and unit-agnostic.
import { bbox, toLoops, type Geometry, type Pt } from './index';

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** flattened polylines of each path, keeping its closed flag */
function loopsOf(g: Geometry, tol: number, closedOnly: boolean): { pts: Pt[]; closed: boolean }[] {
  const out: { pts: Pt[]; closed: boolean }[] = [];
  for (const p of g.paths) {
    if (closedOnly && !p.closed) continue;
    const [loop] = toLoops({ paths: [p] }, tol);
    if (loop.length > 1) out.push({ pts: loop, closed: p.closed });
  }
  return out;
}

const loopArea = (l: Pt[]): number => {
  if (l.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < l.length; i++) {
    const p = l[i], q = l[(i + 1) % l.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
};

/** even-odd ray cast */
export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** nesting depth of each closed path (0 = outer, 1 = hole, 2 = island inside a hole, …) */
export function depths(g: Geometry): number[] {
  const loops = loopsOf(g, 0.25, true);
  return loops.map((l, i) => {
    let d = 0;
    for (let j = 0; j < loops.length; j++) if (j !== i && pointInPoly(l.pts[0], loops[j].pts)) d++;
    return d;
  });
}

/** islands (depth 2, 4, …): pieces that fall out unless bridged. Indices into the closed paths. */
export function islands(g: Geometry): number[] {
  const out: number[] = [];
  depths(g).forEach((d, i) => { if (d >= 2 && d % 2 === 0) out.push(i); });
  return out;
}

/** signed area of the closed paths, even-odd (holes subtract) */
export function area(g: Geometry): number {
  const loops = loopsOf(g, 0.25, true);
  const ds = depths(g);
  return loops.reduce((acc, l, i) => acc + (ds[i] % 2 === 0 ? 1 : -1) * loopArea(l.pts), 0);
}

/** points spaced ~`step` along a loop (`closed` wraps the last segment back to the start) */
function resample(loop: Pt[], step: number, closed: boolean): Pt[] {
  if (!loop.length) return [];
  if (loop.length < 2 || step <= 0) return [loop[0]];
  const pts: Pt[] = [loop[0]];
  const n = closed ? loop.length : loop.length - 1;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    const len = dist(p, q);
    if (len === 0) continue;
    let d = step - acc;
    while (d < len) {
      const t = d / len;
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      d += step;
    }
    acc = len - (d - step);
  }
  return pts;
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function minDistToLoops(p: Pt, loops: { pts: Pt[]; closed: boolean }[]): number {
  let m = Infinity;
  for (const l of loops) {
    const n = l.closed ? l.pts.length : l.pts.length - 1;
    for (let i = 0; i < n; i++) {
      const d = pointSegDist(p, l.pts[i], l.pts[(i + 1) % l.pts.length]);
      if (d < m) m = d;
    }
  }
  return m;
}

const maxSideOf = (g: Geometry): number => {
  const b = bbox(g);
  return b ? Math.max(b.w, b.h) : 0;
};

/** largest distance between the two shapes' outlines (sampled), for "within 0.2 mm of your shape" */
export function hausdorff(a: Geometry, b: Geometry, step?: number): number {
  const s = step ?? Math.max(maxSideOf(a), maxSideOf(b)) / 200;
  if (!(s > 0)) return 0;
  const la = loopsOf(a, s / 4, false), lb = loopsOf(b, s / 4, false);
  if (!la.length || !lb.length) return 0;
  let d = 0;
  for (const l of la) for (const p of resample(l.pts, s, l.closed)) d = Math.max(d, minDistToLoops(p, lb));
  for (const l of lb) for (const p of resample(l.pts, s, l.closed)) d = Math.max(d, minDistToLoops(p, la));
  return d;
}

/** the long axis angle (deg) of the outlines, for straighten. In (−90, 90]; matches toolpath.longAxis. */
export function longAxisDeg(g: Geometry): number {
  const loops = loopsOf(g, 0.25, false);
  const side = maxSideOf(g);
  if (!loops.length || !(side > 0)) return 90;
  const pts = loops.flatMap((l) => resample(l.pts, side / 400, l.closed));
  if (!pts.length) return 90;
  const cx = pts.reduce((acc, p) => acc + p[0], 0) / pts.length;
  const cy = pts.reduce((acc, p) => acc + p[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  let deg = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI);
  while (deg <= -90) deg += 180;
  while (deg > 90) deg -= 180;
  return deg;
}
