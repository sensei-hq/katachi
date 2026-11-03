// The stack's own actions (design/14 §6): merge, delete, duplicate, reorder, rename, recolour, set-role, group,
// ungroup. They re-arrange parts and items; geometry is only carried (merge joins it).
import * as geo from '../../geo';
import type { CraftDoc, GroupDoc, Id, ItemDoc, OpDoc, PartDoc } from '../../craft/types';
import { indexCraft } from '../../craft';
import type { ActionDef, ActionResult } from '../types';
import { clone } from './shared';

/** targets can be parts or (engraving rows) ops: the part ids they belong to */
const partIds = (doc: CraftDoc, ids: Id[]) => { const ix = indexCraft(doc); return [...new Set(ids.map((id) => { const n = ix.get(id); return n?.kind === 'op' ? n.part.id : id; }))]; };
const opTargets = (doc: CraftDoc, ids: Id[]) => { const ix = indexCraft(doc); return ids.map((id) => ix.get(id)).filter((n): n is Extract<ReturnType<typeof ix.get>, { kind: 'op' }> => n?.kind === 'op'); };
const itemOfPart = (doc: CraftDoc, partId: Id) => doc.items.find((i) => i.parts.some((p) => p.id === partId));
/** z back to 0, 1, 2… in the same order */
const renumber = (parts: PartDoc[]) => [...parts].sort((a, b) => a.z - b.z).map((p, z) => ({ ...p, z }));
/** geometry from one item's frame into another's (both are crops of the same photo; turns apply at cut time) */
function reframe(g: geo.Geometry, from: ItemDoc, to: ItemDoc): geo.Geometry {
  if (from.id === to.id) return g;
  const a = from.frame, b = to.frame;
  const m = geo.mul(geo.scale(b.size[0] / b.fromSource.box.w, b.size[1] / b.fromSource.box.h), geo.mul(geo.translate(a.fromSource.box.x - b.fromSource.box.x, a.fromSource.box.y - b.fromSource.box.y), geo.scale(a.fromSource.box.w / a.size[0], a.fromSource.box.h / a.size[1])));
  return geo.transform(g, m);
}
/** join geometries: a true union once the geometry library has it, else the paths side by side (even-odd) */
function join(gs: geo.Geometry[]): geo.Geometry {
  const all: geo.Geometry = { paths: gs.flatMap((g) => g.paths) };
  try { return gs.length > 1 ? gs.slice(1).reduce((acc, g) => geo.union(acc, g), gs[0]) : all; } catch { return all; }
}

