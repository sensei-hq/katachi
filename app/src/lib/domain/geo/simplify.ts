// Ramer–Douglas–Peucker simplification (task T1). Pure and unit-agnostic.
import { toLoops, type Geometry, type Path, type Pt } from './index';

const perpDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(l2);
};

/** RDP over an open chain: indices kept, in order, endpoints always kept */
function rdpOpen(pts: Pt[], tol: number): number[] {
  if (pts.length < 3) return pts.map((_, i) => i);
  const keep = new Set<number>([0, pts.length - 1]);
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let bi = -1, bd = tol;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > bd) { bd = d; bi = i; }
    }
    if (bi > 0) { keep.add(bi); stack.push([s, bi], [bi, e]); }
  }
  return [...keep].sort((m, n) => m - n);
}

/** RDP over a closed loop (no repeated endpoint): split at the point farthest from the start */
function rdpClosed(loop: Pt[], tol: number): Pt[] {
  if (loop.length < 4) return [...loop];
  let fi = 0, fd = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > fd) { fd = d; fi = i; }
  }
  const chain1 = loop.slice(0, fi + 1);
  const chain2 = [...loop.slice(fi), loop[0]];
  const k1 = rdpOpen(chain1, tol).map((i) => i);
  const k2 = rdpOpen(chain2, tol).map((i) => (fi + i) % loop.length);
  const idx = [...new Set([...k1, ...k2])].sort((m, n) => m - n);
  const out = idx.map((i) => loop[i]);
  // closed paths keep at least 3 points: add the vertex farthest from the result
  while (out.length < 3 && out.length < loop.length) {
    let bi = -1, bd = -1;
    for (let i = 0; i < loop.length; i++) {
      if (out.includes(loop[i])) continue;
      let m = Infinity;
      for (let j = 0; j < out.length; j++) m = Math.min(m, perpDist(loop[i], out[j], out[(j + 1) % out.length]));
      if (m > bd) { bd = m; bi = i; }
    }
    if (bi < 0) break;
    out.push(loop[bi]);
    out.sort((a, b) => loop.indexOf(a) - loop.indexOf(b));
  }
  return out;
}

/** Ramer–Douglas–Peucker on every path (curves flattened first). The result is all `L` segments. */
export function simplify(g: Geometry, tol: number): Geometry {
  const t = Math.max(tol, 0);
  const flat = toLoops(g, t / 4 || 1e-6);
  const paths: Path[] = [];
  g.paths.forEach((p, i) => {
    const pts = flat[i].length > 1 ? flat[i] : [];
    if (!pts.length) return;
    const simp = p.closed ? rdpClosed(pts, t) : rdpOpen(pts, t).map((k) => pts[k]);
    if (simp.length < 2) return;
    paths.push({ start: simp[0], segs: simp.slice(1).map((to) => ({ k: 'L' as const, to })), closed: p.closed });
  });
  return { paths };
}
