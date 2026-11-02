// Smoothing (task T1): resample, corner anchors, Chaikin passes, Schneider cubic fit. Pure, unit-agnostic.
import { toLoops, type Geometry, type Path, type Pt } from './index';

type V = Pt;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const scale = (a: V, s: number): V => [a[0] * s, a[1] * s];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1];
const len = (a: V): number => Math.hypot(a[0], a[1]);
const norm = (a: V): V => { const l = len(a); return l > 0 ? [a[0] / l, a[1] / l] : [1, 0]; };
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** even resample at ~`step`, always keeping the original vertices (corners land on samples) */
function resample(loop: Pt[], step: number, closed: boolean): Pt[] {
  if (loop.length < 2 || !(step > 0)) return [...loop];
  const pts: Pt[] = [loop[0]];
  const n = closed ? loop.length : loop.length - 1;
  for (let i = 0; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    const d = len(sub(q, p));
    const k = Math.max(1, Math.round(d / step));
    for (let j = 1; j <= k; j++) pts.push(j === k ? q : lerp(p, q, j / k));
  }
  if (closed) pts.pop(); // drop the repeated start
  return pts;
}

/** steps from i in direction `dir` to cover both `minSamples` and `minArc` of chordal length */
function reachSteps(pts: Pt[], i: number, dir: 1 | -1, closed: boolean, minSamples: number, minArc: number): number {
  const n = pts.length;
  let j = i, steps = 0, arc = 0;
  for (;;) {
    const k = j + dir;
    if (!closed && (k < 0 || k >= n)) break;
    if (closed && steps >= n - 1) break; // never lap the loop
    const a = pts[((j % n) + n) % n], b = pts[((k % n) + n) % n];
    arc += len(sub(b, a));
    j = k; steps++;
    if (steps >= minSamples && arc >= minArc) break;
  }
  return steps;
}

/**
 * Gaussian presmooth with per-vertex reach max(3 samples, 4·tol) of arc each way.
 * Pixel stairs and per-vertex zigzag cancel out over the window, while the centre
 * weight keeps local fidelity — the mean threads between the stairs and the true
 * shape, keeping enough bump to bow toward extreme tips. Same indexing as `pts`,
 * so corners snap to raw samples by sharing the index.
 */
function presmooth(pts: Pt[], closed: boolean, tol: number): Pt[] {
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  return pts.map((_, i) => {
    const lo = reachSteps(pts, i, -1, closed, 3, 4 * tol);
    const hi = reachSteps(pts, i, 1, closed, 3, 4 * tol);
    const sigma = Math.max((lo + hi) / 4, 0.5);
    let sx = 0, sy = 0, sw = 0;
    for (let j = i - lo; j <= i + hi; j++) {
      const p = closed ? at(j) : pts[Math.min(n - 1, Math.max(0, j))];
      const w = Math.exp(-((j - i) * (j - i)) / (2 * sigma * sigma));
      sx += p[0] * w; sy += p[1] * w; sw += w;
    }
    return [sx / sw, sy / sw] as Pt;
  });
}

/**
 * A corner is a turn that lasts: measure it on the presmoothed copy, over chords
 * reaching max(3 samples, 3·tol) of arc each way. Sub-`tol` zigzag never flags.
 */
function findCorners(sm: Pt[], closed: boolean, cornerDeg: number, tol: number): number[] {
  const n = sm.length;
  if (n < 7) return [];
  const turns = new Array<number>(n).fill(0);
  const flagged: number[] = [];
  const lo = closed ? 0 : 1, hi = closed ? n : n - 1;
  for (let i = lo; i < hi; i++) {
    const sLo = reachSteps(sm, i, -1, closed, 3, 3 * tol);
    const sHi = reachSteps(sm, i, 1, closed, 3, 3 * tol);
    const wrap = (j: number) => sm[((j % n) + n) % n];
    const a = closed ? wrap(i - sLo) : sm[Math.max(0, i - sLo)];
    const b = sm[i];
    const c = closed ? wrap(i + sHi) : sm[Math.min(n - 1, i + sHi)];
    const v1 = sub(b, a), v2 = sub(c, b);
    if (len(v1) < 1e-12 || len(v2) < 1e-12) continue;
    const turn = Math.acos(Math.min(1, Math.max(-1, dot(norm(v1), norm(v2))))) * (180 / Math.PI);
    turns[i] = turn;
    if (turn > cornerDeg) flagged.push(i);
  }
  // non-maximum suppression: keep the sharpest of each neighbouring run (strict on
  // one side, so an equal-turn plateau keeps its first sample instead of doubling)
  return flagged.filter((i) => {
    const prev = closed || i - 1 >= lo ? turns[((i - 1) % n + n) % n] : -1;
    const next = closed || i + 1 < hi ? turns[((i + 1) % n + n) % n] : -1;
    return turns[i] > prev && turns[i] >= next;
  });
}

