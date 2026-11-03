// Space items evenly along x (design/14 §6): order kept, the first stays put.
import type { ItemDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';
import { clone, itemOf } from './shared';

export interface DistributeOpts { gapMm: number }


export const distribute: ActionDef<DistributeOpts> = {
  id: 'distribute', label: 'Distribute', icon: 'i-solar:slider-horizontal-linear', scope: 'item', arity: 'many', kind: 'code',
  hint: 'Space items evenly with a fixed gap between them.',
  schema: { type: 'object', properties: { gapMm: { type: 'number', minimum: 0 } } },
  defaults: { gapMm: 5 },
  says: [/\b(?<gapMm>\d+(?:\.\d+)?)\s*mm\b.*\bgaps?\b/i, /\b(?:distribute|space\s+(?:them\s+)?(?:out|evenly)|even\s+spacing)\b/i],
  can: (doc, { targets, opts }) => {
    if (targets.length < 2) return 'Pick two or more to space out';
    if (targets.some((id) => !itemOf(doc, id))) return 'Pick items to space out';
    if (!Number.isFinite(Number(opts.gapMm)) || Number(opts.gapMm) < 0) return 'Gap runs 0 mm and up';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const gapMm = Number(opts.gapMm);
    const ordered = targets.map((id) => itemOf(doc, id)!).sort((a, b) => a.frame.fromSource.box.x - b.frame.fromSource.box.x);
    // mm → frame px → photo units, once in the anchor's frame, so every gap is even
    const anchor = ordered[0].frame;
    const gapPhoto = gapMm * anchor.pxPerMm * (anchor.fromSource.box.w / anchor.size[0]);
    const items: ItemDoc[] = [];
    let edge = 0;
    for (const [i, it] of ordered.entries()) {
      const x = i === 0 ? it.frame.fromSource.box.x : edge + gapPhoto;
      edge = x + it.frame.fromSource.box.w;
      const next = clone(it);
      next.frame.fromSource.box = { ...next.frame.fromSource.box, x };
      items.push(next);
    }
    return { items, summary: `Spaced ${ordered.length} with ${gapMm} mm gaps` };
  },
};
