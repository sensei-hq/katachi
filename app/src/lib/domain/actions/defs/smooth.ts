// Smooth a layer's outlines into clean Béziers (design/14 §6): strength in mm, corners kept.
import { hausdorff, smooth as geoSmooth } from '../../geo';
import type { CraftDoc, Id, ItemDoc, PartDoc } from '../../craft/types';
import { indexCraft } from '../../craft';
import type { ActionDef, ActionResult } from '../types';

export interface SmoothOpts { strength: number; passes: number; keepCorners: boolean; cornerDeg: number }

/** strength 1–5 → fitting tolerance in mm */
export const TOL_MM = [0.05, 0.1, 0.2, 0.35, 0.6];

const clone = <T>(x: T): T => structuredClone(x);
const partIn = (doc: CraftDoc, id: Id): { part: PartDoc; item: ItemDoc } | undefined => {
  const n = indexCraft(doc).get(id);
  return n?.kind === 'part' ? { part: n.node, item: n.item } : undefined;
};

export const smooth: ActionDef<SmoothOpts> = {
  id: 'smooth', label: 'Smooth', icon: 'i-solar:pen-nib-linear', scope: 'part', arity: 'one', kind: 'code',
  hint: 'Smooth a layer’s jagged outlines into clean curves, keeping its sharp corners.',
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
    if (targets.length !== 1 || !partIn(doc, targets[0])) return 'Pick one layer to smooth';
    const s = Number(opts.strength), p = Number(opts.passes), c = Number(opts.cornerDeg);
    if (!Number.isInteger(s) || s < 1 || s > 5) return 'Strength runs 1 to 5';
    if (!Number.isInteger(p) || p < 1 || p > 3) return 'Passes run 1 to 3';
    if (!Number.isFinite(c) || c < 0 || c > 180) return 'Corner angle runs 0 to 180°';
    if (!partIn(doc, targets[0])!.part.ops.length) return 'Nothing to smooth';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const { part, item } = partIn(doc, targets[0])!;
    const tolPx = TOL_MM[Number(opts.strength) - 1] * item.frame.pxPerMm;
    const ops = part.ops.map((o) => ({ ...clone(o), geometry: geoSmooth(clone(o.geometry), { tol: tolPx, passes: Number(opts.passes), keepCorners: !!opts.keepCorners, cornerDeg: Number(opts.cornerDeg) }) }));
    const worst = Math.max(...ops.map((o, i) => hausdorff(o.geometry, part.ops[i].geometry))) / item.frame.pxPerMm;
    const next: PartDoc = { ...clone(part), ops };
    return {
      items: [{ ...clone(item), parts: item.parts.map((p) => (p.id === part.id ? next : p)) }],
      summary: `Smoothed ${part.name} (strength ${opts.strength}, ${opts.passes} pass${Number(opts.passes) > 1 ? 'es' : ''})`,
      detail: `within ${worst.toFixed(2)} mm of your shape`,
    };
  },
};