export const merge: ActionDef<{ name?: string }> = {
  id: 'merge', label: 'Merge', icon: 'i-solar:layers-minimalistic-linear', scope: 'part', arity: 'many', kind: 'code',
  hint: 'Join two or more layers into one (their cut and engraving joined); it sits where the frontmost was.',
  schema: { type: 'object', properties: { name: { type: 'string' } } }, defaults: {},
  says: [/\b(merge|combine|join)\b/i],
  can: (_d, i) => (i.targets.length >= 2 ? true : 'Nothing to merge — pick two or more layers'),
  run(doc, { targets, opts }, ctx): ActionResult {
    const ix = indexCraft(doc);
    // engraving rows only: they join within their own part (an item's engravings become one); never across items
    const opRows = opTargets(doc, targets);
    if (opRows.length === targets.length) {
      const byPart = new Map<Id, typeof opRows>();
      for (const o of opRows) byPart.set(o.part.id, [...(byPart.get(o.part.id) ?? []), o]);
      const items = new Map<Id, ItemDoc>(), joined: string[] = [];
      for (const [, list] of byPart) {
        if (list.length < 2) continue;
        const it = items.get(list[0].item.id) ?? clone(list[0].item); items.set(it.id, it);
        const part = it.parts.find((p) => p.id === list[0].part.id)!, gone = new Set(list.slice(1).map((o) => o.node.id));
        part.ops = part.ops.filter((o) => !gone.has(o.id)).map((o) => (o.id === list[0].node.id ? { ...o, geometry: join(list.map((x) => x.node.geometry)), shows: list.reduce((a, x) => a + (x.node.shows ?? 0), 0) } : o));
        joined.push(part.name);
      }
      if (!items.size) return { items: [], summary: 'Each item’s engraving is already one layer' };
      return { items: [...items.values()], summary: `Merged the engravings of ${joined.join(', ')} — one per item` };
    }
    const parts = partIds(doc, targets).map((id) => ix.get(id)).filter((n) => n?.kind === 'part') as { node: PartDoc; item: ItemDoc }[];
    if (parts.length < 2) return { items: [], summary: 'Nothing to merge — pick two or more layers' };
    // into the frontmost target's item, at its place
    const into = parts[parts.length - 1].item, front = parts[parts.length - 1].node;
    const byKind = (k: OpDoc['kind']) => parts.flatMap((p) => p.node.ops.filter((o) => o.kind === k).map((o) => reframe(o.geometry, p.item, into)));
    const ops: OpDoc[] = (['engrave', 'score', 'cut'] as const).map((k) => byKind(k)).map((gs, i) => (gs.length ? { id: ctx.newId(), kind: (['engrave', 'score', 'cut'] as const)[i], geometry: join(gs) } : null)).filter((o): o is OpDoc => Boolean(o));
    const merged: PartDoc = { id: ctx.newId(), name: opts.name || parts.map((p) => p.node.name).join(' + '), z: front.z, material: front.material, colour: front.colour, ops,
      // only parts of one item can come back as they were (other items' parts were re-framed into this one)
      ...(parts.every((p) => p.item.id === into.id) ? { from: parts.map((p) => clone(p.node)) } : {}) };
    const gone = new Set(parts.map((p) => p.node.id));
    const items: ItemDoc[] = [], removed: Id[] = [];
    for (const it of new Set(parts.map((p) => p.item))) {
      const left = it.parts.filter((p) => !gone.has(p.id));
      if (it.id === into.id) items.push({ ...clone(it), parts: renumber([...left, merged]) });
      else if (left.length) items.push({ ...clone(it), parts: renumber(left) });
      else removed.push(it.id);
    }
    return { items, removed, summary: parts.length === 2 ? `Merged ${parts[0].node.name} with ${parts[1].node.name}` : `Merged ${parts.length} layers into ${merged.name}`, select: [merged.id] };
  }
};

export const del: ActionDef<Record<string, never>> = {
  id: 'delete', label: 'Delete', icon: 'i-solar:trash-bin-minimalistic-linear', scope: 'part', arity: 'any', kind: 'code',
  hint: 'Delete layers (an item with no layers left goes too).', schema: { type: 'object', properties: {} }, defaults: {},
  // "remove the wall from the gold layer" is a correction to a layer, not a delete
  says: [/\b(delete|remove|drop|get rid of|discard)\b(?!.*\bfrom\b)(?!.*\b(hooks?|ear ?wires?|findings|bails?)\b)/i],
  can: (_d, i) => (i.targets.length ? true : 'Nothing to delete'),
  run(doc, { targets }): ActionResult {
    // an engraving row is an op of its part: deleting it leaves the part; a part with nothing left goes, and an
    // item with no parts left goes too
    const opRows = opTargets(doc, targets), ops = new Set(opRows.map((o) => o.node.id));
    const gone = new Set(targets.filter((t) => !ops.has(t))), items: ItemDoc[] = [], removed: Id[] = [];
    for (const it of doc.items) {
      if (!it.parts.some((p) => gone.has(p.id) || p.ops.some((o) => ops.has(o.id)))) continue;
      const left = it.parts.filter((p) => !gone.has(p.id)).map((p) => ({ ...clone(p), ops: p.ops.filter((o) => !ops.has(o.id)) })).filter((p) => p.ops.length);
      if (left.length) items.push({ ...clone(it), parts: renumber(left) }); else removed.push(it.id);
    }
    const names = [...doc.items.flatMap((i) => i.parts).filter((p) => gone.has(p.id)).map((p) => p.name), ...opRows.map((o) => `${o.part.name} · engraving`)];
    return { items, removed, summary: names.length > 2 ? `Deleted ${names.length} layers` : `Deleted ${names.join(' and ')}` };
  }
};

