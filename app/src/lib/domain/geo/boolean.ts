// Booleans, offset, hull, bridges (task T1) on clipper2-js at a fixed ×1000 integer scale.
import { Clipper, ClipperOffset, EndType, FillRule, JoinType } from 'clipper2-js';
import type { Path64, Paths64 } from 'clipper2-js';
import { hullOf } from '../toolpath';
import { fromLoops, toLoops, type Geometry, type Loops, type Pt } from './index';

// clipper2-js@1.2.4's ClipperOffset.offsetPolygon passes a constant `prev`
// index to every vertex (upstream's `prev = i` is missing), collapsing one
// join per loop (a 10×10 square grown by 1 comes out ~11×11). This override
// restores the reference loop; everything else is the stock engine.
// (Pinned to exactly 1.2.4 in package.json so these internals can't shift.)
class FixedOffset extends (ClipperOffset as any) {
  constructor(miterLimit = 2.0) { super(miterLimit); }
  offsetPolygon(group: any, path: any): void {
    const self = this as any;
    if ((Clipper.area(path) < 0) !== (self._groupDelta < 0)) {
      const rect = Clipper.getBounds(path);
      const minDim = Math.abs(self._groupDelta) * 2;
      if (minDim > rect.width || minDim > rect.height) return;
    }
    group.outPath = [];
    const cnt = path.length;
    let prev = cnt - 1;
    for (let i = 0; i < cnt; i++) {
      self.offsetPoint(group, path, i, prev);
      prev = i;
    }
    group.outPaths.push(group.outPath);
  }
}

/** InflatePaths through the fixed offset engine (round joins, polygon ends) */
function inflate(paths: Paths64, delta: number): Paths64 {
  const co: any = new FixedOffset(2.0);
  co.addPaths(paths, JoinType.Round, EndType.Polygon);
  const solution: Paths64 = [];
  co.execute(delta, solution);
  return solution;
}

const S = 1000;
type I64 = { x: number; y: number };

