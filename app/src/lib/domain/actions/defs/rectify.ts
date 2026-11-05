// Perspective correction (design/14 §6): a card photographed at an angle is a keystone — its far end narrower, its
// corners not square. A four-cornered item (a bookmark, a coaster, a tag) is mapped back to a true rectangle by
// the homography from its four corners; everything on it (holes, engraving) moves with it. Run before straighten,
// and again after hidden parts are filled in (a bitten card has no fourth corner until then).
import * as geo from '../../geo';
import type { Pt } from '../../geo';
import type { CraftDoc, ItemDoc, OpDoc } from '../../craft/types';
import { hullOf } from '../../toolpath';
import type { ActionDef, ActionResult } from '../types';
import { clone } from './shared';

const area = (l: Pt[]) => Math.abs(l.reduce((a, [x, y], i) => { const [u, v] = l[(i + 1) % l.length]; return a + x * v - u * y; }, 0)) / 2;
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const outlineOp = (it: ItemDoc): OpDoc | undefined => [...it.parts].sort((a, b) => a.z - b.z).flatMap((p) => p.ops).find((o) => o.kind === 'cut');

/** the four corners of a convex outline: the longest diagonal, then the farthest point on each side of it (in order round the hull) */
export function quadOf(outline: Pt[]): Pt[] | null {
  const h = hullOf(outline);
  if (h.length < 4) return null;
  let a = 0, c = 0, best = -1;
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) { const d = dist(h[i], h[j]); if (d > best) { best = d; a = i; c = j; } }
  const side = (p: Pt) => (h[c][0] - h[a][0]) * (p[1] - h[a][1]) - (h[c][1] - h[a][1]) * (p[0] - h[a][0]);
  let b = -1, d = -1, bb = 0, dd = 0;
  h.forEach((p, i) => { const s = side(p); if (s > bb) { bb = s; b = i; } if (-s > dd) { dd = -s; d = i; } });
  if (b < 0 || d < 0) return null;
  return [a, b, c, d].sort((x, y) => x - y).map((i) => h[i]);
}

/** the homography taking four points to four points (solved directly, 8 unknowns) */
export function homography(from: Pt[], to: Pt[]): number[] | null {
  const A: number[][] = [], B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    let piv = col; for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]]; [B[col], B[piv]] = [B[piv], B[col]];
    for (let r = 0; r < 8; r++) { if (r === col) continue; const f = A[r][col] / A[col][col]; for (let k = col; k < 8; k++) A[r][k] -= f * A[col][k]; B[r] -= f * B[col]; }
  }
  return B.map((b, i) => b / A[i][i]);
}
const warp = (m: number[], [x, y]: Pt): Pt => { const w = m[6] * x + m[7] * y + 1; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; };

export interface RectifyOpts { minFit: number }
export const rectify: ActionDef<RectifyOpts> = {
  id: 'rectify', label: 'Correct perspective', icon: 'i-solar:crop-minimalistic-linear', scope: 'item', arity: 'any', group: 'photo', ask: ['fix the perspective'], kind: 'code',
  hint: 'Correct the perspective of four-cornered items photographed at an angle (bookmarks, coasters, tags): each becomes a true rectangle, its holes and engraving with it.',
  schema: { type: 'object', properties: { minFit: { type: 'number', minimum: 0.8, maximum: 1 } } }, defaults: { minFit: 0.94 },
  says: [/\b(perspective|keystone|square (it|them) up|skew(ed)?)\b/i],
  can: (d, i) => (d.items.some((it) => i.targets.includes(it.id) && outlineOp(it)) ? true : 'Nothing with an outline'),
  run(doc: CraftDoc, { targets, opts }): ActionResult {
    const fixed: string[] = [], items: ItemDoc[] = [];
    for (const it of doc.items.filter((x) => targets.includes(x.id))) {
      const op = outlineOp(it); if (!op) continue;
      const outer = geo.toLoops(op.geometry, 0.5).sort((a, b) => area(b) - area(a))[0];
      if (!outer) continue;
      const q = quadOf(outer); if (!q) continue;
      // four-cornered only: the outline fills its four-corner quad (a drop or a leaf does not)
      if (area(outer) / area(q) < opts.minFit || area(q) / area(hullOf(outer)) < opts.minFit) continue;
      // the rectangle it really is: its sides the mean of each opposite pair, along the quad's own direction, centred
      // where it was (so it still sits on the photo; straighten then turns it upright)
      const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[1], q[2]) + dist(q[0], q[3])) / 2;
      const ux = [(q[1][0] - q[0][0] + q[2][0] - q[3][0]) / 2, (q[1][1] - q[0][1] + q[2][1] - q[3][1]) / 2], ul = Math.hypot(ux[0], ux[1]) || 1;
      const e1: Pt = [ux[0] / ul, ux[1] / ul], e2: Pt = [-e1[1], e1[0]];
      // e2 must point from q0 to q3
      const s = Math.sign((q[3][0] - q[0][0]) * e2[0] + (q[3][1] - q[0][1]) * e2[1]) || 1;
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      const P = (a: number, b: number): Pt => [cx + e1[0] * a + s * e2[0] * b, cy + e1[1] * a + s * e2[1] * b];
      const rect = [P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)];
      const skew = Math.max(...[0, 1, 2, 3].map((i) => { const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4]; const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; return Math.abs(90 - (Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]))) * 180) / Math.PI); }));
      // already square (within half a percent of its size): nothing to correct — but it is the squarest shot
      if (Math.max(...q.map((p, i) => dist(p, rect[i]))) < Math.max(w, h) * 0.005) { if (it.shot?.skewDeg === undefined) items.push({ ...clone(it), shot: { ...it.shot, skewDeg: Math.round(skew * 10) / 10 } }); continue; }
      const m = homography(q, rect); if (!m) continue;
      const next = clone(it);
      for (const p of next.parts) p.ops = p.ops.map((o) => ({ ...o, geometry: geo.fromLoops(geo.toLoops(o.geometry, 0.5).map((l) => l.map((pt) => warp(m, pt)))) }));
      // the first look is what the photo was (a second pass sees the corrected card)
      if (it.shot?.skewDeg === undefined) next.shot = { ...it.shot, skewDeg: Math.round(skew * 10) / 10 };
      items.push(next); fixed.push(`${it.name} (corners ${skew.toFixed(1)}° off square)`);
    }
    if (!fixed.length) return { items, summary: 'No perspective to correct', detail: 'nothing four-cornered was photographed at an angle' };
    return { items, summary: `Corrected the perspective of ${fixed.length} item${fixed.length === 1 ? '' : 's'}`, detail: `${fixed.join(', ')} · each now a true rectangle, holes and engraving with it` };
  }
};