export const duplicate: ActionDef<Record<string, never>> = {
  id: 'duplicate', label: 'Duplicate', icon: 'i-solar:copy-linear', scope: 'part', arity: 'one', kind: 'code',
  hint: 'Copy a layer; the copy sits just in front of it.', schema: { type: 'object', properties: {} }, defaults: {},
  says: [/\b(duplicate|copy)\b/i],
  can: (_d, i) => (i.targets.length === 1 ? true : 'Pick one layer to duplicate'),
  run(doc, { targets }, ctx): ActionResult {
    const pid = partIds(doc, targets)[0], it = itemOfPart(doc, pid)!, p = it.parts.find((x) => x.id === pid)!;
    const copy: PartDoc = { ...clone(p), id: ctx.newId(), name: `${p.name} copy`, z: p.z + 0.5, ops: p.ops.map((o) => ({ ...clone(o), id: ctx.newId() })) };
    return { items: [{ ...clone(it), parts: renumber([...it.parts, copy]) }], summary: `Duplicated ${p.name}`, select: [copy.id] };
  }
};

export const reorder: ActionDef<{ to: 'front' | 'back' | 'forward' | 'backward' }> = {
  id: 'reorder', label: 'Move in the stack', icon: 'i-solar:sort-vertical-linear', scope: 'part', arity: 'one', kind: 'code',
  hint: 'Move a layer to the front or back of its item’s stack, or one step.', schema: { type: 'object', properties: { to: { enum: ['front', 'back', 'forward', 'backward'] } } }, defaults: { to: 'front' },
  says: [/\b(bring|send|move)\b.*\b(front|back|forward|backward)\b/i],
  can: (d, i) => ((itemOfPart(d, partIds(d, i.targets)[0])?.parts.length ?? 0) > 1 ? true : 'It is the only layer of its item'),
  run(doc, { targets, opts }): ActionResult {
    const pid = partIds(doc, targets)[0], it = itemOfPart(doc, pid)!, sorted = renumber(it.parts), at = sorted.findIndex((p) => p.id === pid);
    const [p] = sorted.splice(at, 1);
    const to = opts.to === 'front' ? sorted.length : opts.to === 'back' ? 0 : opts.to === 'forward' ? Math.min(sorted.length, at + 1) : Math.max(0, at - 1);
    sorted.splice(to, 0, p);
    return { items: [{ ...clone(it), parts: sorted.map((x, z) => ({ ...x, z })) }], summary: `Moved ${p.name} ${opts.to === 'front' || opts.to === 'back' ? `to the ${opts.to}` : opts.to}` };
  }
};

const editPart = (doc: CraftDoc, raw: Id[], f: (p: PartDoc) => PartDoc) => { const ids = partIds(doc, raw); return doc.items.filter((i) => i.parts.some((p) => ids.includes(p.id))).map((it) => ({ ...clone(it), parts: it.parts.map((p) => (ids.includes(p.id) ? f(clone(p)) : p)) })); };

export const rename: ActionDef<{ name: string }> = {
  id: 'rename', label: 'Rename', icon: 'i-solar:pen-linear', scope: 'part', arity: 'one', kind: 'code',
  hint: 'Rename a layer.', schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, defaults: { name: '' },
  can: (_d, i) => (i.targets.length === 1 && i.opts.name.trim() ? true : 'Say the new name'),
  run: (doc, { targets, opts }) => ({ items: editPart(doc, targets, (p) => ({ ...p, name: opts.name.trim() })), summary: `Renamed to ${opts.name.trim()}` })
};

