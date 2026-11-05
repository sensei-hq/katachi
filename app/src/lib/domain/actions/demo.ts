// Live gallery demos: every action runs against one synthetic craft, and the gallery shows what changed —
// geometry as before/after outlines, frame and stack edits as pills (turn, size, count, name). Pure: the demo
// context has no pixels, so the model action reports that it needs the photo.
import * as geo from '../geo';
import type { Pt } from '../geo';
import { pointsToPath } from '../vector';
import type { PixelImage } from '../colour';
import type { CraftDoc, Id, ItemDoc, PartDoc } from '../craft/types';
import { actionOf } from './registry';
import type { ActionId } from './types';
import { craftOf, oShape, sq, testCtx } from './defs/fixtures';

const rot = (pts: Pt[], deg: number, [cx, cy]: Pt): Pt[] => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
// a skewed quad with wobbling edges (smooth), a bitten corner (hidden edges), dense collinear points
// (simplify) and a speck and pin beside it (tidy): one outline that exercises the shape shelf
const sketchy: Pt[] = [[0, 0], [27, 2], [55, 4], [82, 6], [110, 8], [113, 33], [106, 58], [104, 83], [102, 108], [91, 103], [78, 97], [68, 101], [60, 106], [46, 104.6], [32, 103.1], [18, 101.7], [4, 100], [3, 75], [2, 50], [-3, 25]];
const oct = (cx: number, cy: number, wobble = 0): Pt[] => [[cx - 8, cy - 3 + wobble], [cx - 3, cy - 8], [cx + 3, cy - 8], [cx + 8, cy - 3], [cx + 8, cy + 3], [cx + 3, cy + 8], [cx - 3, cy + 8], [cx - 8, cy + 3]];
const latticeHoles = (): Pt[][] => [oct(216, 216), oct(244, 216), oct(244, 244, 3), oct(216, 244)];
// an L, tilted: rotation, flip and mirror read on it (a square would look the same turned)
const ell: Pt[] = [[0, 0], [40, 0], [40, 15], [15, 15], [15, 40], [0, 40]];
const drop: Pt[] = [[0, 20], [47, 20], [47, 0], [52, 0], [52, 20], [100, 20], [100, 120], [0, 120]];

/** the demo craft: ids are deterministic per build (item0…, partI-J), so every demo targets the same shapes */
export function demoCraft(): CraftDoc {
  const doc = craftOf({
    items: [
      { name: 'Panel', parts: [
        { name: 'Base', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sketchy, sq(150, 150, 2), sq(48, 48, 2)] }] },
        { name: 'Shade', colour: '#6e231c', ops: [{ kind: 'cut', loops: [sq(80, 80, 45)] }] },
        { name: 'Lattice', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(200, 200, 60), ...latticeHoles()] }] },
        { name: 'Drop', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [drop, sq(10, 30, 39), sq(51, 30, 39)] }] },
        { name: 'Ring', colour: '#b03a2e', ops: [{ kind: 'cut', loops: oShape() }] },
        { name: 'Pair', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(300, 300, 30), sq(350, 300, 30)] }] },
        { name: 'Twins', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(400, 400, 30), sq(420, 400, 30)] }] }
      ] },
      { name: 'Charm', parts: [{ name: 'Face', colour: '#c8b28a', ops: [{ kind: 'cut', loops: [sq(0, 0, 80), sq(32, 32, 16)] }] }] },
      { name: 'Tag', frame: { fromSource: { box: { x: 30, y: 10, w: 100, h: 100 } } }, parts: [{ name: 'Label', colour: '#7fa8c9', ops: [{ kind: 'cut', loops: [sq(30, 10, 60)] }] }] },
      { name: 'Token', parts: [{ name: 'Coin', colour: '#c9a227', ops: [{ kind: 'cut', loops: [rot(ell, 12, [20, 20])] }] }] }
    ],
    groups: [{ id: 'group0', name: 'Charm + Tag', kind: 'pair', items: ['item1', 'item2'], rule: 'same-sheet' }]
  });
  // the frames crop a photo (synthetic pixels below, so enhance really runs)
  doc.sources = [{ id: 'src', kind: 'photo', w: 800, h: 600 }];
  return doc;
}

