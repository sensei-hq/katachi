// Line items or layers up (design/14 §6): boxes move, first (or the backing) stays.
import { bbox, transform, translate, type Box, type Geometry } from '../../geo';
import type { CraftDoc, Id, ItemDoc, PartDoc } from '../../craft/types';
import { indexCraft } from '../../craft';
import type { ActionDef, ActionResult } from '../types';

export type AlignTo = 'left' | 'centre-x' | 'right' | 'top' | 'centre-y' | 'bottom' | 'centre';
export interface AlignOpts { to: AlignTo; relativeTo: 'first' | 'backing' }

const TO_WORDS: Record<string, AlignTo> = {
  left: 'left', right: 'right', top: 'top', bottom: 'bottom',
  centre: 'centre', center: 'centre', middle: 'centre', 'centre-x': 'centre-x', 'centre-y': 'centre-y',
};
/** chat words → edge (says captures centre/center/middle; the schema constrains to the seven) */
export function alignTo(to: string): AlignTo | null { return TO_WORDS[to] ?? null; }

const clone = <T>(x: T): T => structuredClone(x);

type Target = { kind: 'item'; item: ItemDoc } | { kind: 'part'; part: PartDoc; item: ItemDoc };
function targetsOf(doc: CraftDoc, ids: Id[]): (Target | undefined)[] {
  const ix = indexCraft(doc);
  return ids.map((id) => {
    const n = ix.get(id);
    if (!n) return undefined;
    if (n.kind === 'item') return { kind: 'item', item: n.node };
    if (n.kind === 'part') return { kind: 'part', part: n.node, item: n.item };
    return undefined;
  });
}

function partBox(part: PartDoc): Box | null {
  const boxes = part.ops.map((o) => bbox(o.geometry)).filter((b): b is NonNullable<typeof b> => !!b);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** move a box's min corner onto the reference edge; null x/y = that axis stays */
function edge(ref: Box, box: Box, to: AlignTo): [number | null, number | null] {
  switch (to) {
    case 'left': return [ref.x, null];
    case 'centre-x': return [ref.x + ref.w / 2 - box.w / 2, null];
    case 'right': return [ref.x + ref.w - box.w, null];
    case 'top': return [null, ref.y];
    case 'centre-y': return [null, ref.y + ref.h / 2 - box.h / 2];
    case 'bottom': return [null, ref.y + ref.h - box.h];
    case 'centre': return [ref.x + ref.w / 2 - box.w / 2, ref.y + ref.h / 2 - box.h / 2];
  }
}

const TO_WORD: Record<AlignTo, string> = { left: 'left', 'centre-x': 'the horizontal centre', right: 'right', top: 'top', 'centre-y': 'the vertical centre', bottom: 'bottom', centre: 'the centre' };

export const align: ActionDef<AlignOpts> = {
  id: 'align', label: 'Align', icon: 'i-solar:align-left-linear', scope: 'item', arity: 'many', kind: 'code',
  hint: 'Line items or layers up on an edge or the centre.',
  schema: {
    type: 'object',
    properties: {
      to: { type: 'string', enum: ['left', 'centre-x', 'right', 'top', 'centre-y', 'bottom', 'centre'] },
      relativeTo: { type: 'string', enum: ['first', 'backing'] },
    },
  },
  defaults: { to: 'left', relativeTo: 'first' },
  says: [/\balign\b[^.\n]*?\b(?<to>left|right|top|bottom|centre|center|middle)\b/i, /\balign\b/i],
  can: (doc, { targets, opts }) => {
    const ts = targetsOf(doc, targets);
    if (!ts.length || ts.some((t) => !t)) return 'Pick items or layers to line up';
    const kinds = new Set(ts.map((t) => t!.kind));
    if (kinds.size > 1) return 'Pick items or layers, not both';
    if (!alignTo(opts.to)) return 'Line up on which edge';
    if (opts.relativeTo !== 'first' && opts.relativeTo !== 'backing') return 'Line up to the first or the backing';
    if (ts.length < 2 && opts.relativeTo === 'first') return 'Pick two or more to line up';
    if (ts[0]!.kind === 'part' && new Set(ts.map((t) => (t as { item: ItemDoc }).item.id)).size > 1) return 'Pick layers from one item';
    return true;
  },
  run(doc, { targets, opts }): ActionResult {
    const ts = targetsOf(doc, targets) as Target[];
    const to = alignTo(opts.to)!;
    const boxOf = (t: Target): Box => (t.kind === 'item' ? { ...t.item.frame.fromSource.box } : partBox(t.part)!);
    const refBox = (t: Target): Box => {
      if (opts.relativeTo === 'first') return boxOf(ts[0]);
      if (t.kind === 'part') {
        const backing = [...t.item.parts].sort((a, b) => a.z - b.z)[0];
        return partBox(backing)!;
      }
      return boxOf(ts[0]); // items have no backing: the first is the reference
    };
    let moved = 0;
    const changed = new Map<Id, ItemDoc>();
    const edit = (item: ItemDoc): ItemDoc => {
      if (!changed.has(item.id)) changed.set(item.id, clone(item));
      return changed.get(item.id)!;
    };
    for (const t of ts.slice(opts.relativeTo === 'first' ? 1 : 0)) {
      const box = boxOf(t), ref = refBox(t);
      const [nx, ny] = edge(ref, box, to);
      const dx = (nx ?? box.x) - box.x, dy = (ny ?? box.y) - box.y;
      if (!dx && !dy) continue;
      moved++;
      if (t.kind === 'item') {
        const next = edit(t.item);
        next.frame.fromSource.box = { ...next.frame.fromSource.box, x: box.x + dx, y: box.y + dy };
      } else {
        const next = edit(t.item);
        const m = translate(dx, dy);
        next.parts = next.parts.map((p) => (p.id !== t.part.id ? p : {
          ...p, ops: p.ops.map((o) => ({ ...o, geometry: transform(o.geometry, m) as Geometry })),
        }));
      }
    }
    const word = TO_WORD[to];
    return {
      items: [...changed.values()],
      summary: moved ? `Lined up ${moved + 1} on ${word}` : 'Already lined up',
    };
  },
};