/** signed shoelace (twice the area); > 0 = positive orientation for clipper */
function signedArea(l: Pt[]): number {
  let a = 0;
  for (let i = 0; i < l.length; i++) {
    const p = l[i], q = l[(i + 1) % l.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function toPaths(loops: Loops): Paths64 {
  const out: Paths64 = [];
  for (const l of loops) {
    const p: I64[] = [];
    for (const [x, y] of l) {
      const q = { x: Math.round(x * S), y: Math.round(y * S) };
      if (!p.length || p[p.length - 1].x !== q.x || p[p.length - 1].y !== q.y) p.push(q);
    }
    if (p.length > 1 && p[0].x === p[p.length - 1].x && p[0].y === p[p.length - 1].y) p.pop();
    if (p.length >= 3) out.push(p as Path64);
  }
  return out;
}

function fromPaths(paths: Paths64): Loops {
  const out: Loops = [];
  for (const p of paths) {
    const l: Pt[] = p.map((q) => [q.x / S, q.y / S] as Pt);
    if (l.length >= 3) out.push(l);
  }
  return out;
}

/** flattened closed loops of a geometry (curves → polylines at 0.1) */
function closedLoops(g: Geometry): Loops {
  const out: Loops = [];
  for (const p of g.paths) {
    if (!p.closed) continue;
    const [l] = toLoops({ paths: [p] }, 0.1);
    if (l.length > 2) out.push(l);
  }
  return out;
}

const opensOf = (g: Geometry): Geometry['paths'] => g.paths.filter((p) => !p.closed);

/** orient by nesting parity: even depth (solid) → positive, odd (void) → negative */
function orientParity(loops: Loops): Loops {
  const ds = nesting(loops);
  return loops.map((l, i) => (ds[i] % 2 === 0) === (signedArea(l) > 0) ? l : [...l].reverse());
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** inside and away from the boundary (a vertex exactly on an edge doesn't count) */
function strictlyInside(p: Pt, poly: Pt[], eps: number): boolean {
  if (!pointIn(poly, p)) return false;
  for (let i = 0; i < poly.length; i++) {
    if (pointSegDist(p, poly[i], poly[(i + 1) % poly.length]) <= eps) return false;
  }
  return true;
}

const orient2 = (a: Pt, b: Pt, c: Pt): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function segsTouch(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const d1 = orient2(b1, b2, a1), d2 = orient2(b1, b2, a2), d3 = orient2(a1, a2, b1), d4 = orient2(a1, a2, b2);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  const on = (a: Pt, b: Pt, c: Pt) => Math.min(a[0], c[0]) <= b[0] && b[0] <= Math.max(a[0], c[0]) && Math.min(a[1], c[1]) <= b[1] && b[1] <= Math.max(a[1], c[1]);
  return (d1 === 0 && on(b1, a1, b2)) || (d2 === 0 && on(b1, a2, b2)) || (d3 === 0 && on(a1, b1, a2)) || (d4 === 0 && on(a1, b2, a2));
}

/** every vertex strictly inside and no boundary contact (crossing or touching) */
function strictlyContains(outer: Pt[], inner: Pt[]): boolean {
  if (outer.length < 3 || inner.length < 3) return false;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of outer) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y; }
  const eps = Math.max(x2 - x1, y2 - y1) * 1e-9;
  for (const v of inner) if (!strictlyInside(v, outer, eps)) return false;
  for (let i = 0; i < outer.length; i++) {
    for (let j = 0; j < inner.length; j++) {
      if (segsTouch(outer[i], outer[(i + 1) % outer.length], inner[j], inner[(j + 1) % inner.length])) return false;
    }
  }
  return true;
}

/** strict nesting depth per loop: touching/overlapping loops stay on the same level. */
function nesting(loops: Loops): number[] {
  return loops.map((_, i) => {
    let d = 0;
    for (let j = 0; j < loops.length; j++) if (j !== i && strictlyContains(loops[j], loops[i])) d++;
    return d;
  });
}

/** every loop positive: for independent solid regions merged with a Positive fill */
const positive = (loops: Loops): Loops => loops.map((l) => (signedArea(l) > 0 ? l : [...l].reverse()));

/** grow (+) or shrink (−) the closed paths by `d`, round joins. Open strokes pass through. */
export function offset(g: Geometry, d: number): Geometry {
  if (d === 0) return g;
  const loops = closedLoops(g);
  if (!loops.length) return { paths: opensOf(g) };
  const ds = nesting(loops);
  const solids = positive(loops.filter((_, i) => ds[i] % 2 === 0));
  const voids = positive(loops.filter((_, i) => ds[i] % 2 === 1));
  // solids and voids move opposite ways (a hole shrinks when the outline grows)
  const sOff = solids.length ? inflate(toPaths(solids), d * S) : [];
  const vOff = voids.length ? inflate(toPaths(voids), -d * S) : [];
  const sLoops = fromPaths(sOff), vLoops = fromPaths(vOff);
  let result: Loops;
  if (!sLoops.length) result = [];
  else if (!vLoops.length) result = sLoops;
  else result = fromPaths(Clipper.Difference(toPaths(orientParity(sLoops)), toPaths(orientParity(vLoops)), FillRule.NonZero));
  return { paths: [...fromLoops(result).paths, ...opensOf(g)] };
}

/** boolean ops on the closed paths (even-odd in, clean outer + holes out). Open strokes pass through. */
export function union(a: Geometry, b: Geometry): Geometry {
  const la = closedLoops(a), lb = closedLoops(b);
  if (!la.length && !lb.length) return { paths: [...opensOf(a), ...opensOf(b)] };
  const out = Clipper.Union(toPaths(orientParity(la)), toPaths(orientParity(lb)), FillRule.NonZero);
  return { paths: [...fromLoops(fromPaths(out)).paths, ...opensOf(a), ...opensOf(b)] };
}

export function difference(a: Geometry, b: Geometry): Geometry {
  const la = closedLoops(a), lb = closedLoops(b);
  if (!la.length) return { paths: [...opensOf(a), ...opensOf(b)] };
  const out = Clipper.Difference(toPaths(orientParity(la)), toPaths(orientParity(lb)), FillRule.NonZero);
  return { paths: [...fromLoops(fromPaths(out)).paths, ...opensOf(a), ...opensOf(b)] };
}

/** weld: self-union of overlapping/touching loops into one outline (+ holes) */
export function weld(g: Geometry): Geometry {
  const loops = closedLoops(g);
  if (!loops.length) return { paths: opensOf(g) };
  const out = Clipper.Union(toPaths(orientParity(loops)), [], FillRule.NonZero);
  return { paths: [...fromLoops(fromPaths(out)).paths, ...opensOf(g)] };
}

/** convex hull of every point (control points included, like `bbox`) */
export function hull(g: Geometry): Geometry {
  const pts: Pt[] = [];
  for (const p of g.paths) {
    pts.push(p.start);
    for (const s of p.segs) {
      pts.push(s.to);
      if (s.k === 'C') pts.push(s.c1, s.c2);
    }
  }
  if (!pts.length) return { paths: [] };
  return fromLoops([hullOf(pts)]);
}

// ── bridges ──
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** closest points between two segments (Ericson 5.1.9) */
function segSegClosest(p1: Pt, q1: Pt, p2: Pt, q2: Pt): { c1: Pt; c2: Pt; dist: number } {
  const d1: Pt = [q1[0] - p1[0], q1[1] - p1[1]];
  const d2: Pt = [q2[0] - p2[0], q2[1] - p2[1]];
  const r: Pt = [p1[0] - p2[0], p1[1] - p2[1]];
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s: number, t: number;
  if (a <= 1e-12 && e <= 1e-12) { s = t = 0; }
  else if (a <= 1e-12) { s = 0; t = clamp01(f / e); }
  else if (e <= 1e-12) { t = 0; s = clamp01(-dot(d1, r) / a); }
  else {
    const c = dot(d1, r), b = dot(d1, d2), denom = a * e - b * b;
    s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = clamp01(-c / a); }
    else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
  }
  const c1: Pt = [p1[0] + d1[0] * s, p1[1] + d1[1] * s];
  const c2: Pt = [p2[0] + d2[0] * t, p2[1] + d2[1] * t];
  return { c1, c2, dist: Math.hypot(c1[0] - c2[0], c1[1] - c2[1]) };
}

interface Gap { p: Pt; q: Pt; len: number }

/** shortest island↔hole gaps, spread ≥90° around the island centroid (then filled to `per`) */
function pickGaps(island: Pt[], hole: Pt[], width: number, per: number): Gap[] {
  const cands: Gap[] = [];
  for (let i = 0; i < island.length; i++) {
    for (let j = 0; j < hole.length; j++) {
      const { c1, c2, dist } = segSegClosest(island[i], island[(i + 1) % island.length], hole[j], hole[(j + 1) % hole.length]);
      if (dist > 1e-6) cands.push({ p: c1, q: c2, len: dist });
    }
  }
  cands.sort((m, n) => m.len - n.len);
  const cx = island.reduce((s, p) => s + p[0], 0) / island.length;
  const cy = island.reduce((s, p) => s + p[1], 0) / island.length;
  const mid = (g: Gap): Pt => [(g.p[0] + g.q[0]) / 2, (g.p[1] + g.q[1]) / 2];
  const picked: Gap[] = [];
  for (const spread of [true, false]) {
    for (const c of cands) {
      if (picked.length >= per) break;
      if (picked.includes(c)) continue;
      const m = mid(c);
      if (picked.some((g) => Math.hypot(mid(g)[0] - m[0], mid(g)[1] - m[1]) < width)) continue;
      if (spread && picked.some((g) => {
        const a = mid(g), ux = a[0] - cx, uy = a[1] - cy, vx = m[0] - cx, vy = m[1] - cy;
        return ux * vx + uy * vy > 0; // less than 90° apart
      })) continue;
      picked.push(c);
    }
  }
  return picked;
}

/** a `width` × gap rectangle over the gap, overlapping both sides slightly so the union merges */
function tabRect(g: Gap, width: number): Pt[] {
  const ux = (g.q[0] - g.p[0]) / g.len, uy = (g.q[1] - g.p[1]) / g.len;
  const nx = -uy * width / 2, ny = ux * width / 2;
  const e = 0.05;
  const ax = g.p[0] - ux * e, ay = g.p[1] - uy * e;
  const bx = g.q[0] + ux * e, by = g.q[1] + uy * e;
  return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]];
}

