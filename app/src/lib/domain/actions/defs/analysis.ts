// The actions that look at an item as a whole (design/14 §6): straighten, interpolate (fill what a neighbour hid),
// resize, enhance. They change an item's frame (turn, scale, tier) or re-measure its parts from the photo.
import * as geo from '../../geo';
import { frameSize } from '../../craft';
import { TIER_PX, type CraftDoc, type ItemDoc, type OpDoc, type Tier } from '../../craft/types';
import { hiddenShare, hullOf, uprightTurn, type Pt } from '../../toolpath';
import { rasterisePaths, woodPiece } from '../../layering';
import type { PixelImage } from '../../colour';
import type { ActionDef, ActionResult } from '../types';
import { clone } from './shared';

const itemsOf = (doc: CraftDoc, ids: string[]) => doc.items.filter((i) => ids.includes(i.id));
/** an item's outline: the cut op of its backmost part (stacked art: the backing) */
const outlineOp = (item: ItemDoc): OpDoc | undefined => [...item.parts].sort((a, b) => a.z - b.z).flatMap((p) => p.ops).find((o) => o.kind === 'cut');
const loopsOf = (op?: OpDoc): Pt[][] => (op ? geo.toLoops(op.geometry, 0.5) : []);
const shoelace = (l: Pt[]) => Math.abs(l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const straighten: ActionDef<{ snapDeg: number }> = {
  id: 'straighten', label: 'Straighten', icon: 'i-solar:ruler-angular-linear', scope: 'item', arity: 'any', group: 'photo', ask: ['straighten the charms'], kind: 'code',
  hint: 'Turn items upright along their long axis (each onto its own sheet, its engraving with it).',
  schema: { type: 'object', properties: { snapDeg: { type: 'number', minimum: 0.1, maximum: 15 } } }, defaults: { snapDeg: 0.5 },
  says: [/\b(straighten|upright|level|tilted|crooked)\b/i],
  can: (d, i) => (itemsOf(d, i.targets).some((it) => outlineOp(it)) ? true : 'Nothing with an outline to straighten'),
  run(doc, { targets, opts }): ActionResult {
    const turned: string[] = [];
    // measured from the item as photographed (the geometry never turns), so straightening twice is the same as once
    const items = itemsOf(doc, targets).filter((it) => outlineOp(it)).map((it) => {
      const { turn } = uprightTurn(loopsOf(outlineOp(it)));
      const deg = Math.round(turn / opts.snapDeg) * opts.snapDeg;
      if (Math.abs(deg) >= opts.snapDeg) turned.push(`${it.name} ${round1(Math.abs(deg))}°`);
      return { ...clone(it), frame: { ...clone(it.frame), fromSource: { ...clone(it.frame.fromSource), rotateDeg: Math.abs(deg) < opts.snapDeg ? 0 : deg } } };
    });
    return { items, summary: items.length > 1 ? `Each of the ${items.length} items is on its own sheet, upright` : `${items[0].name} is upright`, detail: turned.length ? `turned ${turned.join(', ')}` : 'already upright' };
  }
};

/** an item's outline in the photo, isotropic units (0-1000 across; down scaled by the photo's aspect) */
function photoOutline(doc: CraftDoc, it: ItemDoc, outer: Pt[]): Pt[] {
  const src = doc.sources.find((x) => x.id === it.frame.fromSource.sourceId), ky = src && src.w ? (src.h / src.w) : 1;
  const { box } = it.frame.fromSource, [w, h] = it.frame.size;
  return outer.map(([x, y]) => [box.x + (x / w) * box.w, (box.y + (y / h) * box.h) * ky]);
}
const rot = (pts: Pt[], deg: number, [cx, cy]: Pt): Pt[] => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
const bounds = (pts: Pt[]) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }; };
const centre = (pts: Pt[]): Pt => { const b = bounds(pts); return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2]; };
/** the turn that stands the outline upright (narrowest box), from the straighten step's angle */
function uprightOf(pts: Pt[], deg: number) {
  const c = centre(pts), tries = [deg, -deg, 0].map((d) => { const up = rot(pts, d, c), b = bounds(up); return { d, up, b, w: b.x2 - b.x1 }; });
  return { c, ...tries.sort((a, b) => a.w - b.w)[0] };
}

