// Smooth a layer's outlines into clean Béziers (design/14 §6): strength in mm, corners kept.
import { bbox, hausdorff, smooth as geoSmooth } from '../../geo';
import type { Id, ItemDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';
import { breathe, clone, partIn } from './shared';

export interface SmoothOpts { strength: number; passes: number; keepCorners: boolean; cornerDeg: number }

/** how finely "within … mm" is measured: 1/100 of the layer's size (a dense layer measured finer takes seconds) */
const measureStep = (g: Parameters<typeof bbox>[0]) => { const b = bbox(g); return b ? Math.max(b.w, b.h) / 100 : 1; };
/** strength 1–5 → fitting tolerance in mm */
export const TOL_MM = [0.05, 0.1, 0.2, 0.35, 0.6];


export const smooth: ActionDef<SmoothOpts> = {
  id: 'smooth', label: 'Smooth', icon: 'i-solar:pen-new-round-linear', scope: 'part', arity: 'any', group: 'shape', ask: ['smooth every layer'], kind: 'code',
  hint: 'Smooth the jagged outlines of one layer, several, or all of them into clean curves, keeping sharp corners.',
  schema: {
    type: 'object',
    properties: {
      strength: { type: 'integer', minimum: 1, maximum: 5 },
      passes: { type: 'integer', minimum: 1, maximum: 3 },
      keepCorners: { type: 'boolean' },
      cornerDeg: { type: 'number', minimum: 0, maximum: 180 },
    },
  },
  defaults: { strength: 2, passes: 1, keepCorners: true, cornerDeg: 35 },
  says: [/\bsmooth(?:en)?\b/i],
  can: (doc, { targets, opts }) => {
    if (!targets.length || !targets.some((t) => partIn(doc, t))) return 'Pick a layer to smooth';
    const s = Number(opts.strength), p = Number(opts.passes), c = Number(opts.cornerDeg);
    if (!Number.isInteger(s) || s < 1 || s > 5) return 'Strength runs 1 to 5';
    if (!Number.isInteger(p) || p < 1 || p > 3) return 'Passes run 1 to 3';
    if (!Number.isFinite(c) || c < 0 || c > 180) return 'Corner angle runs 0 to 180°';
    if (!targets.some((t) => partIn(doc, t)?.part.ops.length)) return 'Nothing to smooth';
    return true;
  },
  async run(doc, { targets, opts }): Promise<ActionResult> {
    // one layer, several or all: each smoothed on its own, all in one step (one undo)
    const items = new Map<Id, ItemDoc>(), names: string[] = [];
    let worst = 0;
    for (const [k, id] of targets.entries()) {
      const found = partIn(doc, id); if (!found || !found.part.ops.length) continue;
      if (k) await breathe();
      const { part } = found, item = items.get(found.item.id) ?? clone(found.item);
      const tolPx = TOL_MM[Number(opts.strength) - 1] * item.frame.pxPerMm;
      const ops = part.ops.map((o) => {
        const g = geoSmooth(clone(o.geometry), { tol: tolPx, passes: Number(opts.passes), keepCorners: !!opts.keepCorners, cornerDeg: Number(opts.cornerDeg) });
        // never lose an outline: a loop the fit could not follow keeps its traced shape
        const whole = g.paths.length === o.geometry.paths.length && g.paths.every((p) => p.segs.length);
        return { ...clone(o), geometry: whole ? g : clone(o.geometry) };
      });
      worst = Math.max(worst, ...ops.map((o, i) => hausdorff(o.geometry, part.ops[i].geometry, measureStep(part.ops[i].geometry)) / item.frame.pxPerMm));
      items.set(item.id, { ...item, parts: item.parts.map((p) => (p.id === part.id ? { ...clone(part), ops } : p)) });
      names.push(part.name);
    }
    const how = `strength ${opts.strength}, ${opts.passes} pass${Number(opts.passes) > 1 ? 'es' : ''}`;
    return {
      items: [...items.values()],
      summary: names.length === 1 ? `Smoothed ${names[0]} (${how})` : `Smoothed ${names.length} layers (${how})`,
      detail: `within ${worst.toFixed(2)} mm of your shape`,
    };
  },
};
