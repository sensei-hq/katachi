// Undo / redo data (design/14 §5): only what an action changed, item by item, so a long history stays small.
import type { CraftDoc, EntryDoc, GroupDoc, Id, ItemDoc, Patch } from '../craft/types';
import type { ActionResult } from './types';

/** apply an action's result to a doc (pure): changed items replaced or added, removed ones dropped, order kept */
export function applyResult(doc: CraftDoc, r: ActionResult): CraftDoc {
  const changed = new Map(r.items.map((i) => [i.id, i])), removed = new Set(r.removed ?? []);
  let items = doc.items.filter((i) => !removed.has(i.id)).map((i) => changed.get(i.id) ?? i);
  for (const i of r.items) if (!doc.items.some((x) => x.id === i.id)) items.push(i);
  if (r.order) items = r.order.map((id) => items.find((i) => i.id === id)).filter((i): i is ItemDoc => Boolean(i));
  const gChanged = new Map((r.groups ?? []).map((g) => [g.id, g])), gRemoved = new Set(r.removedGroups ?? []);
  const groups = doc.groups.filter((g) => !gRemoved.has(g.id)).map((g) => gChanged.get(g.id) ?? g);
  for (const g of r.groups ?? []) if (!doc.groups.some((x) => x.id === g.id)) groups.push(g);
  return { ...doc, items, groups };
}
/** what changed between two docs, as the before / after patches of one history entry */
export function diff(before: CraftDoc, after: CraftDoc): { before: Patch; after: Patch } {
  const b: Patch = { items: {}, groups: {} }, a: Patch = { items: {}, groups: {} };
  const bi = new Map(before.items.map((i) => [i.id, i])), ai = new Map(after.items.map((i) => [i.id, i]));
  for (const id of new Set([...bi.keys(), ...ai.keys()])) {
    const x = bi.get(id) ?? null, y = ai.get(id) ?? null;
    if (x !== y && JSON.stringify(x) !== JSON.stringify(y)) { b.items[id] = x; a.items[id] = y; }
  }
  const bg = new Map(before.groups.map((g) => [g.id, g])), ag = new Map(after.groups.map((g) => [g.id, g]));
  for (const id of new Set([...bg.keys(), ...ag.keys()])) {
    const x = bg.get(id) ?? null, y = ag.get(id) ?? null;
    if (JSON.stringify(x) !== JSON.stringify(y)) { b.groups![id] = x; a.groups![id] = y; }
  }
  const bo = before.items.map((i) => i.id), ao = after.items.map((i) => i.id);
  if (bo.join() !== ao.join()) { b.order = bo; a.order = ao; }
  return { before: b, after: a };
}
/** put a patch onto a doc (undo puts `before`, redo puts `after`) */
export function applyPatch(doc: CraftDoc, p: Patch): CraftDoc {
  let items = doc.items.map((i) => (i.id in p.items ? p.items[i.id] : i)).filter((i): i is ItemDoc => Boolean(i));
  for (const [id, i] of Object.entries(p.items)) if (i && !doc.items.some((x) => x.id === id)) items.push(i);
  if (p.order) items = p.order.map((id) => items.find((i) => i.id === id)).filter((i): i is ItemDoc => Boolean(i));
  const groups = doc.groups.map((g) => (p.groups && g.id in p.groups ? p.groups[g.id] : g)).filter((g): g is GroupDoc => Boolean(g));
  for (const [id, g] of Object.entries(p.groups ?? {})) if (g && !doc.groups.some((x) => x.id === id)) groups.push(g);
  return { ...doc, items, groups };
}
export const isEmpty = (p: Patch) => !Object.keys(p.items).length && !Object.keys(p.groups ?? {}).length && !p.order;
export type { EntryDoc, Id };
