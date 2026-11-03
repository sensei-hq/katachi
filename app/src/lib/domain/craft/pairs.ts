// Pairs by shape: two items are a pair when their outlines match, as they are or mirrored (earrings are often cut
// as mirror twins). Each outline is scaled into the same small grid by its longer side (so its shape, not its
// size in the photo, is compared), filled, and compared with every other one; the closest matches pair up first.
// Names that say left and right are trusted before this; shape pairing covers "earring 1, earring 2…".

type Loop = [number, number][];
const N = 40; // grid cells along the longer side

/** the outline filled into an N×N grid, centred, by its longer side */
export function silhouette(loop: Loop): Uint8Array {
  const g = new Uint8Array(N * N);
  if (loop.length < 3) return g;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of loop) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = (N - 1) / Math.max(x1 - x0, y1 - y0, 1e-9), ox = (N - 1 - (x1 - x0) * s) / 2, oy = (N - 1 - (y1 - y0) * s) / 2;
  const pts = loop.map(([x, y]) => [ox + (x - x0) * s, oy + (y - y0) * s] as const);
  // scanline fill at each cell centre (even-odd)
  for (let r = 0; r < N; r++) {
    const y = r + 0.5, xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[j];
      if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let c = Math.max(0, Math.ceil(xs[k] - 0.5)); c <= Math.min(N - 1, Math.floor(xs[k + 1] - 0.5)); c++) g[r * N + c] = 1;
  }
  return g;
}

/** how alike two silhouettes are (intersection over union), the second as it is or mirrored, whichever is closer */
export function likeness(a: Uint8Array, b: Uint8Array): { score: number; mirrored: boolean } {
  let i0 = 0, u0 = 0, i1 = 0, u1 = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const p = a[r * N + c], q = b[r * N + c], m = b[r * N + (N - 1 - c)];
    i0 += p & q; u0 += p | q; i1 += p & m; u1 += p | m;
  }
  const s0 = u0 ? i0 / u0 : 0, s1 = u1 ? i1 / u1 : 0;
  return s1 > s0 ? { score: s1, mirrored: true } : { score: s0, mirrored: false };
}

export interface PairCandidate { id: string; outline: Loop; sizeMm: [number, number] }

/**
 * Pair the items whose outlines match (≥ `min` likeness, and within `sizeTol` of each other's size), best matches
 * first, each item at most once. Returns the pairs with how alike they were and whether they are mirror twins.
 */
export function pairByShape(items: PairCandidate[], { min = 0.82, sizeTol = 0.2 } = {}): { a: string; b: string; score: number; mirrored: boolean }[] {
  const sil = items.map((it) => silhouette(it.outline));
  const near = (p: number, q: number) => Math.abs(p - q) <= sizeTol * Math.max(p, q, 1e-9);
  const cands: { i: number; j: number; score: number; mirrored: boolean }[] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const [aw, ah] = items[i].sizeMm, [bw, bh] = items[j].sizeMm;
    if (!near(Math.max(aw, ah), Math.max(bw, bh)) || !near(Math.min(aw, ah), Math.min(bw, bh))) continue;
    const l = likeness(sil[i], sil[j]);
    if (l.score >= min) cands.push({ i, j, ...l });
  }
  cands.sort((p, q) => q.score - p.score || p.i - q.i);
  const used = new Set<number>(), out: { a: string; b: string; score: number; mirrored: boolean }[] = [];
  for (const c of cands) {
    if (used.has(c.i) || used.has(c.j)) continue;
    used.add(c.i); used.add(c.j);
    out.push({ a: items[c.i].id, b: items[c.j].id, score: Math.round(c.score * 100) / 100, mirrored: c.mirrored });
  }
  // in the order the items came (reading order), so "Pair 1" is the first on the tray
  const at = new Map(items.map((it, k) => [it.id, k]));
  return out.sort((p, q) => Math.min(at.get(p.a)!, at.get(p.b)!) - Math.min(at.get(q.a)!, at.get(q.b)!));
}