export const recolour: ActionDef<{ colour?: string; material?: string }> = {
  id: 'recolour', label: 'Colour / material', icon: 'i-solar:palette-linear', scope: 'part', arity: 'any', kind: 'code',
  hint: 'Change the colour or material a layer is cut from (it moves to that material’s sheets).', schema: { type: 'object', properties: { colour: { type: 'string' }, material: { type: 'string' } } }, defaults: {},
  can: (_d, i) => (i.targets.length && (i.opts.colour || i.opts.material) ? true : 'Say the colour or material'),
  run: (doc, { targets, opts }) => ({ items: editPart(doc, targets, (p) => ({ ...p, ...(opts.colour ? { colour: opts.colour } : {}), ...(opts.material ? { material: opts.material } : {}) })), summary: `Now ${[opts.colour, opts.material].filter(Boolean).join(', ')}` })
};

export const setRole: ActionDef<{ role: 'cut' | 'engrave' }> = {
  id: 'set-role', label: 'Cut or engrave', icon: 'i-solar:scissors-linear', scope: 'part', arity: 'any', kind: 'code',
  hint: 'Make a layer cut through, or engraved only.', schema: { type: 'object', properties: { role: { enum: ['cut', 'engrave'] } } }, defaults: { role: 'engrave' },
  says: [/\b(engrave|etch|burn)\b.*\binstead\b|\bmake (it|this) (an )?(engrav|cut)/i],
  can: (_d, i) => (i.targets.length ? true : 'Pick a layer'),
  run: (doc, { targets, opts }) => ({ items: editPart(doc, targets, (p) => ({ ...p, ops: p.ops.map((o) => (o.kind === (opts.role === 'cut' ? 'engrave' : 'cut') ? { ...o, kind: opts.role } : o)) })), summary: `Now ${opts.role === 'cut' ? 'cut through' : 'engraved'}` })
};

export const group: ActionDef<{ kind: 'pair' | 'set'; name?: string }> = {
  id: 'group', label: 'Group', icon: 'i-solar:link-linear', scope: 'item', arity: 'many', kind: 'code',
  hint: 'Make items a pair (cut together) or a set.', schema: { type: 'object', properties: { kind: { enum: ['pair', 'set'] }, name: { type: 'string' } } }, defaults: { kind: 'set' },
  says: [/\b(pair|group)\b.*\b(together|up)\b/i],
  can: (_d, i) => (i.targets.length >= 2 && (i.opts.kind !== 'pair' || i.targets.length === 2) ? true : i.opts.kind === 'pair' ? 'A pair is two items' : 'Pick two or more items'),
  run(doc, { targets, opts }, ctx): ActionResult {
    // an item is in one group at a time: it leaves any other
    const groups = doc.groups.filter((g) => g.items.some((i) => targets.includes(i))).map((g) => ({ ...g, items: g.items.filter((i) => !targets.includes(i)) }));
    const names = targets.map((id) => doc.items.find((i) => i.id === id)?.name ?? '');
    const g: GroupDoc = { id: ctx.newId(), name: opts.name || names.join(' + '), kind: opts.kind, items: targets, rule: 'same-sheet' };
    return { items: [], groups: [...groups, g], summary: `${opts.kind === 'pair' ? 'Paired' : 'Grouped'} ${names.join(' and ')} — cut together` };
  }
};

export const ungroup: ActionDef<Record<string, never>> = {
  id: 'ungroup', label: 'Ungroup', icon: 'i-solar:link-broken-linear', scope: 'item', arity: 'any', kind: 'code',
  hint: 'Take items out of their pair or set.', schema: { type: 'object', properties: {} }, defaults: {},
  says: [/\bungroup|unpair|separate them\b/i],
  can: (d, i) => (d.groups.some((g) => g.items.some((x) => i.targets.includes(x))) ? true : 'Not in a pair or set'),
  run(doc, { targets }): ActionResult {
    const touched = doc.groups.filter((g) => g.items.some((i) => targets.includes(i)));
    return { items: [], groups: touched.map((g) => ({ ...g, items: g.items.filter((i) => !targets.includes(i)) })), summary: `Ungrouped ${targets.length} item${targets.length > 1 ? 's' : ''}` };
  }
};

