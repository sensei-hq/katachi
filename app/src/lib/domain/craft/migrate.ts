// v1 → v2 (design/15 §4): today's saved craft (LayerFlowState's snapshot + the project record) becomes the tree.
// Layers that share an item become one item; an item's cut layer and its engraving become one part with two ops;
// stacked layers become parts by z; a kit layout's sheets become the parts of one kit item. Old crafts open as
// they were: the geometry is the same, only re-homed (0-1000 photo units → each item's frame px).
import { area, fromLoops, toLoops } from '../geo';
import { toMm, uprightTurn, type Pt } from '../toolpath';
import type { CraftDoc, GroupDoc, Id, ItemDoc, OpDoc, PartDoc } from './types';
import { frameSize, tierFor } from './index';

type Loops = [number, number][][];
/** the parts of a v1 snapshot this migration reads (everything else is the workflow's, not the craft's) */
export interface V1Snapshot {
  subject?: string;
  build?: 'stacked' | 'inlay' | 'engrave';
  aspect?: number; widthMm?: number; sizeBasis?: string;
  stack?: { n: number; name: string; colour: string; material: string; visiblePct: number; hiddenPct: number; regionId?: string; itemName?: string; role?: 'cut' | 'engrave'; tune?: { detail: number; weight: number }; planSheet?: number }[];
  regionList?: { id: string; name: string; paths?: Loops; cutPaths?: Loops; holes?: Loops; colour?: string }[];
  plan?: { name: string; cut: Loops; engrave: Loops; sizeMm: [number, number] }[];
}
export interface V1Project { id: string; name: string; createdAt: number; updatedAt: number; kind: string }

const strip = (name: string) => name.replace(/\s*·\s*(cut|engrave|engraving)$/i, '').trim() || name;

/** stable ids from what v1 already names (re-reading the same v1 state gives the same ids, so undo spans both);
 *  `newId` only for what v1 can't name */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const partIdFor = (regionId: string | undefined, name: string) => (regionId?.startsWith('p:') ? regionId.slice(2).split(':')[0] : `pt-${regionId ? slug(regionId) : slug(name)}`);