/** one Chaikin round on a span, endpoints fixed */
function chaikin(span: Pt[]): Pt[] {
  if (span.length < 3) return [...span];
  const out: Pt[] = [span[0]];
  for (let i = 0; i + 1 < span.length; i++) {
    out.push(lerp(span[i], span[i + 1], 0.25), lerp(span[i], span[i + 1], 0.75));
  }
  out.push(span[span.length - 1]);
  return out;
}

// ── Schneider's "An Algorithm for Automatically Fitting Digitized Curves" ──
type Bez = [Pt, Pt, Pt, Pt];
const bezPoint = (b: Bez, t: number): Pt => {
  const u = 1 - t;
  return [
    u * u * u * b[0][0] + 3 * u * u * t * b[1][0] + 3 * u * t * t * b[2][0] + t * t * t * b[3][0],
    u * u * u * b[0][1] + 3 * u * u * t * b[1][1] + 3 * u * t * t * b[2][1] + t * t * t * b[3][1],
  ];
};
const bezFirst = (b: Bez, t: number): Pt => {
  const u = 1 - t;
  return [
    3 * u * u * (b[1][0] - b[0][0]) + 6 * u * t * (b[2][0] - b[1][0]) + 3 * t * t * (b[3][0] - b[2][0]),
    3 * u * u * (b[1][1] - b[0][1]) + 6 * u * t * (b[2][1] - b[1][1]) + 3 * t * t * (b[3][1] - b[2][1]),
  ];
};
const bezSecond = (b: Bez, t: number): Pt => [
  6 * (1 - t) * (b[2][0] - 2 * b[1][0] + b[0][0]) + 6 * t * (b[3][0] - 2 * b[2][0] + b[1][0]),
  6 * (1 - t) * (b[2][1] - 2 * b[1][1] + b[0][1]) + 6 * t * (b[3][1] - 2 * b[2][1] + b[1][1]),
];

function chordParameterize(pts: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = u[u.length - 1];
  return total > 0 ? u.map((v) => v / total) : pts.map((_, i) => i / (pts.length - 1 || 1));
}

function generateBezier(pts: Pt[], params: number[], tHat1: V, tHat2: V): Bez {
  const n = pts.length - 1;
  const A: V[][] = params.map((u) => {
    const v1 = scale(tHat1, 3 * (1 - u) * (1 - u) * u);
    const v2 = scale(tHat2, 3 * (1 - u) * u * u);
    return [v1, v2];
  });
  // least-squares: C * alpha = X with the Bernstein-weighted tangents.
  // The residual subtracts P0*(B0+B1) + Pn*(B2+B3): B1,B2 multiply whole control points (P0+α·t̂).
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i <= n; i++) {
    const u = params[i], v = 1 - u;
    const a0 = A[i][0], a1 = A[i][1];
    c00 += dot(a0, a0); c01 += dot(a0, a1); c11 += dot(a1, a1);
    const e = sub(pts[i], add(scale(pts[0], v * v * v + 3 * u * v * v), scale(pts[n], 3 * u * u * v + u * u * u)));
    x0 += dot(a0, e); x1 += dot(a1, e);
  }
  const det = c00 * c11 - c01 * c01;
  let a1 = 0, a2 = 0;
  if (Math.abs(det) > 1e-12) {
    a1 = (x0 * c11 - x1 * c01) / det;
    a2 = (c00 * x1 - c01 * x0) / det;
  }
  // heuristic for negative/defective roots: fall back to chord thirds (Wu/Barsky style epsilon)
  const segLen = len(sub(pts[n], pts[0]));
  const eps = 1e-6 * segLen;
  if (a1 < eps || a2 < eps) {
    const d = segLen / 3;
    a1 = a2 = d;
  }
  return [pts[0], add(pts[0], scale(tHat1, a1)), add(pts[n], scale(tHat2, a2)), pts[n]];
}