/** a synthetic photo: a warm backdrop with the subject block where the Panel frame crops. Deterministic
 *  (no Math.random): demos must render byte-identical every time. */
let demoPixelsCache: PixelImage | null = null;
function demoPixels(): PixelImage {
  if (demoPixelsCache) return demoPixelsCache;
  const w = 800, h = 600, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inSubject = x >= 8 && x < 72 && y >= 8 && y < 52;
    const n = (((x * 73856093) ^ (y * 19349663)) % 100) / 100;
    const [r, g, b] = inSubject ? [107 + n * 14, 74 + n * 12, 51 + n * 10] : [222 + n * 8, 213 + n * 8, 194 + n * 8];
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  demoPixelsCache = { data, w, h };
  return demoPixelsCache;
}

const DEMOS: Record<string, { targets: Id[]; opts: Record<string, unknown> }> = {
  merge: { targets: ['part0-0', 'part0-1'], opts: {} },
  delete: { targets: ['part0-1'], opts: {} },
  duplicate: { targets: ['part0-0'], opts: {} },
  reorder: { targets: ['part0-0'], opts: { to: 'front' } },
  rename: { targets: ['part0-0'], opts: { name: 'Backer' } },
  recolour: { targets: ['part0-0'], opts: { colour: '#1e8449' } },
  'set-role': { targets: ['part0-0'], opts: { role: 'engrave' } },
  group: { targets: ['item0', 'item3'], opts: {} },
  ungroup: { targets: ['item1'], opts: {} },
  split: { targets: ['part0-5'], opts: {} },
  straighten: { targets: ['item3'], opts: {} },
  interpolate: { targets: ['item0'], opts: { onlyHidden: false } },
  resize: { targets: ['item0'], opts: { wMm: 50 } },
  enhance: { targets: ['item0'], opts: {} },
  flip: { targets: ['item3'], opts: {} },
  mirror: { targets: ['item3'], opts: {} },
  rotate: { targets: ['item3'], opts: {} },
  quantity: { targets: ['item3'], opts: {} },
  smooth: { targets: ['part0-0'], opts: { strength: 4, passes: 2 } },
  simplify: { targets: ['part0-0'], opts: {} },
  offset: { targets: ['part0-0'], opts: {} },
  weld: { targets: ['part0-6'], opts: {} },
  bridge: { targets: ['part0-4'], opts: { widthMm: 2 } },
  'add-hole': { targets: ['item1'], opts: {} },
  align: { targets: ['item1', 'item2'], opts: {} },
  distribute: { targets: ['item1', 'item2'], opts: {} },
  tidy: { targets: ['part0-0'], opts: {} },
  unhook: { targets: ['part0-3'], opts: {} },
  'repeat-pattern': { targets: ['part0-2'], opts: {} },
  symmetrize: { targets: ['item1'], opts: {} },
  rectify: { targets: ['item0'], opts: {} },
  'same-size': { targets: ['item1', 'item2'], opts: {} },
  deshadow: { targets: ['part0-0', 'part0-1'], opts: {} }
};

