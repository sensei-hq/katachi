// S7 Vectorise (design/01): binary mask -> closed paths -> mm -> SVG.
// The npm potrace ports were rejected for this app: `potrace` drags in Jimp 0.14 (Node-era,
// breaks the Worker bundle) and `potrace-ts` touches `document` at import and is GPL. This is a
// pure-TS tracer with potrace's knobs (turdSize speckle filter, optTolerance simplification):
// boundary edges -> stitched loops -> collinear/Douglas-Peucker simplify -> Chaikin smoothing.
// Code builds geometry; no model output is ever a cut coordinate.
export interface Mask { w: number; h: number; bits: Uint8Array }
export interface TracedPath { points: [number, number][]; area: number; closed: true }

export function maskStats(mask: Mask) {
  let ones = 0, minX = mask.w, minY = mask.h, maxX = -1, maxY = -1, sx = 0, sy = 0;
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) {
    if (!mask.bits[y * mask.w + x]) continue;
    ones++; sx += x; sy += y;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { ones, bbox: ones ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null, centroid: ones ? { x: sx / ones, y: sy / ones } : null };
}

const key = (x: number, y: number) => `${x},${y}`;

/** Boundary loops of a binary mask, in pixel-corner coordinates. Specks with area <= turdSize are dropped. */
export function traceMask(mask: Mask, opts: { turdSize?: number; tolerance?: number; smooth?: number } = {}): { paths: TracedPath[] } {
  const turdSize = opts.turdSize ?? 4, tolerance = opts.tolerance ?? 1.2, smooth = opts.smooth ?? 1;
  const fg = (x: number, y: number) => x >= 0 && y >= 0 && x < mask.w && y < mask.h && mask.bits[y * mask.w + x] === 1;
  // directed boundary edges are stitched undirected; orientation is fixed by signed area later
  const adj = new Map<string, Set<string>>();
  const pts = new Map<string, [number, number]>();
  const addPt = (x: number, y: number) => { const k = key(x, y); if (!pts.has(k)) pts.set(k, [x, y]); return k; };
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const a = addPt(ax, ay), b = addPt(bx, by);
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) {
    if (!fg(x, y)) continue;
    if (!fg(x, y - 1)) edge(x, y, x + 1, y);
    if (!fg(x, y + 1)) edge(x, y + 1, x + 1, y + 1);
    if (!fg(x - 1, y)) edge(x, y, x, y + 1);
    if (!fg(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
  }
  const used = new Set<string>();
  const segId = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const loops: [number, number][][] = [];
  for (const [start, neighbours] of adj) {
    for (const first of neighbours) {
      if (used.has(segId(start, first))) continue;
      const loop: [number, number][] = [pts.get(start)!];
      let prev = start, cur = first;
      used.add(segId(prev, cur));
      while (cur !== start) {
        loop.push(pts.get(cur)!);
        const nexts = [...(adj.get(cur) ?? [])].filter((n) => n !== prev && !used.has(segId(cur, n)));
        if (!nexts.length) break;
        // at saddle points prefer the sharpest right turn (keeps diagonal touches as separate loops)
        const next = nexts[0];
        used.add(segId(cur, next));
        prev = cur; cur = next;
      }
      if (cur === start && loop.length >= 4) loops.push(loop);
    }
  }
  const areaOf = (p: [number, number][]) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
  const paths: TracedPath[] = [];
  for (const raw of loops) {
    const signed = areaOf(raw);
    if (Math.abs(signed) <= turdSize) continue;
    let points = simplify(collinear(raw), tolerance);
    for (let i = 0; i < smooth; i++) points = chaikin(points);
    if (points.length >= 3) paths.push({ points, area: Math.abs(areaOf(points)), closed: true });
  }
  return { paths: paths.sort((a, b) => b.area - a.area) };
}

function collinear(p: [number, number][]): [number, number][] {
  if (p.length < 3) return p;
  const out: [number, number][] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) out.push(b);
  }
  return out.length >= 3 ? out : p;
}

function simplify(p: [number, number][], tol: number): [number, number][] {
  if (tol <= 0 || p.length < 4) return p;
  const keep = new Uint8Array(p.length).fill(0);
  keep[0] = keep[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1, farD = tol;
    const [ax, ay] = p[a], [bx, by] = p[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[i][0] - ax) * dy - (p[i][1] - ay) * dx) / len;
      if (d > farD) { farD = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = p.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : p;
}

function chaikin(p: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

/** Scale px paths into mm (optionally translating by an origin in px, e.g. a SAM box offset). */
export function scalePaths(paths: TracedPath[], mmPerPx: number, originPx: [number, number] = [0, 0]): TracedPath[] {
  return paths.map((p) => ({ ...p, area: p.area * mmPerPx * mmPerPx, points: p.points.map(([x, y]) => [round((x + originPx[0]) * mmPerPx), round((y + originPx[1]) * mmPerPx)] as [number, number]) }));
}
const round = (n: number) => Math.round(n * 100) / 100;

export function pathsToSvg(paths: TracedPath[]): string {
  return paths.map((p) => `M${p.points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`).join('');
}

/** Total cut length in the paths' own units. */
export function cutLength(paths: TracedPath[]): number {
  let total = 0;
  for (const p of paths) for (let i = 0; i < p.points.length; i++) { const a = p.points[i], b = p.points[(i + 1) % p.points.length]; total += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return Math.round(total * 10) / 10;
}