const insidePoly = ([x, y]: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** the pieces worth a layer of their own: specks under 2% of the biggest piece (trace noise, tiny islands) stay with it */
function realPieces(g: geo.Geometry): geo.Geometry[] {
  // an island inside a hole (a fretwork eye) belongs to the piece around it: only outer outlines are pieces
  // a loop is inside another when its first point is, or when its box sits within the other's (a traced outline
  // drawn over the outline it was traced from touches that edge, so its first point can sit on it)
  const loops = geo.toLoops(g, 0.5).filter((l) => l.length > 2);
  const box = loops.map((l) => { const xs = l.map((q) => q[0]), ys = l.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
  const size = loops.map((l) => Math.abs(l.reduce((a, [x, y], k) => { const [u, v] = l[(k + 1) % l.length]; return a + x * v - u * y; }, 0)) / 2);
  const within = (i: number, j: number) => insidePoly(loops[i][0], loops[j]) || (size[i] < size[j] && box[i][0] >= box[j][0] - 1 && box[i][1] >= box[j][1] - 1 && box[i][2] <= box[j][2] + 1 && box[i][3] <= box[j][3] + 1);
  const top = loops.map((_, i) => !loops.some((_, j) => j !== i && within(i, j)));
  const outer = loops.map((l, i) => ({ l, i })).filter(({ i }) => top[i])
    .map(({ l, i }) => geo.fromLoops([l, ...loops.filter((_, j) => j !== i && !top[j] && within(j, i))]));
  const all = outer.map((x) => ({ g: x, a: Math.abs(geo.area(x)) })).sort((p, q) => q.a - p.a);
  if (all.length < 2) return all.map((x) => x.g);
  const min = all[0].a * 0.02, big = all.filter((x) => x.a >= min), specks = all.filter((x) => x.a < min);
  if (specks.length) big[0] = { ...big[0], g: geo.fromLoops([...geo.toLoops(big[0].g, 0.5), ...specks.flatMap((x) => geo.toLoops(x.g, 0.5))]) };
  return big.map((x) => x.g);
}
export const split: ActionDef<Record<string, never>> = {
  id: 'split', label: 'Split', icon: 'i-solar:scissors-linear', scope: 'part', arity: 'one', kind: 'code',
  hint: 'Split a layer into its separate pieces (each piece with its own holes).', schema: { type: 'object', properties: {} }, defaults: {},
  says: [/\bsplit\b|\bseparate (the )?pieces\b/i],
  can(d, i) { const pid = partIds(d, i.targets)[0], p = d.items.flatMap((x) => x.parts).find((x) => x.id === pid); const cut = p?.ops.find((o) => o.kind === 'cut'); return p?.from?.length || (cut && realPieces(cut.geometry).length > 1) ? true : 'One piece — nothing to split'; },
  run(doc, { targets }, ctx): ActionResult {
    const pid = partIds(doc, targets)[0], it = itemOfPart(doc, pid)!, p = it.parts.find((x) => x.id === pid)!, cut = p.ops.find((o) => o.kind === 'cut')!;
    // a merged part gives back the parts it was made from, where they were
    if (p.from?.length) {
      const back = p.from.map((x, k) => ({ ...clone(x), z: p.z - (p.from!.length - 1 - k) / 100 }));
      return { items: [{ ...clone(it), parts: renumber([...it.parts.filter((x) => x.id !== pid), ...back]) }], summary: `Split ${p.name} back into ${back.map((x) => x.name).join(' and ')}` };
    }
    const made: PartDoc[] = realPieces(cut.geometry).map((g, k) => ({ ...clone(p), id: ctx.newId(), name: `${p.name} · ${k + 1}`, z: p.z + k / 100, ops: [{ id: ctx.newId(), kind: 'cut', geometry: g }] }));
    // engraving stays with the first piece (it can't be told apart by piece without the photo)
    const engr = p.ops.filter((o) => o.kind !== 'cut'); if (engr.length) made[0].ops = [...engr.map((o) => ({ ...clone(o), id: ctx.newId() })), ...made[0].ops];
    return { items: [{ ...clone(it), parts: renumber([...it.parts.filter((x) => x.id !== pid), ...made]) }], summary: `Split ${p.name} into ${made.length} pieces` };
  }
};

export const structureActions = [merge, del, duplicate, reorder, rename, recolour, setRole, group, ungroup, split];