export interface DemoShape { d: string; colour: string; name: string }
export interface ActionDemo {
  before: DemoShape[]; after: DemoShape[];
  /** one viewBox for both frames (the union of their bounds, padded) */
  viewBox: string;
  summary: string;
  changed: 'geometry' | 'stack' | 'none';
  /** frame edits, said plainly (size, turn, count) */
  badges: string[];
  dims?: { before: string; after: string };
  /** why there is nothing to show (the model action needs the photo) */
  note?: string;
}
const cutLoops = (p: PartDoc): Pt[][] => p.ops.filter((o) => o.kind === 'cut').flatMap((o) => geo.toLoops(o.geometry, 0.5));
interface ShownLoop { l: Pt[]; colour: string; name: string }
const shownLoops = (parts: PartDoc[]): ShownLoop[] => parts.flatMap((p) => cutLoops(p).map((l) => ({ l, colour: p.colour, name: p.name })));
const shapesOfLoops = (ls: ShownLoop[]): DemoShape[] => ls.map(({ l, colour, name }) => ({ d: pointsToPath(l), colour, name }));
const shapesOf = (item: ItemDoc): DemoShape[] => shapesOfLoops(shownLoops(item.parts));
// the union bounds of two framings, padded, as one shared SVG viewBox
const viewOfLoops = (ls: ShownLoop[]): string => {
  const pts = ls.flatMap(({ l }) => l);
  if (!pts.length) return '0 0 100 100';
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x = Math.min(...xs) - 8, y = Math.min(...ys) - 8;
  return `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10} ${Math.round((Math.max(...xs) - x + 8) * 10) / 10} ${Math.round((Math.max(...ys) - y + 8) * 10) / 10}`;
};
const viewOf = (...items: ItemDoc[]): string => viewOfLoops(items.flatMap((i) => shownLoops(i.parts)));
const outlinePart = (it: ItemDoc): PartDoc => [...it.parts].sort((a, b) => a.z - b.z)[0];
const centreOf = (ls: ShownLoop[]): Pt => {
  const pts = ls.flatMap(({ l }) => l);
  if (!pts.length) return [0, 0];
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
const loopsKey = (item: ItemDoc) => JSON.stringify(item.parts.flatMap((p) => p.ops.filter((o) => o.kind === 'cut').flatMap((o) => geo.toLoops(o.geometry, 0.25).map((l) => l.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])))));
const stackKey = (doc: CraftDoc) => JSON.stringify({ parts: doc.items.map((i) => i.parts.map((p) => [p.name, p.colour, p.z, p.ops.map((o) => o.kind)])), groups: doc.groups, order: doc.items.map((i) => i.id), frames: doc.items.map((i) => [i.frame.size, i.frame.pxPerMm, i.frame.fromSource, i.frame.flipX, i.frame.flipY, i.qty]) });
const mm = (doc: CraftDoc, id: Id) => { const it = doc.items.find((i) => i.id === id)!; return `${Math.round((it.frame.size[0] / it.frame.pxPerMm) * 10) / 10} × ${Math.round((it.frame.size[1] / it.frame.pxPerMm) * 10) / 10} mm`; };