export const interpolate: ActionDef<{ maxAddPct: number; onlyHidden: boolean }> = {
  id: 'interpolate', label: 'Fill in hidden edges', icon: 'i-solar:magic-stick-2-linear', scope: 'item', arity: 'any', group: 'photo', ask: ['fill in the hidden edges'], kind: 'code',
  hint: 'Rebuild the parts of items a neighbour or a tassel lay over in the photo, from the visible outline and the items like it; their holes stay.',
  schema: { type: 'object', properties: { maxAddPct: { type: 'number', minimum: 1, maximum: 60 }, onlyHidden: { type: 'boolean' } } }, defaults: { maxAddPct: 25, onlyHidden: true },
  says: [/\b(complete|restore|recover|rebuild|fill in|interpolate|extrapolate)\b.*\b(hidden|edges?|corners?|missing|covered|parts?)\b|\bfill (the )?missing\b/i],
  can: (d, i) => (itemsOf(d, i.targets).some((it) => outlineOp(it)) ? true : 'Nothing with an outline'),
  run(doc, { targets, opts }): ActionResult {
    const filled: string[] = [], skipped: string[] = [], items: ItemDoc[] = [];
    // the family: separate items photographed together (five bookmarks) are one kind — the same size, and as
    // convex as each other. An item a neighbour lay on is smaller than its family, or bitten where they are not.
    const all = doc.items.map((it) => { const op = outlineOp(it), loops = loopsOf(op); const outer = loops.length ? loops.reduce((b, l) => (shoelace(l) > shoelace(b) ? l : b)) : null;
      const ph = outer ? photoOutline(doc, it, outer) : null, up = ph ? uprightOf(ph, it.frame.fromSource.rotateDeg || 0) : null;
      return { it, op, loops, outer, ph, up, w: up ? up.b.x2 - up.b.x1 : 0, h: up ? up.b.y2 - up.b.y1 : 0, bite: outer ? hiddenShare([outer]) : 0 }; }).filter((x) => x.outer);
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const family = doc.kind === 'items' && all.length >= 3 ? all.filter((x) => Math.abs(x.h - med(all.map((y) => y.h))) <= 0.3 * med(all.map((y) => y.h))) : [];
    const W = family.length ? Math.max(...family.map((x) => x.w)) : 0;
    // a convex family (cards, bookmarks, tags): any bite in one of them is something lying on it
    const convex = family.length >= 3 && med(family.map((x) => x.bite)) < 0.03;
    for (const t of all.filter((x) => targets.includes(x.it.id))) {
      const { it, op, loops, outer } = t;
      let ring = outer!;
      let added = 0;
      const what: string[] = [];
      // 1 · bites: the outline gets its hull back
      const bite = hiddenShare([ring]);
      if (!opts.onlyHidden || bite > (convex ? 0.01 : 0.12)) { const hull = hullOf(ring); added += (shoelace(hull) - shoelace(ring)) / Math.max(1, shoelace(ring)) * 100; ring = hull; what.push('edges'); }
      // 2 · a strip hidden along a side: the item is narrower (or shorter) than its family. The far side is intact,
      // so the outline is mirrored across the card's middle onto the hidden side (corners and all)
      const inFamily = family.some((x) => x.it.id === it.id);
      if (inFamily && t.up) {
        // which side is hidden: the item's own sides run square to its top edge; the edge a neighbour left on it
        // runs along the neighbour, at the neighbour's angle (the bookmarks are fanned, never quite parallel)
        let up = rot(photoOutline(doc, it, ring), t.up.d, t.up.c);
        const b = bounds(up), w = b.x2 - b.x1, h = b.y2 - b.y1;
        const fit = (pts: Pt[], swap: boolean) => { if (pts.length < 3) return null; const xs = pts.map((p) => (swap ? p[1] : p[0])), ys = pts.map((p) => (swap ? p[0] : p[1]));
          const mx = xs.reduce((a, v) => a + v, 0) / xs.length, my = ys.reduce((a, v) => a + v, 0) / ys.length;
          let num = 0, den = 0; for (let k = 0; k < xs.length; k++) { num += (xs[k] - mx) * (ys[k] - my); den += (xs[k] - mx) ** 2; } return den ? num / den : 0; };
        // dense along every edge (a mask can be a handful of corners)
        const dense: Pt[] = up.flatMap((p, k) => { const q = up[(k + 1) % up.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (h / 200))); return Array.from({ length: n }, (_, j) => [p[0] + ((q[0] - p[0]) * j) / n, p[1] + ((q[1] - p[1]) * j) / n] as Pt); });
        const mid = (p: Pt) => p[1] > b.y1 + h * 0.15 && p[1] < b.y2 - h * 0.15;
        // a side that a neighbour lies on is that neighbour's own edge: it runs along the neighbour's long axis,
        // not this item's (the bookmarks are fanned, each at its own angle). A side by a neighbour that runs along
        // this item's axis is one it lies on itself; a side by nothing (a tassel's notch) is left to the hull.
        const sideOf = (left: boolean) => {
          // this half of the outline (not its ends)
          const pts = dense.filter((p) => (left ? p[0] < (b.x1 + b.x2) / 2 : p[0] > (b.x1 + b.x2) / 2) && mid(p));
          if (pts.length < 6) return 0;
          const inPhoto = rot(pts, -t.up!.d, t.up!.c), eps = w * 0.04;
          let best: { n: (typeof all)[number]; at: Pt[] } | null = null;
          for (const n of all) {
            if (n.it.id === it.id || !n.ph || !n.up) continue;
            const at = inPhoto.filter((p) => n.ph!.some((q, j) => { const r = n.ph![(j + 1) % n.ph!.length], dx = r[0] - q[0], dy = r[1] - q[1], L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / L)); return Math.hypot(p[0] - q[0] - u * dx, p[1] - q[1] - u * dy) < eps; }));
            if (at.length > (best?.at.length ?? 0)) best = { n, at };
          }
          if (!best || best.at.length < Math.max(6, pts.length * 0.15)) return 0;
          // the shared stretch, as a line: along whose long axis does it run?
          const own = Math.abs(fit(rot(best.at, t.up!.d, t.up!.c), true) ?? 0), theirs = Math.abs(fit(rot(best.at, best.n.up!.d, best.n.up!.c), true) ?? 0);
          // clearly closer to the neighbour's axis (two bookmarks a few degrees apart still tell apart)
          return theirs < own * 0.85 && own - theirs > 0.005 ? 1 : 0;
        };
        const hidL = sideOf(true), hidR = sideOf(false);
        if (hidL !== hidR) {
          {
            const hiddenLeft = hidL > hidR;
            const before = shoelace(up);
            // stand the card on its intact side first: the visible part's own axis leans toward the bite, so a
            // mirror across it would give a wedge. The intact side's outermost stretch is the card's real edge.
            {
              const side = dense.filter((p) => (hiddenLeft ? p[0] > b.x2 - w * 0.06 : p[0] < b.x1 + w * 0.06) && mid(p));
              const slope = fit(side, true);
              if (slope !== null && Math.abs(slope) > 0.005) {
                const extra = (Math.atan(slope) * 180) / Math.PI;
                up = rot(up, extra, t.up.c); t.up.d += extra;
              }
            }
            // the card's width: where the neighbour's edge runs away from it, the full width still shows (its widest
            // row across); never more than the family's widest
            const bb = bounds(up);
            const rowW = (y: number) => { const xs: number[] = []; for (let k = 0; k < up.length; k++) { const [x1, y1] = up[k], [x2, y2] = up[(k + 1) % up.length]; if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)); } return xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0; };
            const Wi = Math.min(W, Math.max(...Array.from({ length: 41 }, (_, k) => rowW(bb.y1 + (bb.y2 - bb.y1) * (0.1 + 0.8 * (k / 40))))));
            const at = hiddenLeft ? bb.x2 - Wi / 2 : bb.x1 + Wi / 2;
            up = hullOf([...up, ...up.map(([x, y]) => [2 * at - x, y] as Pt)]);
            added += ((shoelace(up) - before) / Math.max(1, before)) * 100;
            what.push(hiddenLeft ? 'left side' : 'right side');
            const src = doc.sources.find((x) => x.id === it.frame.fromSource.sourceId), ky = src && src.w ? (src.h / src.w) : 1;
            const { box } = it.frame.fromSource, [fw, fh] = it.frame.size;
            ring = rot(up, -t.up.d, t.up.c).map(([x, y]) => [((x - box.x) / box.w) * fw, ((y / ky - box.y) / box.h) * fh]);
          }
        }
      }
      if (!what.length) continue;
      // a hidden strip is a lot of card (half a bookmark under its neighbours): it gets twice the allowance
      if (added > opts.maxAddPct * (what.some((x) => x !== 'edges') ? 2 : 1)) { skipped.push(`${it.name} (+${Math.round(added)}%)`); continue; }
      // the new outline and every other loop (its holes) — by loop, never by path index (a path that flattens to
      // nothing would shift the indexes and keep the old outline as well, nesting every hole one level deeper)
      const geometry = geo.fromLoops([ring, ...loops.filter((l) => l !== outer)]);
      const next = clone(it);
      for (const p of next.parts) p.ops = p.ops.map((o) => (o.id === op!.id ? { ...o, geometry } : o));
      // a card rebuilt from its intact side stands upright on that side: straightened again from the whole outline
      if (what.some((x) => x !== 'edges')) { const { turn } = uprightTurn([ring]); const deg = Math.round(turn / 0.5) * 0.5; next.frame = { ...next.frame, fromSource: { ...next.frame.fromSource, rotateDeg: Math.abs(deg) < 0.5 ? 0 : deg } }; }
      next.shot = { ...next.shot, filledPct: Math.round(added * 10) / 10 };
      items.push(next); filled.push(`${it.name} (+${round1(added)}%${what.some((w) => w !== 'edges') ? `, ${what.filter((w) => w !== 'edges').join(' and ')} from its other side` : ''})`);
    }
    if (!items.length) return { items: [], summary: skipped.length ? `Didn’t fill ${skipped.join(', ')} — more than ${opts.maxAddPct}% would be guessed` : 'Nothing is hidden' };
    return { items, summary: `Filled in the hidden edges of ${filled.map((f) => f.replace(/ \(.*/, '')).join(', ')}`, detail: `${filled.join(', ')}${skipped.length ? ` · left as photographed: ${skipped.join(', ')}` : ''} · holes kept` };
  }
};

