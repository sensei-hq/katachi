// Mirror an item into a new, paired item (design/14 §6): the geometry is mirrored, not flagged.
import { bbox, flip as flipMat, transform, type Pt } from '../../geo';
import type { GroupDoc, ItemDoc, OpDoc, PartDoc } from '../../craft/types';
import type { ActionCtx, ActionDef, ActionResult } from '../types';
import { flipAxis } from './flip';
import { clone, itemOf } from './shared';

export interface MirrorOpts { axis: 'x' | 'y'; pair: boolean }


export const mirror: ActionDef<MirrorOpts> = {
  id: 'mirror', label: 'Mirror', icon: 'i-solar:mirror-left-linear', scope: 'item', arity: 'one', group: 'shape', ask: ['mirror this layer'], kind: 'code',
  hint: 'Make a mirrored copy as a new item, paired to cut together.',
  schema: { type: 'object', properties: { axis: { type: 'string', enum: ['x', 'y'] }, pair: { type: 'boolean' } } },
  defaults: { axis: 'x', pair: true },
  says: [/\bmirror(?:ed)?\b/i],
  can: (doc, { targets, opts }) => {
    if (targets.length !== 1 || !itemOf(doc, targets[0])) return 'Pick one item to mirror';
    if (!flipAxis(opts.axis)) return 'Mirror which way: horizontal or vertical';
    return true;
  },
  run(doc, { targets, opts }, ctx: ActionCtx): ActionResult {
    const it = itemOf(doc, targets[0])!;
    const axis = flipAxis(opts.axis)!;
    const centre: Pt = [it.frame.size[0] / 2, it.frame.size[1] / 2];
    const m = flipMat(axis, centre);
    const parts: PartDoc[] = it.parts.map((p) => ({
      ...clone(p),
      id: ctx.newId(),
      ops: p.ops.map((o): OpDoc => ({ ...clone(o), id: ctx.newId(), geometry: transform(clone(o.geometry), m) })),
    }));
    const copy: ItemDoc = { ...clone(it), id: ctx.newId(), name: `${it.name} (mirrored)`, parts };
    // same-size bbox for the summary (mm, 1 decimal)
    const boxes = parts.flatMap((p) => p.ops.map((o) => bbox(o.geometry))).filter((b): b is NonNullable<typeof b> => !!b);
    const w = boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x)) : 0;
    const h = boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y)) : 0;
    const mm = (px: number) => Math.round((px / it.frame.pxPerMm) * 10) / 10;
    // pair it: join the item's existing pair group, or start one
    let groups: GroupDoc[] | undefined;
    if (opts.pair) {
      const existing = doc.groups.find((g) => g.kind === 'pair' && g.items.includes(it.id));
      groups = existing
        ? [{ ...clone(existing), items: [...existing.items, copy.id] }]
        : [{ id: ctx.newId(), name: `${it.name} pair`, kind: 'pair', items: [it.id, copy.id], rule: 'same-sheet' }];
    }
    return {
      items: [copy], groups,
      order: [...doc.items.map((i) => i.id), copy.id],
      summary: `Mirrored ${it.name} (${mm(w)} × ${mm(h)} mm)`,
      select: [copy.id],
    };
  },
};
