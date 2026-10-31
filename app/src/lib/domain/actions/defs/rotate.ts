// Rotate an item's frame by an angle (design/14 §6): straighten is the automatic version.
import type { CraftDoc, Id, ItemDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';

export interface RotateOpts { deg: number; snap: boolean }

const clone = <T>(x: T): T => structuredClone(x);
const itemOf = (doc: CraftDoc, id: Id): ItemDoc | undefined => doc.items.find((i) => i.id === id);

/** normalise to (−180, 180] */
export function normDeg(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d <= -180) d += 360;
  return d;
}

export const rotate: ActionDef<RotateOpts> = {
  id: 'rotate', label: 'Rotate', icon: 'i-solar:restart-linear', scope: 'item', arity: 'one', kind: 'code',
  hint: 'Turn an item by an angle (straighten is the automatic version).',
  schema: { type: 'object', properties: { deg: { type: 'number' }, snap: { type: 'boolean' } } },
  defaults: { deg: 90, snap: true },
  says: [/\b(?:rotate|turn(?!\s+over))\b(?:[^.\n]*?\b(?<deg>\d+(?:\.\d+)?)\s*(?:degrees?|°)?)?/i],
  can: (doc, { targets, opts }) => {
    if (targets.length !== 1 || !itemOf(doc, targets[0])) return 'Pick one item to turn';
    if (!Number.isFinite(Number(opts.deg))) return 'Turn it how far?';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const it = itemOf(doc, targets[0])!;
    const next: ItemDoc = { ...clone(it), frame: { ...clone(it.frame), fromSource: { ...clone(it.frame.fromSource) } } };
    let d = normDeg(next.frame.fromSource.rotateDeg + Number(opts.deg));
    if (opts.snap) d = Math.round(d * 2) / 2;
    next.frame.fromSource.rotateDeg = d;
    return { items: [next], summary: `Turned ${it.name} ${Number(opts.deg)}° (now ${d}°)` };
  },
};
