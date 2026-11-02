// The clean-up pass (design/14 §6): a photo's trace has specks, ragged holes and small asymmetries a maker would
// never draw. Three code actions fix them, each measured against the shape it started from:
// - tidy: specks and pin-holes too small to cut are dropped;
// - repeat-pattern: holes that repeat (a lattice, a ring of petals) are made identical — the cleanest copy of each
//   repeated hole, placed where each one was;
// - symmetrize: an item that is nearly mirror-symmetric about its upright axis is made exactly symmetric.
import * as geo from '../../geo';
import type { Pt } from '../../geo';
import type { CraftDoc, Id, ItemDoc, OpDoc, PartDoc } from '../../craft/types';
import { indexCraft } from '../../craft';
import type { ActionDef, ActionResult } from '../types';

const clone = <T>(x: T): T => structuredClone(x);
const loopArea = (l: Pt[]) => Math.abs(l.reduce((a, [x, y], k) => { const [u, v] = l[(k + 1) % l.length]; return a + x * v - u * y; }, 0)) / 2;
const boxOf = (l: Pt[]) => { const xs = l.map((p) => p[0]), ys = l.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
const inside = ([x, y]: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** each loop with how many others it sits inside (even = material outline, odd = hole) */
function nested(g: geo.Geometry) {
  const loops = geo.toLoops(g, 0.5).filter((l) => l.length > 2), boxes = loops.map(boxOf);
  // a box test first: most loops are nowhere near each other (hundreds of specks on a traced layer)
  const within = (i: number, j: number) => { const a = boxes[i], b = boxes[j]; return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && inside(loops[i][0], loops[j]); };
  return loops.map((l, i) => ({ l, depth: loops.reduce((n, _, j) => n + (j !== i && within(i, j) ? 1 : 0), 0), area: loopArea(l) }));
}
const partsOf = (doc: CraftDoc, ids: Id[]) => {
  const ix = indexCraft(doc);
  return ids.map((id) => ix.get(id)).filter((n): n is Extract<NonNullable<typeof n>, { kind: 'part' }> => n?.kind === 'part').map((n) => ({ part: n.node as PartDoc, item: n.item as ItemDoc }));
};
/** the changed parts, put back into whole items (several parts of one item stay together) */
function withParts(doc: CraftDoc, changed: Map<Id, PartDoc>): ItemDoc[] {
  return doc.items.filter((it) => it.parts.some((p) => changed.has(p.id))).map((it) => ({ ...clone(it), parts: it.parts.map((p) => changed.get(p.id) ?? p) }));
}

// ── tidy
export interface TidyOpts { minMm2: number; thinMm: number }
/** the outline without its thin wire bits (an earring's hook, a bookmark's cord, a hanging loop of string): an
 *  opening of the outer outline only — inner fretwork bars are never touched. null when nothing thin was there
 *  or the opening would take real material (more than 20% of the piece). */
function withoutWire(g: geo.Geometry, r: number): geo.Geometry | null {
  if (r <= 0) return null;
  const ls = nested(g), outer = ls.filter((x) => x.depth === 0);
  if (!outer.length) return null;
  const before = outer.reduce((a, x) => a + x.area, 0);
  // on a simplified copy of the outline (r/4): the opening is coarse by nature, and the full trace is thousands of points
  const opened = geo.offset(geo.offset(geo.simplify(geo.fromLoops(outer.map((x) => x.l)), r / 4), -r), r);
  const kept = geo.toLoops(opened, 0.25).filter((l) => l.length > 2);
  const after = kept.reduce((a, l) => a + loopArea(l), 0);
  if (!kept.length || after < before * 0.8 || before - after < r * r * 4) return null;
  return geo.fromLoops([...kept, ...ls.filter((x) => x.depth > 0 && kept.some((o) => inside(x.l[0], o))).map((x) => x.l)]);
}
export const tidy: ActionDef<TidyOpts> = {
  id: 'tidy', label: 'Tidy', icon: 'i-solar:broom-linear', scope: 'part', arity: 'any', kind: 'code',
  hint: 'Drop specks and pin-holes too small to cut (trace noise), and thin wire bits on the outline (an earring hook, a bookmark cord), on the given layers or all.',
  schema: { type: 'object', properties: { minMm2: { type: 'number', minimum: 0.1, maximum: 20 }, thinMm: { type: 'number', minimum: 0, maximum: 3 } } }, defaults: { minMm2: 1, thinMm: 0.6 },
  says: [/\b(tidy|clean ?up|clean it|remove (the )?(specks|noise|dots))\b/i],
  can: (d, i) => (partsOf(d, i.targets).some(({ part }) => part.ops.length) ? true : 'Nothing to tidy'),
  run(doc, { targets, opts }): ActionResult {
    const changed = new Map<Id, PartDoc>(); let specks = 0, pins = 0, wires = 0;
    for (const { part, item } of partsOf(doc, targets)) {
      const mm2 = item.frame.pxPerMm ** 2, min = opts.minMm2 * mm2;
      const ops = part.ops.map((o0): OpDoc => {
        const open = o0.kind === 'cut' ? withoutWire(o0.geometry, (opts.thinMm ?? 0) * item.frame.pxPerMm) : null;
        if (open) wires++;
        const o = open ? { ...clone(o0), geometry: open } : o0;
        const ls = nested(o.geometry); if (ls.length < 2) return o;
        const biggest = Math.max(...ls.filter((x) => x.depth % 2 === 0).map((x) => x.area), 0);
        const keep = ls.filter((x) => {
          if (x.depth % 2 === 0 && x.area < min && x.area < biggest) { specks++; return false; }
          if (x.depth % 2 === 1 && o.kind === 'cut' && x.area < min / 2) { pins++; return false; }
          return true;
        });
        // a hole's island goes with the hole that held it (no floating island inside solid wood)
        // only the specks and pin-holes go: a traced piece can carry two outer loops (its mask's and its edge shadow's),
        // so a loop's depth alone never says it is stray
        return keep.length === ls.length ? o : { ...clone(o), geometry: geo.fromLoops(keep.map((x) => x.l)) };
      });
      if (ops.some((o, k) => o !== part.ops[k])) changed.set(part.id, { ...clone(part), ops });
    }
    return { items: withParts(doc, changed), summary: changed.size ? `Tidied ${changed.size} layer${changed.size === 1 ? '' : 's'}` : 'Nothing to tidy',
      detail: `${specks} speck${specks === 1 ? '' : 's'} and ${pins} pin-hole${pins === 1 ? '' : 's'} under ${opts.minMm2} mm² dropped${wires ? ` · thin wire bits (hooks, cords) taken off ${wires} outline${wires === 1 ? '' : 's'}` : ''}` };
  }
};

// ── repeat-pattern
export interface PatternOpts { tolerancePct: number }
export const repeatPattern: ActionDef<PatternOpts> = {
  id: 'repeat-pattern', label: 'Even out the pattern', icon: 'i-solar:widget-4-linear', scope: 'part', arity: 'any', kind: 'code',
  hint: 'Find holes that repeat (a lattice, a ring of petals) and make every copy identical — the cleanest one, placed where each was.',
  schema: { type: 'object', properties: { tolerancePct: { type: 'number', minimum: 5, maximum: 40 } } }, defaults: { tolerancePct: 20 },
  says: [/\b(even out|regulari[sz]e|repeat|pattern)\b.*\b(pattern|holes?|lattice|cut-?outs?)\b/i],
  can: (d, i) => (partsOf(d, i.targets).some(({ part }) => part.ops.some((o) => o.kind === 'cut')) ? true : 'No cut to even out'),
  run(doc, { targets, opts }): ActionResult {
    const changed = new Map<Id, PartDoc>(); let groups = 0, holes = 0;
    const t = opts.tolerancePct / 100, near = (a: number, b: number) => Math.abs(a - b) <= t * Math.max(a, b, 1e-9);
    for (const { part } of partsOf(doc, targets)) {
      const ops = part.ops.map((o): OpDoc => {
        if (o.kind !== 'cut') return o;
        const ls = nested(o.geometry), hs = ls.map((x, k) => ({ ...x, k, b: boxOf(x.l) })).filter((x) => x.depth === 1 && x.l.length >= 6);
        const taken = new Set<number>(), replace = new Map<number, Pt[]>();
        for (const h of hs) {
          if (taken.has(h.k)) continue;
          const same = hs.filter((o2) => !taken.has(o2.k) && near(o2.area, h.area) && near(o2.b.w, h.b.w) && near(o2.b.h, h.b.h));
          if (same.length < 3) continue;
          same.forEach((x) => taken.add(x.k));
          // the cleanest copy: the one whose area is the group's median (the outliers are the ragged ones)
          const best = [...same].sort((a, b) => a.area - b.area)[Math.floor(same.length / 2)];
          const [cx, cy] = [best.b.x + best.b.w / 2, best.b.y + best.b.h / 2];
          for (const x of same) if (x !== best) replace.set(x.k, best.l.map(([px, py]) => [px - cx + x.b.x + x.b.w / 2, py - cy + x.b.y + x.b.h / 2] as Pt));
          groups++; holes += same.length;
        }
        return replace.size ? { ...clone(o), geometry: geo.fromLoops(ls.map((x, k) => replace.get(k) ?? x.l)) } : o;
      });
      if (ops.some((o, k) => o !== part.ops[k])) changed.set(part.id, { ...clone(part), ops });
    }
    return { items: withParts(doc, changed), summary: groups ? `Evened out ${groups} repeated hole${groups === 1 ? '' : 's'}` : 'No repeating holes found', detail: groups ? `${holes} holes now identical copies of the cleanest one` : 'each hole is its own shape' };
  }
};

// ── symmetrize
export interface SymOpts { maxOffPct: number }
const tryAxis = (g: geo.Geometry, deg: number) => {
  const b0 = geo.bbox(g)!, c: Pt = [b0.x + b0.w / 2, b0.y + b0.h / 2];
  const up = geo.transform(g, geo.rotate(deg, c)), b = geo.bbox(up)!, ax = b.x + b.w / 2;
  // judged on the outline alone, simplified (the holes follow it; measuring every fretwork hole took seconds)
  const ls = nested(up), outer = ls.filter((x) => x.depth === 0).sort((p, q) => q.area - p.area)[0];
  const side = Math.max(b.w, b.h), o = outer ? geo.simplify(geo.fromLoops([outer.l]), side / 300) : up;
  let off = geo.hausdorff(o, geo.transform(o, geo.flip('x', [ax, 0])), side / 80) / side;
  // the holes must mirror too (a bookmark's outline is symmetric; its elephant is not): each hole needs a twin
  // across the axis, near enough in place and size — else the design is not symmetric, whatever its outline
  const holes = ls.filter((x) => x.depth % 2 === 1).map((x) => { const hb = boxOf(x.l); return { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2, a: x.area }; });
  const twin = (h: (typeof holes)[number]) => holes.some((t) => Math.abs(t.x - (2 * ax - h.x)) < side * 0.03 && Math.abs(t.y - h.y) < side * 0.03 && Math.abs(t.a - h.a) <= 0.3 * Math.max(t.a, h.a));
  const big = holes.filter((h) => h.a > (side * 0.01) ** 2);
  if (big.length && big.filter(twin).length < big.length * 0.9) off = Math.max(off, 1);
  return { off, ax, c, b };
};
export const symmetrize: ActionDef<SymOpts> = {
  id: 'symmetrize', label: 'Make symmetric', icon: 'i-solar:align-horizontal-center-linear', scope: 'item', arity: 'any', kind: 'code',
  hint: 'An item that is nearly mirror-symmetric (a charm, an earring, a leaf) is made exactly symmetric about its upright axis; others are left alone.',
  schema: { type: 'object', properties: { maxOffPct: { type: 'number', minimum: 1, maximum: 10 } } }, defaults: { maxOffPct: 3 },
  says: [/\bsymmetr(ic|ical|y|i[sz]e)\b/i],
  can: (d, i) => (d.items.some((it) => i.targets.includes(it.id) && it.parts.some((p) => p.ops.some((o) => o.kind === 'cut'))) ? true : 'Nothing with an outline'),
  run(doc, { targets, opts }): ActionResult {
    const made: string[] = [], skipped: string[] = [], items: ItemDoc[] = [];
    for (const it of doc.items.filter((x) => targets.includes(x.id))) {
      const cut = it.parts.flatMap((p) => p.ops).find((o) => o.kind === 'cut'); if (!cut) continue;
      const r = it.frame.fromSource.rotateDeg || 0;
      const tries = [r, -r].map((deg) => ({ deg, ...tryAxis(cut.geometry, deg) })), best = tries[0].off <= tries[1].off ? tries[0] : tries[1];
      if (best.off * 100 > opts.maxOffPct) { skipped.push(it.name); continue; }
      const deg = best.deg;
      const half = (g: geo.Geometry) => {
        const up = geo.transform(g, geo.rotate(deg, best.c)), big = Math.max(best.b.w, best.b.h) * 4;
        const left = geo.difference(up, geo.fromLoops([[[best.ax, best.b.y - big], [best.ax + big, best.b.y - big], [best.ax + big, best.b.y + big], [best.ax, best.b.y + big]]]));
        return geo.transform(geo.union(left, geo.transform(left, geo.flip('x', [best.ax, 0]))), geo.rotate(-deg, best.c));
      };
      items.push({ ...clone(it), parts: it.parts.map((p) => ({ ...clone(p), ops: p.ops.map((o) => ({ ...clone(o), geometry: o.kind === 'cut' ? half(o.geometry) : clone(o.geometry) })) })) });
      made.push(`${it.name} (${(best.off * 100).toFixed(1)}% off)`);
    }
    return { items, summary: made.length ? `Made ${made.length} item${made.length === 1 ? '' : 's'} exactly symmetric` : 'Nothing was nearly symmetric', detail: [made.length ? made.join(', ') : '', skipped.length ? `left as drawn: ${skipped.slice(0, 4).join(', ')}${skipped.length > 4 ? '…' : ''}` : ''].filter(Boolean).join(' · ') };
  }
};

export const cleanupActions = [tidy, repeatPattern, symmetrize];