function maxFittingError(pts: Pt[], bez: Bez, params: number[]): { error: number; index: number } {
  let error = 0, index = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d2 = len(sub(pts[i], bezPoint(bez, params[i]))) ** 2;
    if (d2 > error) { error = d2; index = i; }
  }
  return { error: Math.sqrt(error), index };
}

function newtonRoot(bez: Bez, p: Pt, u: number): number {
  const q = bezPoint(bez, u), q1 = bezFirst(bez, u), q2 = bezSecond(bez, u);
  const num = (q[0] - p[0]) * q1[0] + (q[1] - p[1]) * q1[1];
  const den = q1[0] * q1[0] + q1[1] * q1[1] + (q[0] - p[0]) * q2[0] + (q[1] - p[1]) * q2[1];
  return Math.abs(den) < 1e-12 ? u : u - num / den;
}

function reparameterize(pts: Pt[], params: number[], bez: Bez): number[] {
  return params.map((u, i) => (i === 0 || i === params.length - 1 ? u : newtonRoot(bez, pts[i], u)));
}

/** fit one cubic (endpoints fixed); null when the error still exceeds `tol` → split instead */
function fitCubic(pts: Pt[], tHat1: V, tHat2: V, tol: number): { bez: Bez; index: number } | null {
  // always refine: the first chord-parameterized fit can sit just inside tol while
  // bowing systematically (eating the hausdorff budget downstream), where a few
  // Newton reparameterizations tighten it several-fold. Keep the best iteration so
  // a divergent step can never hurt.
  let params = chordParameterize(pts);
  let bez = generateBezier(pts, params, tHat1, tHat2);
  let { error, index } = maxFittingError(pts, bez, params);
  let best = { bez, index, error };
  for (let i = 0; i < 4; i++) {
    params = reparameterize(pts, params, bez);
    bez = generateBezier(pts, params, tHat1, tHat2);
    ({ error, index } = maxFittingError(pts, bez, params));
    if (error < best.error) best = { bez, index, error };
  }
  return best.error < tol ? { bez: best.bez, index: best.index } : null;
}

/** fit cubics to a point run, splitting where the error exceeds `tol` */
function fitCurve(pts: Pt[], tol: number): Bez[] {
  if (pts.length < 2) return [];
  if (pts.length === 2) return [[pts[0], lerp(pts[0], pts[1], 1 / 3), lerp(pts[0], pts[1], 2 / 3), pts[1]]];
  const tHat1 = norm(sub(pts[1], pts[0]));
  const tHat2 = norm(sub(pts[pts.length - 2], pts[pts.length - 1]));
  const fit = fitCubic(pts, tHat1, tHat2, tol);
  if (fit) return [fit.bez];
  // split at the worst point (recompute: fitCubic only reports the index on success)
  const params = chordParameterize(pts);
  const bez = generateBezier(pts, params, tHat1, tHat2);
  const { index } = maxFittingError(pts, bez, params);
  const i = Math.min(Math.max(index, 1), pts.length - 2);
  const center = norm(sub(pts[i - 1], pts[i + 1]));
  const left = fitCurveWith(pts.slice(0, i + 1), tHat1, center, tol);
  const right = fitCurveWith(pts.slice(i), norm(scale(center, -1)), tHat2, tol);
  return [...left, ...right];
}

function fitCurveWith(pts: Pt[], tHat1: V, tHat2: V, tol: number): Bez[] {
  if (pts.length < 2) return [];
  if (pts.length === 2) return [[pts[0], lerp(pts[0], pts[1], 1 / 3), lerp(pts[0], pts[1], 2 / 3), pts[1]]];
  const fit = fitCubic(pts, tHat1, tHat2, tol);
  if (fit) return [fit.bez];
  const params = chordParameterize(pts);
  const bez = generateBezier(pts, params, tHat1, tHat2);
  const { index } = maxFittingError(pts, bez, params);
  const i = Math.min(Math.max(index, 1), pts.length - 2);
  const center = norm(sub(pts[i - 1], pts[i + 1]));
  return [...fitCurveWith(pts.slice(0, i + 1), tHat1, center, tol), ...fitCurveWith(pts.slice(i), norm(scale(center, -1)), tHat2, tol)];
}

