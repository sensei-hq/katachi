// Action-def test fixtures: CraftDoc builders with frame-px shapes (pxPerMm = 4).
import type { ActionCtx } from '../types';
import type { CraftDoc, Frame, GroupDoc, ItemDoc, OpDoc, OpKind, PartDoc } from '../../craft/types';
import { fromLoops, type Pt } from '../../geo';

/** a closed rect loop in frame px */
export const sq = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
/** an O: outer 40x40, hole, and an island that falls out */
export const oShape = (): Pt[][] => [sq(0, 0, 40), sq(8, 8, 24), sq(16, 16, 8)];
/** a ring: outer with a hole */
export const ring = (): Pt[][] => [sq(0, 0, 40), sq(10, 10, 20)];

export interface OpSpec { kind: OpKind; loops: Pt[][]; id?: string }
export interface PartSpec { name: string; z?: number; material?: string; colour?: string; ops: OpSpec[]; id?: string }
export interface ItemSpec {
  name: string; parts: PartSpec[]; id?: string; qty?: number;
  frame?: Omit<Partial<Frame>, 'fromSource'> & { fromSource?: Partial<Frame['fromSource']> };
}

/** a minimal CraftDoc; ids default to `item0`, `part0-1`, `op0-1-0` (deterministic per call) */
export function craftOf(o: { items: ItemSpec[]; groups?: GroupDoc[]; name?: string; rev?: number; id?: string }): CraftDoc {
  const docs: ItemDoc[] = o.items.map((it, i) => {
    const itemId = it.id ?? `item${i}`;
    const f = it.frame;
    const frame: Frame = {
      tier: f?.tier ?? 'M',
      size: f?.size ?? [100, 100],
      fromSource: { sourceId: 'src', box: { x: 0, y: 0, w: 100, h: 100 }, rotateDeg: 0, ...f?.fromSource },
      pxPerMm: f?.pxPerMm ?? 4,
    };
    if (f?.flipX !== undefined) frame.flipX = f.flipX;
    if (f?.flipY !== undefined) frame.flipY = f.flipY;
    const parts: PartDoc[] = it.parts.map((p, j) => {
      const ops: OpDoc[] = p.ops.map((x, k) => ({ id: x.id ?? `op${i}-${j}-${k}`, kind: x.kind, geometry: fromLoops(x.loops) }));
      return { id: p.id ?? `part${i}-${j}`, name: p.name, z: p.z ?? j, material: p.material ?? 'cardstock', colour: p.colour ?? '#ffffff', ops };
    });
    return { id: itemId, name: it.name, build: 'single', frame, parts, joins: [], qty: it.qty };
  });
  return {
    v: 2, id: o.id ?? 'craft', name: o.name ?? 'Test craft', kind: 'items',
    createdAt: 0, updatedAt: 0, rev: o.rev ?? 1,
    items: docs, groups: o.groups ?? [], sources: [], history: { done: [], undone: [] },
  };
}

/** a test ctx: deterministic ids, no pixels */
export function testCtx(prefix = 'n'): ActionCtx & { count(): number } {
  let n = 0;
  return { newId: () => `${prefix}${++n}`, pixels: async () => null, count: () => n };
}
