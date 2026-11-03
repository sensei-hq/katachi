// Simplify a layer (design/14 §6): fewer points, same shape (helps engraving files).
import { simplify as geoSimplify, type Geometry } from '../../geo';
import type { PartDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';
import { clone, partIn } from './shared';

export interface SimplifyOpts { toleranceMm: number }

const points = (g: Geometry): number => g.paths.reduce((n, p) => n + 1 + p.segs.length, 0);

export const simplify: ActionDef<SimplifyOpts> = {
  id: 'simplify', label: 'Simplify', icon: 'i-solar:filter-linear', scope: 'part', arity: 'one', kind: 'code',
  hint: 'Drop needless points from a layer’s outlines (same shape, smaller engraving files).',
  schema: { type: 'object', properties: { toleranceMm: { type: 'number', minimum: 0 } } },
  defaults: { toleranceMm: 0.1 },
  says: [/\bsimplify\b/i],
  can: (doc, { targets, opts }) => {
    if (targets.length !== 1 || !partIn(doc, targets[0])) return 'Pick one layer to simplify';
    const t = Number(opts.toleranceMm);
    if (!Number.isFinite(t) || t < 0) return 'Tolerance runs 0 mm and up';
    if (!partIn(doc, targets[0])!.part.ops.length) return 'Nothing to simplify';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const { part, item } = partIn(doc, targets[0])!;
    const tol = Number(opts.toleranceMm) * item.frame.pxPerMm;
    const ops = part.ops.map((o) => ({ ...clone(o), geometry: geoSimplify(clone(o.geometry), tol) }));
    const n0 = part.ops.reduce((n, o) => n + points(o.geometry), 0);
    const n1 = ops.reduce((n, o) => n + points(o.geometry), 0);
    const next: PartDoc = { ...clone(part), ops };
    return {
      items: [{ ...clone(item), parts: item.parts.map((p) => (p.id === part.id ? next : p)) }],
      summary: `Simplified ${part.name}: ${n0} → ${n1} points`,
    };
  },
};