/** two farthest-apart sample indices (to split a cornerless closed loop) */
function farthestPair(pts: Pt[]): [number, number] {
  // a dense loop (thousands of samples) is searched on every k-th sample: the pair only splits the loop, so being
  // a few samples off the true farthest pair changes nothing — and the full search is quadratic
  const k = Math.max(1, Math.ceil(pts.length / 400));
  let bi = 0, bj = 0, bd = -1;
  for (let i = 0; i < pts.length; i += k) {
    for (let j = i + k; j < pts.length; j += k) {
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
  }
  return [bi, bj];
}

export interface SmoothOpts { tol: number; passes?: number; keepCorners?: boolean; cornerDeg?: number }

/** smooth: Chaikin `passes`, then cubic Bézier fit within `tol`, keeping corners sharper than `cornerDeg` */
export function smooth(g: Geometry, opts: SmoothOpts): Geometry {
  const { tol, passes = 1, keepCorners = true, cornerDeg = 35 } = opts;
  const paths: Path[] = [];
  g.paths.forEach((p) => {
    const [flat] = toLoops({ paths: [p] }, Math.min(tol / 4, 0.25) || 1e-6);
    if (flat.length < 2) return;
    // samples every tol/2 — but at most ~1500 per loop: a long traced outline at a fine tolerance otherwise gives
    // the Bézier fit tens of thousands of points for no visible gain
    const perim = flat.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - flat[i - 1][0], q[1] - flat[i - 1][1]) : a), 0);
    const xs = flat.map((q) => q[0]), ys = flat.map((q) => q[1]);
    const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const pts = resample(flat, Math.max(tol / 2, perim / 1500, side / 400) || 1e-6, p.closed);
    if (pts.length < 2) return;
    // corners are found on the presmoothed copy (sub-tol zigzag never flags); the
    // fit tracks the presmooth except at the anchors, which stay raw (exact)
    const sm = presmooth(pts, p.closed, tol);
    const corners = keepCorners ? findCorners(sm, p.closed, cornerDeg, tol) : [];
    const guarded = new Array<boolean>(pts.length).fill(false);
    const guard = [...corners, ...(!p.closed ? [0, pts.length - 1] : [])];
    for (const a of guard) guarded[a] = true;
    const at = (i: number): Pt => (guarded[i] ? pts[i] : sm[i]);
    // anchors: corners (+ endpoints when open; quarters when a closed loop has none)
    let anchors: number[];
    if (!p.closed) {
      anchors = [...new Set([0, ...corners, pts.length - 1])].sort((m, n) => m - n);
    } else if (corners.length) {
      anchors = [...corners].sort((m, n) => m - n);
    } else {
      // cornerless closed loop: quarter it — halves of large loops underfit within
      // tol (one cubic over 180° eats most of the hausdorff budget against ragged input)
      const n = sm.length;
      const [a, b] = farthestPair(sm);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const m1 = Math.floor((lo + hi) / 2);
      const m2 = Math.floor(hi + (n - hi + lo) / 2) % n;
      anchors = [...new Set([lo, m1, hi, m2])].sort((x, y) => x - y);
    }
    // spans between consecutive anchors (wrapping when closed)
    const spans: Pt[][] = [];
    const smSpan = (a: number, b: number): Pt[] => {
      // one corner on a closed loop: the span is the whole way round, from the corner back to it
      const idx = a === b && p.closed ? Array.from({ length: pts.length + 1 }, (_, k) => a + k)
        : a <= b ? Array.from({ length: b - a + 1 }, (_, k) => a + k)
        : [...Array.from({ length: pts.length - a }, (_, k) => a + k), ...Array.from({ length: b + 1 }, (_, k) => k)];
      return idx.map((i) => at(((i % pts.length) + pts.length) % pts.length));
    };
    for (let s = 0; s < anchors.length; s++) {
      const a = anchors[s];
      const b = anchors[(s + 1) % anchors.length];
      if (p.closed || s + 1 < anchors.length) spans.push(smSpan(a, b));
    }
    if (!spans.length) return;
    let spanPts = spans;
    for (let r = 0; r < Math.max(0, passes); r++) spanPts = spanPts.map(chaikin);
    // fit each span; stitch at the shared anchors
    const start = spanPts[0][0];
    const segs: Path['segs'] = [];
    for (const span of spanPts) {
      for (const [, c1, c2, to] of fitCurve(span, tol)) segs.push({ k: 'C', c1, c2, to });
    }
    paths.push({ start, segs, closed: p.closed });
  });
  return { paths };
}
