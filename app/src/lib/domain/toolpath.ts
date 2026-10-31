// The cutting program (design/12): a sheet's traced outline becomes the moves a machine follows — travel with the
// tool up, then cut along each closed shape. Holes and inner shapes first, the outer outline last, so the piece does
// not shift while it is being cut; each next shape is the nearest one. The same program drives the on-screen run.
//   laser  → G-code (GRBL dialect: G0 travel, G1 cut with power), for diode / CO₂ lasers
//   paper  → plotter moves (blade up / cut to) — the shape of what a blade cutter follows; Cricut itself takes SVG
export type Pt = [number, number];
export type Machine = 'paper' | 'laser';
export interface Segment { kind: 'travel' | 'cut'; from: Pt; to: Pt; len: number; at: number }
export interface Toolpath { segs: Segment[]; total: number; cutMm: number; travelMm: number; shapes: number }

const areaOf = (p: Pt[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); };
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** traced paths in 0-1000 photo units → mm on the sheet (x across the photo's width, y down its height) */
export function toMm(paths: [number, number][][], widthMm: number, aspect = 1): Pt[][] {
  const kx = widthMm / 1000, ky = widthMm / Math.max(0.01, aspect) / 1000;
  return paths.map((p) => p.map(([x, y]) => [Math.round(x * kx * 100) / 100, Math.round(y * ky * 100) / 100] as Pt)).filter((p) => p.length > 2);
}

/** the order the tool visits the shapes: inner and small first, the biggest (the outline) last, nearest next */
export function toolpath(shapes: Pt[][], start: Pt = [0, 0]): Toolpath {
  const list = shapes.filter((s) => s.length > 2).map((pts) => ({ pts, a: areaOf(pts) }));
  if (!list.length) return { segs: [], total: 0, cutMm: 0, travelMm: 0, shapes: 0 };
  const outer = list.reduce((b, c) => (c.a > b.a ? c : b), list[0]);
  const rest = list.filter((c) => c !== outer);
  const order: Pt[][] = []; let at = start;
  const startNearest = (pts: Pt[], from: Pt) => { let bj = 0, bd = Infinity; pts.forEach((p, j) => { const d = dist(from, p); if (d < bd) { bd = d; bj = j; } }); return [...pts.slice(bj), ...pts.slice(0, bj)]; };
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((c, i) => { for (const p of c.pts) { const d = dist(at, p); if (d < bd) { bd = d; bi = i; } } });
    const pts = startNearest(rest.splice(bi, 1)[0].pts, at); order.push(pts); at = pts[0];
  }
  order.push(startNearest(outer.pts, at));
  const segs: Segment[] = []; let pos = start, total = 0, cutMm = 0, travelMm = 0;
  for (const pts of order) {
    const t = dist(pos, pts[0]); segs.push({ kind: 'travel', from: pos, to: pts[0], len: t, at: total }); total += t; travelMm += t;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = dist(a, b); segs.push({ kind: 'cut', from: a, to: b, len: l, at: total }); total += l; cutMm += l; }
    pos = pts[0];
  }
  return { segs, total, cutMm, travelMm, shapes: order.length };
}

/** where the tool is after `d` mm of the run, and which segment it is on */
export function headAt(tp: Toolpath, d: number): { pt: Pt; seg: number } {
  if (!tp.segs.length) return { pt: [0, 0], seg: -1 };
  let lo = 0, hi = tp.segs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tp.segs[mid].at <= d) lo = mid; else hi = mid - 1; }
  const s = tp.segs[lo], f = s.len ? Math.min(1, Math.max(0, (d - s.at) / s.len)) : 1;
  return { pt: [s.from[0] + (s.to[0] - s.from[0]) * f, s.from[1] + (s.to[1] - s.from[1]) * f], seg: lo };
}

