// The actions that look at an item as a whole (design/14 §6): straighten, interpolate (fill what a neighbour hid),
// resize, enhance. They change an item's frame (turn, scale, tier) or re-measure its parts from the photo.
import * as geo from '../../geo';
import { frameSize } from '../../craft';
import { TIER_PX, type CraftDoc, type ItemDoc, type OpDoc, type Tier } from '../../craft/types';
import { hiddenShare, hullOf, uprightTurn, type Pt } from '../../toolpath';
import { rasterisePaths, woodPiece } from '../../layering';
import type { PixelImage } from '../../colour';
import type { ActionDef, ActionResult } from '../types';

const clone = <T>(x: T): T => structuredClone(x);
const itemsOf = (doc: CraftDoc, ids: string[]) => doc.items.filter((i) => ids.includes(i.id));
/** an item's outline: the cut op of its backmost part (stacked art: the backing) */
const outlineOp = (item: ItemDoc): OpDoc | undefined => [...item.parts].sort((a, b) => a.z - b.z).flatMap((p) => p.ops).find((o) => o.kind === 'cut');
const loopsOf = (op?: OpDoc): Pt[][] => (op ? geo.toLoops(op.geometry, 0.5) : []);
const shoelace = (l: Pt[]) => Math.abs(l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const straighten: ActionDef<{ snapDeg: number }> = {
  id: 'straighten', label: 'Straighten', icon: 'i-solar:ruler-angular-linear', scope: 'item', arity: 'any', kind: 'code',
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

export const interpolate: ActionDef<{ maxAddPct: number; onlyHidden: boolean }> = {
  id: 'interpolate', label: 'Fill in hidden edges', icon: 'i-solar:magic-stick-3-linear', scope: 'item', arity: 'any', kind: 'code',
  hint: 'Rebuild the edges of items a neighbour lay over in the photo (from the visible outline); their holes stay.',
  schema: { type: 'object', properties: { maxAddPct: { type: 'number', minimum: 1, maximum: 60 }, onlyHidden: { type: 'boolean' } } }, defaults: { maxAddPct: 25, onlyHidden: true },
  says: [/\b(complete|restore|recover|rebuild|fill in|interpolate)\b.*\b(hidden|edges?|corners?|missing|covered)\b|\bfill (the )?missing\b/i],
  can: (d, i) => (itemsOf(d, i.targets).some((it) => outlineOp(it)) ? true : 'Nothing with an outline'),
  run(doc, { targets, opts }): ActionResult {
    const filled: string[] = [], skipped: string[] = [], items: ItemDoc[] = [];
    for (const it of itemsOf(doc, targets)) {
      const op = outlineOp(it), loops = loopsOf(op);
      if (!op || !loops.length) continue;
      if (opts.onlyHidden && hiddenShare(loops) <= 0.12) continue;
      // the outer loop gets its hull back; the item's own holes (the other loops) stay as they are
      const outer = loops.reduce((b, l) => (shoelace(l) > shoelace(b) ? l : b));
      const hull = hullOf(outer), added = (shoelace(hull) - shoelace(outer)) / Math.max(1, shoelace(outer)) * 100;
      if (added > opts.maxAddPct) { skipped.push(`${it.name} (+${Math.round(added)}%)`); continue; }
      const keep = op.geometry.paths.filter((_, k) => loops[k] !== outer);
      const geometry = { paths: [...geo.fromLoops([hull]).paths, ...keep] };
      const next = clone(it);
      for (const p of next.parts) p.ops = p.ops.map((o) => (o.id === op.id ? { ...o, geometry } : o));
      items.push(next); filled.push(`${it.name} (+${round1(added)}%)`);
    }
    if (!items.length) return { items: [], summary: skipped.length ? `Didn’t fill ${skipped.join(', ')} — more than ${opts.maxAddPct}% would be guessed` : 'Nothing is hidden' };
    return { items, summary: `Filled in the hidden edges of ${filled.map((f) => f.replace(/ \(.*/, '')).join(', ')}`, detail: `${filled.join(', ')}${skipped.length ? ` · left as photographed: ${skipped.join(', ')}` : ''} · holes kept` };
  }
};

export const resize: ActionDef<{ wMm?: number; hMm?: number; scale?: number; keepAspect: boolean }> = {
  id: 'resize', label: 'Resize', icon: 'i-solar:ruler-cross-pen-linear', scope: 'item', arity: 'any', kind: 'code',
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
  id: 'enhance', label: 'Enhance', icon: 'i-solar:magnifer-zoom-in-linear', scope: 'item', arity: 'any', kind: 'model',
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