export interface BridgeOpts { width: number; per?: number }

/** bridges: `per` tabs of `width` from each island to its surrounding hole's edge (shortest gaps) */
export function bridge(g: Geometry, opts: BridgeOpts): Geometry {
  const { width, per = 2 } = opts;
  const loops = closedLoops(g);
  if (!loops.length) return { paths: opensOf(g) };
  const ds = nesting(loops);
  const areas = loops.map((l) => Math.abs(signedArea(l)));
  // island → parent hole (one level up, smallest containing area)
  const tabsByHole = new Map<number, Loops>();
  const islandsByHole = new Map<number, Loops>();
  const consumed = new Set<number>();
  loops.forEach((isl, i) => {
    if (!(ds[i] >= 2 && ds[i] % 2 === 0)) return;
    let hi = -1;
    loops.forEach((h, j) => {
      if (ds[j] !== ds[i] - 1) return;
      if (!pointIn(h, isl[0])) return;
      if (hi < 0 || areas[j] < areas[hi]) hi = j;
    });
    if (hi < 0) return;
    const gaps = pickGaps(isl, loops[hi], width, per);
    if (!gaps.length) return;
    if (!tabsByHole.has(hi)) { tabsByHole.set(hi, []); islandsByHole.set(hi, []); }
    tabsByHole.get(hi)!.push(...gaps.map((t) => tabRect(t, width)));
    islandsByHole.get(hi)!.push(isl);
    consumed.add(i);
  });
  if (!tabsByHole.size) return g;
  // per affected hole: pockets = hole − (its islands + tabs); the island loops are gone
  const holePockets = new Map<number, Loops>();
  tabsByHole.forEach((tabs, hi) => {
    const subj = toPaths(positive([loops[hi]]));
    const clip = toPaths(positive([...(islandsByHole.get(hi) ?? []), ...tabs]));
    holePockets.set(hi, fromPaths(Clipper.Difference(subj, clip, FillRule.Positive)));
  });
  // rebuild: unaffected loops keep their original paths (curves intact), pockets are new L loops
  const paths: Geometry['paths'] = [];
  const closedIdx = g.paths.map((p, i) => (p.closed ? i : -1)).filter((i) => i >= 0);
  loops.forEach((_, i) => {
    if (consumed.has(i)) return; // island merged into the piece
    if (holePockets.has(i)) paths.push(...fromLoops(holePockets.get(i)!).paths);
    else paths.push(g.paths[closedIdx[i]]);
  });
  return { paths: [...paths, ...opensOf(g)] };
}

function pointIn(poly: Pt[], p: Pt): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
