// Offset an outline by mm (design/14 §6): grow it in place, or add a border behind it.
import { offset as geoOffset, union as geoUnion } from '../../geo';
import type { PartDoc } from '../../craft/types';
import type { ActionCtx, ActionDef, ActionResult } from '../types';
import { clone, partIn } from './shared';

export interface OffsetOpts { mm: number; as: 'grow' | 'new-part'; material?: string; colour?: string }


export const offset: ActionDef<OffsetOpts> = {
  id: 'offset', label: 'Offset', icon: 'i-solar:maximize-linear', scope: 'part', arity: 'one', group: 'shape', ask: ['2 mm offset'], kind: 'code',
  hint: 'Grow or shrink an outline by mm, or add a border behind it.',
  schema: {
    type: 'object',
    properties: {
      mm: { type: 'number' },
      as: { type: 'string', enum: ['grow', 'new-part'] },
      material: { type: 'string' },
      colour: { type: 'string' },
    },
  },
  defaults: { mm: 2, as: 'grow' },
  says: [/\b(?<mm>\d+(?:\.\d+)?)\s*mm\s+(?:\w+\s+)?border\b/i, /\b(?<mm>\d+(?:\.\d+)?)\s*mm\b.*\b(?:offset|grow)\b/i, /\b(offset|grow|shrink)\b/i],
  can: (doc, { targets, opts }) => {
    const found = targets.length === 1 ? partIn(doc, targets[0]) : undefined;
    if (!found) return 'Pick one layer to offset';
    if (!Number.isFinite(Number(opts.mm))) return 'Offset it by how much?';
    if (opts.as !== 'grow' && opts.as !== 'new-part') return 'Grow it, or add it as a new border';
    if (!found.part.ops.some((o) => o.kind === 'cut')) return 'No cut outline to offset';
    return true;
  },
  run(doc, { targets, opts }, ctx: ActionCtx): ActionResult {
    const { part, item } = partIn(doc, targets[0])!;
    const d = Number(opts.mm) * item.frame.pxPerMm;
    if (opts.as === 'new-part') {
      const cuts = part.ops.filter((o) => o.kind === 'cut');
      const joined = cuts.slice(1).reduce((acc, o) => geoUnion(acc, clone(o.geometry)), clone(cuts[0].geometry));
      const border: PartDoc = {
        id: ctx.newId(), name: 'Border', z: Math.min(...item.parts.map((p) => p.z)) - 1,
        material: opts.material ?? part.material, colour: opts.colour ?? part.colour,
        ops: [{ id: ctx.newId(), kind: 'cut', geometry: geoOffset(joined, d) }],
      };
      return {
        items: [{ ...clone(item), parts: [...item.parts.map((p) => clone(p)), border] }],
        summary: `Added a ${opts.mm} mm border behind ${part.name}`,
        select: [border.id],
      };
    }
    const ops = part.ops.map((o) => (o.kind === 'cut' ? { ...clone(o), geometry: geoOffset(clone(o.geometry), d) } : o));
    const next: PartDoc = { ...clone(part), ops };
    const grew = Number(opts.mm) >= 0;
    return {
      items: [{ ...clone(item), parts: item.parts.map((p) => (p.id === part.id ? next : p)) }],
      summary: `${grew ? 'Grew' : 'Shrank'} ${part.name} by ${Math.abs(Number(opts.mm))} mm`,
    };
  },
};