export async function demoAction(id: ActionId): Promise<ActionDemo> {
  const def = actionOf(id);
  const demo = DEMOS[id];
  if (!def || !demo) throw new Error(`no demo for ${id}`);
  const doc = demoCraft();
  const ok = def.can(doc, { targets: demo.targets, opts: { ...def.defaults, ...demo.opts } });
  const focus = (d: CraftDoc) => {
    const it = d.items.find((i) => i.parts.some((p) => demo.targets.includes(p.id))) ?? d.items.find((i) => demo.targets.includes(i.id)) ?? d.items[0];
    return it;
  };
  const beforeStack = stackKey(doc);
  const itemTargets = demo.targets.filter((t) => doc.items.some((i) => i.id === t));
  const beforeDims = itemTargets.map((t) => mm(doc, t)).join(' · ');
  if (ok !== true) { const b = shapesOf(focus(doc)); return { before: b, after: b, viewBox: viewOf(focus(doc)), summary: String(ok), changed: 'none', badges: [], note: `Cannot demo: ${ok}` }; }
  const t = testCtx();
  const r = await def.run(doc, { targets: demo.targets, opts: { ...def.defaults, ...demo.opts } }, { ...t, pixels: async () => demoPixels() });
  if (!r.items.length && !r.groups?.length) { const b = shapesOf(focus(doc)); return { before: b, after: b, viewBox: viewOf(focus(doc)), summary: r.summary, changed: 'none', badges: [], note: r.summary }; }
  // the result whole items carry the change; groups-only results (group/ungroup) keep the craft's items
  const next: CraftDoc = { ...doc, items: doc.items.map((i) => r.items.find((x) => x.id === i.id) ?? i), groups: r.groups ?? doc.groups };
  for (const x of r.items) if (!next.items.some((i) => i.id === x.id)) next.items.push(x);
  // show the item that actually changed (samesize resizes the second of its pair, not the first)
  const afterItem = (r.items[0] && next.items.find((i) => i.id === r.items[0].id)) || focus(next);
  const beforeItem = doc.items.find((i) => i.id === afterItem.id) ?? focus(doc);
  // frame the story, not the whole item: part targets (and whatever they become: merges are born, deletes
  // vanish), else the outline the item-scope action works on; born items (a mirror twin) join the after frame
  const targetIds = demo.targets.filter((t) => beforeItem.parts.some((p) => p.id === t));
  const beforeIds = new Set(beforeItem.parts.map((p) => p.id));
  const showBefore = targetIds.length ? beforeItem.parts.filter((p) => targetIds.includes(p.id)) : [outlinePart(beforeItem)];
  const showAfter = targetIds.length
    ? [...afterItem.parts.filter((p) => targetIds.includes(p.id)), ...afterItem.parts.filter((p) => !beforeIds.has(p.id))]
    : [outlinePart(afterItem)];
  const born = next.items.filter((i) => !doc.items.some((d) => d.id === i.id));
  const beforeShown = shownLoops(showBefore);
  let afterShown = [...shownLoops(showAfter), ...born.flatMap((i) => shownLoops(i.parts))];
  // flag-only edits (a flip, a turn) read in the cut orientation, not the stored one
  const c = centreOf(beforeShown), fb = beforeItem.frame, fa = afterItem.frame;
  if (!!fb.flipX !== !!fa.flipX) afterShown = afterShown.map((s) => ({ ...s, l: s.l.map(([x, y]) => [2 * c[0] - x, y] as Pt) }));
  const turn = (fa.fromSource.rotateDeg || 0) - (fb.fromSource.rotateDeg || 0);
  if (turn) afterShown = afterShown.map((s) => ({ ...s, l: rot(s.l, turn, c) }));
  const before = shapesOfLoops(beforeShown), after = shapesOfLoops(afterShown);
  const viewBox = viewOfLoops([...beforeShown, ...afterShown]);
  const badges: string[] = [];
  const dims = itemTargets.length ? { before: beforeDims, after: itemTargets.map((t) => mm(next, t)).join(' · ') } : undefined;
  if (dims && dims.before !== dims.after) badges.push(dims.after);
  const dl = afterItem.parts.length - beforeItem.parts.length;
  if (dl !== 0) badges.push(`${dl > 0 ? '+' : '−'}${Math.abs(dl)} layer${Math.abs(dl) === 1 ? '' : 's'}`);
  const di = next.items.length - doc.items.length;
  if (di !== 0) badges.push(`${di > 0 ? '+' : '−'}${Math.abs(di)} item${Math.abs(di) === 1 ? '' : 's'}`);
  for (const t of demo.targets) {
    const b = doc.items.find((i) => i.id === t), a = next.items.find((i) => i.id === t);
    if (!b || !a) continue;
    if ((b.frame.fromSource.rotateDeg || 0) !== (a.frame.fromSource.rotateDeg || 0)) badges.push(`turns ${a.frame.fromSource.rotateDeg}°`);
    if ((b.qty ?? 1) !== (a.qty ?? 1)) badges.push(`×${a.qty}`);
    if (!!b.frame.flipX !== !!a.frame.flipX) badges.push('mirrored');
    if (b.frame.tier !== a.frame.tier) badges.push(`${b.frame.tier} → ${a.frame.tier}`);
    const dx = Math.round(a.frame.fromSource.box.x - b.frame.fromSource.box.x), dy = Math.round(a.frame.fromSource.box.y - b.frame.fromSource.box.y);
    if (dx || dy) badges.push(`shifted ${dx}${dy ? `, ${dy}` : ''}`);
  }
  const changed: ActionDemo['changed'] = loopsKey(afterItem) !== loopsKey(beforeItem) ? 'geometry' : stackKey(next) !== beforeStack || badges.length || r.groups?.length ? 'stack' : 'none';
  return { before, after, viewBox, summary: r.summary, changed, badges, ...(dims && dims.before !== dims.after ? { dims } : {}) };
}