export function migrateV1(project: V1Project, snap: V1Snapshot, newId: () => Id): CraftDoc {
  const aspect = snap.aspect && snap.aspect > 0 ? snap.aspect : 1, widthMm = snap.widthMm && snap.widthMm > 0 ? snap.widthMm : 300;
  const stack = snap.stack ?? [], regions = new Map((snap.regionList ?? []).map((r) => [r.id, r]));
  const source = { id: 'src-0', kind: 'photo' as const, w: 1000, h: Math.round(1000 / aspect) };
  const op = (kind: OpDoc['kind'], loops: Loops, owner?: Id): OpDoc => ({ id: owner ? `${owner}:${kind}` : newId(), kind, geometry: fromLoops(loops) });
  const base = { v: 2 as const, id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt, rev: 0, groups: [] as GroupDoc[], history: { done: [], undone: [] } };

  // a kit: its layout's sheets are the parts of one item (mm on 300 mm sheets → the frame at XL)
  if (snap.plan?.length) {
    const [sw, sh] = snap.plan[0].sizeMm, size = frameSize('XL', sw, sh), k = size[0] / sw;
    const px = (loops: Loops): Loops => loops.map((l) => l.map(([x, y]) => [x * k, y * k] as [number, number]));
    const parts: PartDoc[] = snap.plan.map((s, i) => ({ id: newId(), name: `Sheet ${s.name}`, z: i, material: stack.find((l) => l.planSheet === i)?.material ?? '3 mm ply', colour: stack.find((l) => l.planSheet === i && l.role === 'cut')?.colour ?? '#C89B6A',
      ops: [...(s.engrave.length ? [op('engrave', px(s.engrave))] : []), op('cut', px(s.cut))] }));
    const item: ItemDoc = { id: newId(), name: snap.subject || project.name || 'Kit', build: 'assembly', frame: { tier: 'XL', size, fromSource: { sourceId: 'src-kit', box: { x: 0, y: 0, w: 1000, h: 1000 }, rotateDeg: 0 }, pxPerMm: k }, parts, joins: [] };
    return { ...base, kind: '3d', items: [item], sources: [source, { id: 'src-kit', kind: 'kit-layout', w: 1000, h: 1000 }] };
  }

  const loopsOf = (l: (typeof stack)[number], index: number, kind: 'cut' | 'engrave'): Loops => {
    const r = l.regionId ? regions.get(l.regionId) : undefined;
    if (!r) return [];
    const whole = r.cutPaths?.length ? r.cutPaths : r.paths ?? [];
    if (l.role) return kind === 'cut' ? [...whole, ...(r.holes ?? [])] : r.paths ?? [];
    // one-piece art (design/10 §Build): stacked = the whole sheet; the back layer is always the whole outline
    return snap.build === 'stacked' || index === 0 || !snap.build ? whole : r.paths ?? [];
  };
  const names = [...new Set(stack.map((l) => l.itemName).filter(Boolean))] as string[];
  // a frame for photo loops inside `box` (0-1000 units): crop, turn, px per mm from the real size
  const frameFor = (box: { x: number; y: number; w: number; h: number }, rotateDeg: number) => {
    const wMm = (box.w / 1000) * widthMm, hMm = (box.h / 1000) * (widthMm / aspect);
    // the size is kept exact (not rounded to whole px): one px per mm on both axes, so geometry stays true to size
    const tier = tierFor(Math.max(wMm, hMm)), k = Math.max(...frameSize(tier, wMm, hMm)) / Math.max(wMm, hMm, 1e-6), size: [number, number] = [wMm * k, hMm * k];
    return { frame: { tier, size, fromSource: { sourceId: source.id, box, rotateDeg }, pxPerMm: Math.max(...size) / Math.max(wMm, hMm, 1e-6) },
      toFrame: (loops: Loops): Loops => loops.map((l) => l.map(([x, y]) => [((x - box.x) / box.w) * size[0], ((y - box.y) / box.h) * size[1]] as [number, number])) };
  };
  const bounds = (loops: Loops) => {
    let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const l of loops) for (const [px, py] of l) {
      if (px < x) x = px; if (py < y) y = py; if (px > x2) x2 = px; if (py > y2) y2 = py;
    }
    if (x2 < x) return { x: 0, y: 0, w: 1000, h: 1000 };
    return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
  };
  const measured = (l: (typeof stack)[number]) => ({ visiblePct: l.visiblePct, hiddenPct: l.hiddenPct, ...(l.tune ? { tune: l.tune } : {}) });

  // separate items (bookmarks, earrings): one item each; its cut layer and engravings → one part
  if (names.length > 1) {
    const items: ItemDoc[] = names.map((name) => {
      const own = stack.map((l, i) => ({ l, i })).filter(({ l }) => l.itemName === name);
      const cut = own.find(({ l }) => l.role !== 'engrave') ?? own[0];
      const cutLoops = loopsOf(cut.l, cut.i, 'cut');
      const { turn } = cutLoops.length ? uprightTurn(toMm(cutLoops as Pt[][], widthMm, aspect)) : { turn: 0 };
      const { frame, toFrame } = frameFor(bounds(cutLoops), turn);
      const pid = partIdFor(cut.l.regionId, name);
      const ops = [...own.filter(({ l }) => l.role === 'engrave').map(({ l, i }, k) => ({ ...op('engrave', toFrame(loopsOf(l, i, 'engrave')), pid), ...(k ? { id: `${pid}:engrave${k}` } : {}), shows: l.visiblePct })), op('cut', toFrame(cutLoops), pid)].filter((o) => o.geometry.paths.length);
      const part: PartDoc = { id: pid, name: strip(cut.l.name), z: 0, material: cut.l.material, colour: cut.l.colour, ops, measured: measured(cut.l), ...(cut.l.regionId ? { regionId: cut.l.regionId } : {}) };
      return { id: `it-${slug(name)}`, name, build: 'single' as const, frame, parts: [part], joins: [] };
    });
    // left / right of the same design are a pair (cut together)
    const groups: GroupDoc[] = [];
    const pairKey = (n: string) => n.toLowerCase().replace(/\b(left|right)\b/g, '').replace(/\s+/g, ' ').trim();
    for (const it of items) {
      if (!/\b(left|right)\b/i.test(it.name) || groups.some((g) => g.items.includes(it.id))) continue;
      const mate = items.find((o) => o !== it && /\b(left|right)\b/i.test(o.name) && pairKey(o.name) === pairKey(it.name) && !groups.some((g) => g.items.includes(o.id)));
      if (mate) groups.push({ id: `pair-${slug(it.name)}`, name: strip(it.name.replace(/\b(left|right)\b/i, '').trim()), kind: 'pair', items: [it.id, mate.id], rule: 'same-sheet' });
    }
    // earrings and the like come in pairs even when they are named "earring 1, earring 2…": Spark lists items in
    // reading order, so a pair is two neighbours of the same size and the same cut area (mirror twins included)
    if (!groups.length && /\b(earrings?|cufflinks?|studs?|pairs?)\b/i.test(snap.subject ?? '')) {
      const look = items.map((it) => { const [w, h] = it.frame.size.map((v) => v / it.frame.pxPerMm); const cut = it.parts[0]?.ops.find((o) => o.kind === 'cut');
        // the outline's own area (not less its holes: twins' fretwork traces a little differently)
        const outer = cut ? toLoops(cut.geometry, 0.5).reduce((m, l) => Math.max(m, Math.abs(area(fromLoops([l])))), 0) : 0;
        return { long: Math.max(w, h), short: Math.min(w, h), area: outer / it.frame.pxPerMm ** 2 }; });
      const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(a, b, 1e-6);
      for (let i = 0; i + 1 < items.length; i++) {
        const [a, b] = [look[i], look[i + 1]];
        if (!near(a.long, b.long, 0.12) || !near(a.short, b.short, 0.12) || !near(a.area, b.area, 0.15)) continue;
        groups.push({ id: `pair-${slug(items[i].name)}`, name: `Pair ${groups.length + 1}`, kind: 'pair', items: [items[i].id, items[i + 1].id], rule: 'same-sheet' });
        i++;
      }
    }
    return { ...base, kind: 'items', items, groups, sources: [source] };
  }

  // one piece (layered art): one item over the whole photo; each layer a part, back to front
  const all = stack.flatMap((l, i) => loopsOf(l, i, 'cut'));
  const { frame, toFrame } = frameFor(all.length ? bounds(all) : { x: 0, y: 0, w: 1000, h: 1000 }, 0);
  const parts: PartDoc[] = stack.map((l, i) => {
    const kind = l.role ?? (snap.build === 'engrave' && i > 0 ? 'engrave' : 'cut');
    const pid = partIdFor(l.regionId, `${l.name}-${i}`), r = l.regionId ? regions.get(l.regionId) : undefined;
    // what shows of it (the screen's preview), when it differs from the whole sheet it is cut from
    const shows = kind === 'cut' && r?.paths?.length && r.cutPaths?.length ? { shows: fromLoops(toFrame(r.paths)) } : {};
    return { id: pid, name: strip(l.name), z: i, material: l.material, colour: l.colour, ops: [op(kind, toFrame(loopsOf(l, i, kind)), pid)], measured: measured(l), ...shows, ...(l.regionId ? { regionId: l.regionId } : {}) };
  });
  const item: ItemDoc = { id: `it-${slug(project.id)}`, name: snap.subject || project.name || 'Craft', build: snap.build ?? 'stacked', frame, parts, joins: [] };
  return { ...base, kind: 'layered', items: stack.length ? [item] : [], sources: [source] };
}
