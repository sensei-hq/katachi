// Hang an item on a hole (design/14 §6): a circle on the long axis, cut from the outline.
import { apply, difference as geoDifference, fromLoops, longAxisDeg, rotate, toLoops, transform, type Geometry, type Pt } from '../../geo';
import type { CraftDoc, Id, ItemDoc, OpDoc, PartDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';

export interface AddHoleOpts { diaMm: number; at: 'top' }

const clone = <T>(x: T): T => structuredClone(x);
const itemOf = (doc: CraftDoc, id: Id): ItemDoc | undefined => doc.items.find((i) => i.id === id);
const outlinePart = (item: ItemDoc): PartDoc | undefined =>
  item.parts.filter((p) => p.ops.some((o) => o.kind === 'cut')).sort((a, b) => a.z - b.z)[0];

/** a circle as 4 cubic segments (kappa), centred at c with radius r */
function circleGeom(c: Pt, r: number): Geometry {
  const k = (4 / 3) * (Math.SQRT2 - 1) * r;
  const [x, y] = c;
  return { paths: [{ start: [x + r, y], segs: [
    { k: 'C', c1: [x + r, y + k], c2: [x + k, y + r], to: [x, y + r] },
    { k: 'C', c1: [x - k, y + r], c2: [x - r, y + k], to: [x - r, y] },
    { k: 'C', c1: [x - r, y - k], c2: [x - k, y - r], to: [x, y - r] },
    { k: 'C', c1: [x + k, y - r], c2: [x + r, y - k], to: [x + r, y] },
  ], closed: true }] };
}

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

interface Placement { hole: Geometry; ok: boolean }

/** the hole circle in frame px, and whether it sits inside the outline with a 1 mm margin */
function place(item: ItemDoc, part: PartDoc, op: OpDoc, diaMm: number): Placement {
  const px = item.frame.pxPerMm;
  const r = (diaMm * px) / 2;
  const loops = toLoops(op.geometry, 0.25);
  if (!loops.length || !(r > 0)) return { hole: { paths: [] }, ok: false };
  // work in rotated space: top = smallest y after the frame's rotation
  const centre: Pt = [item.frame.size[0] / 2, item.frame.size[1] / 2];
  const rot = rotate(item.frame.fromSource.rotateDeg, centre);
  const turned = loops.map((l) => l.map((p) => apply(rot, p)));
  const top = Math.min(...turned.flat().map((p) => p[1]));
  const xs = turned.flat().map((p) => p[0]);
  const bcx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const bcy = (top + Math.max(...turned.flat().map((p) => p[1]))) / 2;
  // on the long axis at hole-edge diaMm in from the top; a near-horizontal axis falls back to top centre
  const a = (longAxisDeg(fromLoops(turned)) * Math.PI) / 180;
  const yStar = top + diaMm * px + r;
  const dir: Pt = [Math.cos(a), Math.sin(a)];
  const centrePx: Pt = Math.abs(dir[1]) < 0.17 ? [bcx, yStar] : [bcx + ((yStar - bcy) / dir[1]) * dir[0], yStar];
  // margin: 32 samples strictly inside (even-odd) and ≥ 1 mm from the outline
  const samples: Pt[] = Array.from({ length: 32 }, (_, i) => {
    const t = (2 * Math.PI * i) / 32;
    return [centrePx[0] + r * Math.cos(t), centrePx[1] + r * Math.sin(t)];
  });
  const ok = samples.every((s) => {
    if (turned.filter((l) => pointInPoly(s, l)).length % 2 !== 1) return false;
    return turned.every((l) => l.every((_, i) => pointSegDist(s, l[i], l[(i + 1) % l.length]) >= px));
  });
  const hole = transform(circleGeom(centrePx, r), rotate(-item.frame.fromSource.rotateDeg, centre));
  return { hole, ok };
}

export const addHole: ActionDef<AddHoleOpts> = {
  id: 'add-hole', label: 'Add hole', icon: 'i-solar:record-circle-linear', scope: 'item', arity: 'one', kind: 'code',
  hint: 'Add a hanging hole on the item’s axis: earring hook, ornament string, bookmark tassel.',
  schema: { type: 'object', properties: { diaMm: { type: 'number', minimum: 0 }, at: { type: 'string', enum: ['top'] } } },
  defaults: { diaMm: 3, at: 'top' },
  // adding one, said so ("fill the hole" is not this)
  says: [/\b(add|punch|drill|put|cut)\b[^.]*?(\b(?<diaMm>\d+(?:\.\d+)?)\s*mm\b[^.]*?)?\bhole\b|\bhanging hole\b/i],
  can: (doc, { targets, opts }) => {
    const it = targets.length === 1 ? itemOf(doc, targets[0]) : undefined;
    if (!it) return 'Pick one item to hang';
    if (!(Number(opts.diaMm) > 0)) return 'How wide a hole';
    if (opts.at !== 'top') return 'Only the top for now';
    const part = outlinePart(it);
    if (!part) return 'The item has no cut outline';
    const op = part.ops.find((o) => o.kind === 'cut')!;
    if (!place(it, part, op, Number(opts.diaMm)).ok) return 'Too close to the edge';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const it = itemOf(doc, targets[0])!;
    const part = outlinePart(it)!;
    const op = part.ops.find((o) => o.kind === 'cut')!;
    const { hole } = place(it, part, op, Number(opts.diaMm));
    const cut = { ...clone(op), geometry: geoDifference(clone(op.geometry), hole) };
    const next: PartDoc = { ...clone(part), ops: part.ops.map((o) => (o.id === op.id ? cut : o)) };
    return {
      items: [{ ...clone(it), parts: it.parts.map((p) => (p.id === part.id ? next : p)) }],
      summary: `Added a ${opts.diaMm} mm hanging hole to ${it.name}`,
    };
  },
};