export const resize: ActionDef<{ wMm?: number; hMm?: number; scale?: number; keepAspect: boolean }> = {
  id: 'resize', label: 'Resize', icon: 'i-solar:ruler-cross-pen-linear', scope: 'item', arity: 'any', group: 'photo', ask: ['make it 40 mm tall'], kind: 'code',
  hint: 'Set an item’s real size in mm (width, height or a scale); proportions kept unless told otherwise.',
  schema: { type: 'object', properties: { wMm: { type: 'number', minimum: 5, maximum: 2000 }, hMm: { type: 'number', minimum: 5, maximum: 2000 }, scale: { type: 'number', minimum: 0.05, maximum: 20 }, keepAspect: { type: 'boolean' } } }, defaults: { keepAspect: true },
  says: [/\b(\d+(?:\.\d+)?)\s*(mm|cm|in)\b.*\b(wide|tall|high|across)\b|\bscale\b.*\d+\s*%/i],
  can: (_d, i) => (i.opts.wMm || i.opts.hMm || i.opts.scale ? (i.targets.length ? true : 'Pick what to resize') : 'Say the size (e.g. 40 mm tall)'),
  run(doc, { targets, opts }): ActionResult {
    const items = itemsOf(doc, targets).map((it) => {
      const f = clone(it.frame), w = f.size[0] / f.pxPerMm, h = f.size[1] / f.pxPerMm;
      if (opts.scale) f.pxPerMm /= opts.scale;
      else if (!opts.keepAspect && opts.wMm && opts.hMm) {
        // a new shape, not just a new size: the geometry stretches to the new proportions within the same frame width
        const sy = (opts.hMm / h) / (opts.wMm / w), next = clone(it);
        next.frame = { ...f, size: [f.size[0], Math.round(f.size[1] * sy)], pxPerMm: f.size[0] / opts.wMm };
        for (const p of next.parts) p.ops = p.ops.map((o) => ({ ...o, geometry: geo.transform(o.geometry, geo.scale(1, sy)) }));
        return next;
      } else if (opts.wMm) f.pxPerMm = f.size[0] / opts.wMm;
      else if (opts.hMm) f.pxPerMm = f.size[1] / opts.hMm;
      return { ...clone(it), frame: f };
    });
    const s = items[0] ? `${round1(items[0].frame.size[0] / items[0].frame.pxPerMm)} × ${round1(items[0].frame.size[1] / items[0].frame.pxPerMm)} mm` : '';
    return { items, summary: items.length > 1 ? `Resized ${items.length} items (the first is ${s})` : `${items[0]?.name} is now ${s}` };
  }
};

