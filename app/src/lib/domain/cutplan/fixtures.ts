// Cut-plan test fixtures: small CraftDoc builders shared by the cutplan specs.
import type { CraftDoc, Frame, GroupDoc, ItemDoc, OpDoc, OpKind, PartDoc } from '../craft/types';
import { fromLoops, type Pt } from '../geo';

/** a closed rect loop in frame px */
export const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export interface OpSpec { kind: OpKind; loops: Pt[][]; id?: string }
export interface PartSpec { name: string; z?: number; material?: string; colour?: string; ops: OpSpec[]; id?: string }
export interface ItemSpec { name: string; parts: PartSpec[]; frame?: Omit<Partial<Frame>, 'fromSource'> & { fromSource?: Partial<Frame['fromSource']> }; qty?: number; id?: string }

const frameOf = (f?: ItemSpec['frame']): Frame => {
  const frame: Frame = {
    tier: f?.tier ?? 'M',
    size: f?.size ?? [100, 100],
    fromSource: { sourceId: 'src', box: { x: 0, y: 0, w: 100, h: 100 }, rotateDeg: 0, ...f?.fromSource },
    pxPerMm: f?.pxPerMm ?? 1,
  };
  if (f?.flipX !== undefined) frame.flipX = f.flipX;
  if (f?.flipY !== undefined) frame.flipY = f.flipY;
  return frame;
};

/** a minimal CraftDoc; ids default to `item0`, `part0-1`, `op0-1-0` (deterministic per call) */
export function craftOf(items: ItemSpec[], opts: { name?: string; groups?: GroupDoc[]; rev?: number; id?: string } = {}): CraftDoc {
  const docs: ItemDoc[] = items.map((it, i) => {
    const itemId = it.id ?? `item${i}`;
    const parts: PartDoc[] = it.parts.map((p, j) => {
      const partId = p.id ?? `part${i}-${j}`;
      const ops: OpDoc[] = p.ops.map((o, k) => ({ id: o.id ?? `op${i}-${j}-${k}`, kind: o.kind, geometry: fromLoops(o.loops) }));
      return { id: partId, name: p.name, z: p.z ?? j, material: p.material ?? 'cardstock', colour: p.colour ?? '#ffffff', ops };
    });
    return { id: itemId, name: it.name, build: 'single', frame: frameOf(it.frame), parts, joins: [], qty: it.qty };
  });
  return {
    v: 2, id: opts.id ?? 'craft', name: opts.name ?? 'Test craft', kind: 'items',
    createdAt: 0, updatedAt: 0, rev: opts.rev ?? 1,
    items: docs, groups: opts.groups ?? [], sources: [], history: { done: [], undone: [] },
  };
}