const f2 = (n: number) => n.toFixed(2);
export interface ProgramOptions { op?: 'cut' | 'engrave'; name?: string; feed?: number; power?: number; passes?: number }
/** the program text, one line per move, and the line each segment starts on (to highlight it during the run) */
export function program(tp: Toolpath, machine: Machine, o: ProgramOptions = {}): { lines: string[]; lineOf: number[] } {
  const lines: string[] = [], lineOf: number[] = [];
  const engrave = o.op === 'engrave';
  if (machine === 'laser') {
    const feed = o.feed ?? (engrave ? 3000 : 600), power = o.power ?? (engrave ? 250 : 900);
    lines.push(`; Katachi · ${o.name ?? 'sheet'} · ${engrave ? 'engrave' : 'cut'} · GRBL`, 'G21 ; millimetres', 'G90 ; absolute', 'M4 S0 ; laser on, power follows speed');
    for (const s of tp.segs) { lineOf.push(lines.length); lines.push(s.kind === 'travel' ? `G0 X${f2(s.to[0])} Y${f2(s.to[1])}` : `G1 X${f2(s.to[0])} Y${f2(s.to[1])} F${feed} S${power}`); }
    lines.push('M5 ; laser off', 'G0 X0 Y0');
  } else {
    lines.push(`# Katachi · ${o.name ?? 'sheet'} · blade cutter moves · mm, origin top-left of the mat`, `TOOL fine-point blade · ${o.passes ?? 1} pass${(o.passes ?? 1) > 1 ? 'es' : ''}`);
    for (const s of tp.segs) { lineOf.push(lines.length); lines.push(s.kind === 'travel' ? `UP    MOVE ${f2(s.to[0])}, ${f2(s.to[1])}` : `DOWN  CUT  ${f2(s.to[0])}, ${f2(s.to[1])}`); }
    lines.push('UP    HOME 0, 0', 'END');
  }
  return { lines, lineOf };
}
/** the whole program as a downloadable text (G-code for a laser, plotter moves for a blade cutter) */
export const programText = (tp: Toolpath, machine: Machine, o: ProgramOptions = {}) => program(tp, machine, o).lines.join('\n') + '\n';

// ── Separate items (bookmarks, coasters): each one laid out on its own sheet, straightened ────────────────────
/** the angle (degrees) of a shape's long axis, from its outline sampled evenly along its length (principal axis) */
export function longAxis(shapes: Pt[][]): { angle: number; centre: Pt } {
  const pts: Pt[] = [];
  for (const s of shapes) for (let i = 0; i < s.length; i++) {
    const a = s[i], b = s[(i + 1) % s.length], n = Math.max(1, Math.round(dist(a, b)));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (!pts.length) return { angle: 90, centre: [0, 0] };
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  return { angle: (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI), centre: [cx, cy] };
}
/** the turn that stands a shape upright (its long axis vertical); tiny turns are left alone */
export function uprightTurn(shapes: Pt[][]): { turn: number; centre: Pt } {
  const { angle, centre } = longAxis(shapes);
  let turn = 90 - angle;
  while (turn > 90) turn -= 180;
  while (turn < -90) turn += 180;
  return { turn: Math.abs(turn) < 1.5 ? 0 : Math.round(turn * 10) / 10, centre };
}
/** turn shapes by `deg` around `centre`, then move them so their bounds start at `margin` mm */
export function layOut(shapes: Pt[][], deg: number, centre: Pt, frame?: { x: number; y: number }, margin = 5): { shapes: Pt[][]; size: [number, number]; frame: { x: number; y: number } } {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const turned = shapes.map((p) => p.map(([x, y]) => { const dx = x - centre[0], dy = y - centre[1]; return [centre[0] + dx * c - dy * s, centre[1] + dx * s + dy * c] as Pt; }));
  const all = turned.flat();
  const fx = frame?.x ?? Math.min(...all.map((p) => p[0])), fy = frame?.y ?? Math.min(...all.map((p) => p[1]));
  const moved = turned.map((p) => p.map(([x, y]) => [Math.round((x - fx + margin) * 100) / 100, Math.round((y - fy + margin) * 100) / 100] as Pt));
  const mx = Math.max(...moved.flat().map((p) => p[0])), my = Math.max(...moved.flat().map((p) => p[1]));
  return { shapes: moved, size: [Math.ceil(mx + margin), Math.ceil(my + margin)], frame: { x: fx, y: fy } };
}
/** shapes in mm on a sheet of `size` → an SVG path in 0-1000 units of the sheet (thumbnails) */
export function sheetD(shapes: Pt[][], size: [number, number]): string {
  return shapes.map((p) => `M${p.map(([x, y]) => `${Math.round((x / size[0]) * 10000) / 10} ${Math.round((y / size[1]) * 10000) / 10}`).join('L')}Z`).join('');
}

/** the convex hull of points (monotone chain) */
export function hullOf(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
/** how much of an item's outline seems bitten away (by a neighbour lying over it): its hull's area ÷ its own area */
export function hiddenShare(shapes: Pt[][]): number {
  const outer = shapes.reduce<Pt[] | null>((b, c) => (!b || areaOf(c) > areaOf(b) ? c : b), null);
  if (!outer) return 0;
  const a = areaOf(outer), h = areaOf(hullOf(outer));
  return a > 0 ? Math.max(0, Math.round((1 - a / h) * 100) / 100) : 0;
}