/** a box of the photo resampled to w × h (bilinear) */
function cropTo(img: PixelImage, box: { x: number; y: number; w: number; h: number }, w: number, h: number): PixelImage {
  const data = new Uint8ClampedArray(w * h * 4), sx = (box.w / 1000) * img.w / w, sy = (box.h / 1000) * img.h / h, ox = (box.x / 1000) * img.w, oy = (box.y / 1000) * img.h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = Math.min(img.w - 1.001, Math.max(0, ox + (x + 0.5) * sx - 0.5)), fy = Math.min(img.h - 1.001, Math.max(0, oy + (y + 0.5) * sy - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    for (let c = 0; c < 4; c++) {
      const at = (xx: number, yy: number) => img.data[(yy * img.w + xx) * 4 + c];
      data[(y * w + x) * 4 + c] = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
    }
  }
  return { w, h, data };
}
const NEXT: Record<Tier, Tier> = { S: 'M', M: 'L', L: 'XL', XL: 'XL' };

export const enhance: ActionDef<{ tier: 'auto' | Tier; resegment: boolean }> = {
  id: 'enhance', label: 'Enhance', icon: 'i-solar:magnifier-zoom-in-linear', scope: 'item', arity: 'any', group: 'photo', ask: ['enhance this item'], kind: 'model',
  hint: 'Look closer at small or fine items: the item is cropped from the original photo at a higher resolution, outlined again by SAM, and its holes and engraving re-measured.',
  schema: { type: 'object', properties: { tier: { enum: ['auto', 'S', 'M', 'L', 'XL'] }, resegment: { type: 'boolean' } } }, defaults: { tier: 'auto', resegment: true },
  says: [/\b(enhance|sharpen|upscale|closer look|more detail|higher res)\b/i],
  can: (d, i) => (itemsOf(d, i.targets).some((it) => d.sources.some((s) => s.id === it.frame.fromSource.sourceId && s.kind !== 'kit-layout')) ? true : 'Only items from a photo can be enhanced'),
  async run(doc, { targets, opts }, ctx): Promise<ActionResult> {
    const items: ItemDoc[] = [], done: string[] = []; let cost = 0, ms = 0, sam = false;
    for (const it of itemsOf(doc, targets)) {
      const src = it.frame.fromSource, img = await ctx.pixels(src.sourceId, 4096);
      if (!img) continue;
      // one tier up (or the one asked for): the frame grows, the geometry with it, the size in mm stays
      const tier = opts.tier === 'auto' ? NEXT[it.frame.tier] : opts.tier;
      const wMm = it.frame.size[0] / it.frame.pxPerMm, hMm = it.frame.size[1] / it.frame.pxPerMm, size = frameSize(tier, wMm, hMm);
      const k = size[0] / it.frame.size[0], next = clone(it);
      next.frame = { ...next.frame, tier, size, pxPerMm: Math.max(...size) / Math.max(wMm, hMm) };
      const crop = cropTo(img, src.box, size[0], size[1]);
      const op = outlineOp(next);
      let outline: Pt[][] = loopsOf(op).map((l) => l.map(([x, y]) => [x * k, y * k] as Pt));
      if (opts.resegment && ctx.muse) {
        const r = await ctx.muse.segmentCrop(crop, it.name);
        if (r?.paths.length) { outline = r.paths.map((l) => l.map(([x, y]) => [(x / 1000) * size[0], (y / 1000) * size[1]] as Pt)); cost += r.costUsd; ms += r.latencyMs; sam = true; }
      }
      // holes and engraving measured again at the new resolution (design/13): fine lattices resolve here
      const mask = rasterisePaths(outline.map((l) => l.map(([x, y]) => [(x / size[0]) * 1000, (y / size[1]) * 1000] as [number, number])), size[0], size[1]);
      const wp = woodPiece(crop, mask);
      const px = (paths: [number, number][][]) => paths.map((l) => l.map(([x, y]) => [(x / 1000) * size[0], (y / 1000) * size[1]] as Pt));
      for (const p of next.parts) p.ops = p.ops.map((o) => (o.kind === 'cut' && o.id === op?.id ? { ...o, geometry: geo.fromLoops(px(wp.cutPaths.length ? wp.cutPaths : outline.map((l) => l.map(([x, y]) => [(x / size[0]) * 1000, (y / size[1]) * 1000] as [number, number])))) } : o.kind === 'cut' ? { ...o, geometry: geo.transform(o.geometry, geo.scale(k)) } : o));
      const owner = next.parts.find((p) => p.ops.some((o) => o.id === op?.id));
      if (owner) {
        const engr = owner.ops.filter((o) => o.kind === 'engrave');
        const fresh = wp.engravePct >= 2 && wp.engravePaths.length ? geo.fromLoops(px(wp.engravePaths)) : null;
        owner.ops = [...(fresh ? [{ id: engr[0]?.id ?? ctx.newId(), kind: 'engrave' as const, geometry: fresh }] : engr.map((o) => ({ ...o, geometry: geo.transform(o.geometry, geo.scale(k)) }))), ...owner.ops.filter((o) => o.kind !== 'engrave')];
      }
      for (const p of next.parts.filter((x) => x !== owner)) p.ops = p.ops.map((o) => (o.kind === 'cut' ? o : { ...o, geometry: geo.transform(o.geometry, geo.scale(k)) }));
      items.push(next); done.push(`${it.name} (${TIER_PX[it.frame.tier]} → ${TIER_PX[tier]} px, ${wp.holesPct}% holes)`);
    }
    return { items, summary: items.length ? `Enhanced ${items.length > 2 ? `${items.length} items` : items.map((i) => i.name).join(' and ')}` : 'Nothing could be enhanced (the photo isn’t available)', detail: done.join(' · '), ...(sam ? { model: { name: 'SAM 3.1', costUsd: cost, latencyMs: ms } } : {}) };
  }
};

export const analysisActions = [straighten, interpolate, resize, enhance];
