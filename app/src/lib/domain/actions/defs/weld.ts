// Weld a layer's cuts into one outline (design/14 §6): no internal cut lines.
import { toLoops, weld as geoWeld } from '../../geo';
import type { PartDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';
import { clone, partIn } from './shared';


export const weld: ActionDef<Record<string, never>> = {
  id: 'weld', label: 'Weld', icon: 'i-solar:union-linear', scope: 'part', arity: 'one', kind: 'code',
  hint: 'Join a layer’s touching pieces so they cut as one shape, with no internal cut lines.',
  schema: { type: 'object', properties: {} },
  defaults: {},
  says: [/\bweld\b/i],
  can: (doc, { targets }) => {
    const found = targets.length === 1 ? partIn(doc, targets[0]) : undefined;
    if (!found) return 'Pick one layer to weld';
    if (!found.part.ops.some((o) => o.kind === 'cut')) return 'No cut outline to weld';
    return true;
  },
  run(doc, { targets }): ActionResult {
    const { part, item } = partIn(doc, targets[0])!;
    let n0 = 0, n1 = 0;
    const ops = part.ops.map((o) => {
      if (o.kind !== 'cut') return o;
      n0 += toLoops(o.geometry).length;
      const geometry = geoWeld(clone(o.geometry));
      n1 += toLoops(geometry).length;
      return { ...clone(o), geometry };
    });
    const next: PartDoc = { ...clone(part), ops };
    return {
      items: [{ ...clone(item), parts: item.parts.map((p) => (p.id === part.id ? next : p)) }],
      summary: `Welded ${n0} loops into ${n1} outline${n1 === 1 ? '' : 's'}`,
    };
  },
};
