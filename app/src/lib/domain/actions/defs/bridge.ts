// Bridge a layer's floating islands to their holes (design/14 §6): nothing falls out.
import { bridge as geoBridge, islands as geoIslands } from '../../geo';
import type { PartDoc } from '../../craft/types';
import type { ActionDef, ActionResult } from '../types';
import { clone, partIn } from './shared';

export interface BridgeOpts { widthMm: number; per: number }

const islandCount = (part: PartDoc): number =>
  part.ops.filter((o) => o.kind === 'cut').reduce((n, o) => n + geoIslands(o.geometry).length, 0);

export const bridge: ActionDef<BridgeOpts> = {
  id: 'bridge', label: 'Bridge', icon: 'i-solar:link-circle-linear', scope: 'part', arity: 'one', kind: 'code',
  hint: 'Add small tabs across a hole so a floating island stays attached instead of falling out.',
  schema: {
    type: 'object',
    properties: { widthMm: { type: 'number', minimum: 0 }, per: { type: 'integer', minimum: 1 } },
  },
  defaults: { widthMm: 1, per: 2 },
  says: [/\bbridge\b/i],
  can: (doc, { targets, opts }) => {
    const found = targets.length === 1 ? partIn(doc, targets[0]) : undefined;
    if (!found) return 'Pick one layer to bridge';
    if (!(Number(opts.widthMm) > 0)) return 'How wide a tab';
    if (!Number.isInteger(Number(opts.per)) || Number(opts.per) < 1) return 'How many tabs per island';
    if (!found.part.ops.some((o) => o.kind === 'cut')) return 'No cut outline to bridge';
    if (!islandCount(found.part)) return 'This layer has no islands to bridge';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const { part, item } = partIn(doc, targets[0])!;
    const width = Number(opts.widthMm) * item.frame.pxPerMm;
    const n0 = islandCount(part);
    const ops = part.ops.map((o) => (o.kind === 'cut' ? { ...clone(o), geometry: geoBridge(clone(o.geometry), { width, per: Number(opts.per) }) } : o));
    const n1 = ops.filter((o) => o.kind === 'cut').reduce((n, o) => n + geoIslands(o.geometry).length, 0);
    const fixed = n0 - n1;
    const next: PartDoc = { ...clone(part), ops };
    return {
      items: [{ ...clone(item), parts: item.parts.map((p) => (p.id === part.id ? next : p)) }],
      summary: `${fixed} island${fixed === 1 ? '' : 's'} bridged — nothing falls out`,
    };
  },
};
