// Same size (design/14 §6): things made as a set are cut the same size. Which things are a set depends on what
// they are: a pair of earrings is (left and right), a tray of different earrings is not; five bookmarks are.
// The reference is the one the photo shows best: shot squarest (least perspective) and whole (nothing filled in).
import * as geo from '../../geo';
import type { Pt } from '../../geo';
import type { CraftDoc, ItemDoc, OpDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';
import { clone } from './shared';

const outlineOp = (it: ItemDoc): OpDoc | undefined => [...it.parts].sort((a, b) => a.z - b.z).flatMap((p) => p.ops).find((o) => o.kind === 'cut');
const rot = (pts: Pt[], deg: number, [cx, cy]: Pt): Pt[] => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
const box = (pts: Pt[]) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }; };

/** an item as cut: its upright turn (the narrowest of ±its straighten angle), centre and size in mm */
function asCut(it: ItemDoc) {
  const op = outlineOp(it); if (!op) return null;
  const pts = geo.toLoops(op.geometry, 0.5).flat(); if (pts.length < 3) return null;
  const b0 = box(pts), c: Pt = [(b0.x1 + b0.x2) / 2, (b0.y1 + b0.y2) / 2], d0 = it.frame.fromSource.rotateDeg || 0;
  const best = [d0, -d0, 0].map((d) => { const b = box(rot(pts, d, c)); return { d, w: b.x2 - b.x1, h: b.y2 - b.y1 }; }).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  return { d: best.d, c, wMm: best.w / it.frame.pxPerMm, hMm: best.h / it.frame.pxPerMm };
}
/** the word that says what each item is ("Elephant bookmark" → bookmark), when they all share it */
const kindOf = (name: string) => name.toLowerCase().replace(/\b(left|right|copy|\d+)\b/g, '').trim().split(/\s+/).at(-1) ?? '';

/** the sets in a craft: its pairs and sets (groups) when it has them, else all of one kind (five bookmarks) */
export function setsOf(doc: CraftDoc, ids: string[]): ItemDoc[][] {
  const items = doc.items.filter((i) => ids.includes(i.id));
  const grouped = doc.groups.map((g) => items.filter((i) => g.items.includes(i.id))).filter((s) => s.length >= 2);
  if (grouped.length) return grouped;
  const kinds = new Map<string, ItemDoc[]>();
  for (const it of items) { const k = kindOf(it.name); kinds.set(k, [...(kinds.get(k) ?? []), it]); }
  // things worn in pairs (earrings, cufflinks) are a set only as a pair: a tray of different earrings is not one size
  return [...kinds.entries()].filter(([k, s]) => s.length >= 3 && !/^(earrings?|cufflinks?|studs?|drops?|hoops?)$/.test(k)).map(([, s]) => s);
}

export interface SameSizeOpts { tolerancePct: number }
export const sameSize: ActionDef<SameSizeOpts> = {
  id: 'same-size', label: 'Same size', icon: 'i-solar:ruler-linear', scope: 'item', arity: 'any', group: 'shape', ask: ['make them the same size'], kind: 'code',
  hint: 'Make the items of a set the same size: a pair (left and right) together, or all items of one kind (five bookmarks). The one the photo shows squarest and whole is the reference.',
  schema: { type: 'object', properties: { tolerancePct: { type: 'number', minimum: 5, maximum: 50 } } }, defaults: { tolerancePct: 40 },
  says: [/\b(same size|equal size|match (the )?sizes?|all the same)\b/i],
  can: (d, i) => (setsOf(d, i.targets).length ? true : 'No set here: a pair, or several of one kind'),
  run(doc, { targets, opts }): ActionResult {
    const items: ItemDoc[] = [], said: string[] = [];
    for (const set of setsOf(doc, targets)) {
      const cut = set.map((it) => ({ it, m: asCut(it) })).filter((x): x is { it: ItemDoc; m: NonNullable<ReturnType<typeof asCut>> } => Boolean(x.m));
      if (cut.length < 2) continue;
      // the reference: whole (nothing filled in), then squarest; the biggest breaks a tie
      const ref = [...cut].sort((a, b) => ((a.it.shot?.filledPct ?? 0) > 2 ? 1 : 0) - ((b.it.shot?.filledPct ?? 0) > 2 ? 1 : 0) || (a.it.shot?.skewDeg ?? 5) - (b.it.shot?.skewDeg ?? 5) || b.m.wMm * b.m.hMm - a.m.wMm * a.m.hMm)[0];
      const changed: string[] = [];
      for (const x of cut) {
        if (x === ref) continue;
        const sx = ref.m.wMm / x.m.wMm, sy = ref.m.hMm / x.m.hMm;
        // a set's members are near the same size already; a very different one is not the same thing
        if (Math.abs(sx - 1) * 100 > opts.tolerancePct || Math.abs(sy - 1) * 100 > opts.tolerancePct) continue;
        if (Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) continue;
        // scaled in the item's upright frame (its width and its length), then turned back as it was
        const f = (p: Pt): Pt => { const [u] = rot([p], x.m.d, x.m.c); const v: Pt = [x.m.c[0] + (u[0] - x.m.c[0]) * sx, x.m.c[1] + (u[1] - x.m.c[1]) * sy]; return rot([v], -x.m.d, x.m.c)[0]; };
        const next = clone(x.it);
        for (const p of next.parts) p.ops = p.ops.map((o) => ({ ...o, geometry: geo.fromLoops(geo.toLoops(o.geometry, 0.5).map((l) => l.map(f))) }));
        items.push(next); changed.push(`${x.it.name} ${Math.round(x.m.wMm)} × ${Math.round(x.m.hMm)} → ${Math.round(ref.m.wMm)} × ${Math.round(ref.m.hMm)} mm`);
      }
      if (changed.length) said.push(`${changed.join(', ')} (like ${ref.it.name}${ref.it.shot?.skewDeg !== undefined ? `, shot ${ref.it.shot.skewDeg}° off square` : ''})`);
    }
    if (!items.length) return { items: [], summary: 'Already the same size', detail: 'each set matches its best-shot member' };
    return { items, summary: `Made ${items.length} item${items.length === 1 ? '' : 's'} the same size as their set`, detail: said.join(' · ') };
  }
};
