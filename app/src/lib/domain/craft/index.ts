// The craft tree's helpers (design/15 §1): the id index, the invariants, and tier picking. Pure.
import type { CraftDoc, GroupDoc, Id, ItemDoc, OpDoc, PartDoc, Tier } from './types';
import { TIER_PX } from './types';
export * from './types';

export type Node =
  | { kind: 'item'; node: ItemDoc }
  | { kind: 'part'; node: PartDoc; item: ItemDoc }
  | { kind: 'op'; node: OpDoc; part: PartDoc; item: ItemDoc }
  | { kind: 'group'; node: GroupDoc };

/** every node by id (built once per change; lookups, the action resolver and validation use it) */
export function indexCraft(doc: CraftDoc): Map<Id, Node> {
  const m = new Map<Id, Node>();
  for (const item of doc.items) {
    m.set(item.id, { kind: 'item', node: item });
    for (const part of item.parts) {
      m.set(part.id, { kind: 'part', node: part, item });
      for (const op of part.ops) m.set(op.id, { kind: 'op', node: op, part, item });
    }
  }
  for (const g of doc.groups) m.set(g.id, { kind: 'group', node: g });
  return m;
}

/** what is wrong with a doc (empty = valid): duplicate ids, links to nothing, joins across items */
export function validate(doc: CraftDoc): string[] {
  const errs: string[] = [], seen = new Set<Id>();
  const see = (id: Id, what: string) => { if (seen.has(id)) errs.push(`duplicate id ${id} (${what})`); seen.add(id); };
  for (const item of doc.items) {
    see(item.id, 'item');
    const parts = new Set(item.parts.map((p) => p.id));
    for (const part of item.parts) { see(part.id, 'part'); for (const op of part.ops) see(op.id, 'op'); }
    for (const j of item.joins) { see(j.id, 'join'); if (!parts.has(j.a) || !parts.has(j.b)) errs.push(`join ${j.id} links a part outside ${item.name}`); }
  }
  const items = new Set(doc.items.map((i) => i.id));
  for (const g of doc.groups) { see(g.id, 'group'); for (const i of g.items) if (!items.has(i)) errs.push(`group ${g.name} lists a missing item ${i}`); }
  return errs;
}

/** drop the links to anything removed (run after every change, so no link points at nothing) */
export function prune(doc: CraftDoc): CraftDoc {
  const items = new Set(doc.items.map((i) => i.id));
  const groups = doc.groups.map((g) => ({ ...g, items: g.items.filter((i) => items.has(i)) })).filter((g) => g.items.length > (g.kind === 'pair' ? 1 : 0));
  const out = doc.items.map((item) => {
    const parts = new Set(item.parts.map((p) => p.id));
    const joins = item.joins.filter((j) => parts.has(j.a) && parts.has(j.b));
    return joins.length === item.joins.length ? item : { ...item, joins };
  });
  return { ...doc, items: out, groups };
}

/** the tier an item needs: from its real size (the finer the item, the more px per mm it gets) */
export function tierFor(longMm: number): Tier {
  return longMm <= 60 ? 'S' : longMm <= 200 ? 'M' : longMm <= 400 ? 'L' : 'XL';
}
/** a frame's px size: the long edge is the tier, the short edge keeps the item's own proportions */
export function frameSize(tier: Tier, wMm: number, hMm: number): [number, number] {
  const long = TIER_PX[tier], r = wMm > 0 && hMm > 0 ? Math.min(wMm, hMm) / Math.max(wMm, hMm) : 1;
  const short = Math.max(1, Math.round(long * r));
  return wMm >= hMm ? [long, short] : [short, long];
}

/** the parts as the screen lists its "layers": items in order, each item's parts back to front */
export function layersOf(doc: CraftDoc): { item: ItemDoc; part: PartDoc }[] {
  return doc.items.flatMap((item) => [...item.parts].sort((a, b) => a.z - b.z).map((part) => ({ item, part })));
}

/** one row of the screen's layer list: a part, or (separate items) one of its engravings as its own row */
export interface Row { n: number; item: ItemDoc; part: PartDoc; op?: OpDoc; name: string; role: 'cut' | 'engrave'; shows: number }
/** the layer list as the screen numbers it ("layer 3"): items in order, parts back to front; a separate item's
 *  part is "<name> · cut" with its engravings as their own rows after it */
export function rowsOf(doc: CraftDoc): Row[] {
  const rows: Omit<Row, 'n'>[] = [], separate = doc.kind === 'items';
  for (const item of doc.items) for (const part of [...item.parts].sort((a, b) => a.z - b.z)) {
    const cut = part.ops.find((o) => o.kind === 'cut'), engr = part.ops.filter((o) => o.kind !== 'cut');
    if (separate) {
      if (cut) rows.push({ item, part, name: `${part.name} · cut`, role: 'cut', shows: part.measured?.visiblePct ?? 0 });
      for (const op of engr) rows.push({ item, part, op, name: `${part.name} · engraving`, role: 'engrave', shows: op.shows ?? part.measured?.visiblePct ?? 0 });
    } else rows.push({ item, part, name: part.name, role: cut ? 'cut' : 'engrave', shows: part.measured?.visiblePct ?? 0 });
  }
  return rows.map((r, i) => ({ ...r, n: i + 1 }));
}
