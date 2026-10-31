// Cut planning (task T2): a craft becomes sheets for one device + material.
import { depths, flip, fromLoops, mul, rotate, scale, toLoops, transform, type Pt } from '../geo';
import type { CraftDoc, Id, ItemDoc, OpDoc, PartDoc } from '../craft/types';
import { nestParts } from '../nesting';
import { nestOnBoards, type NestInput } from './nest';
import { deviceShortName } from './profiles';
import { withKerf } from './kerf';
import type { CutPlan, CutProfile, Pass, Placement, Sheet } from './types';

interface OpLoops { op: OpDoc; loops: Pt[][] }

/** a part's ops in frame mm (rotate/flip/scale applied, bbox measured, not yet placed) */
interface PartMm { part: PartDoc; item: ItemDoc; ops: OpLoops[]; minX: number; minY: number; wMm: number; hMm: number }

function partMm(item: ItemDoc, part: PartDoc): PartMm {
  const { frame } = item;
  const centre: Pt = [frame.size[0] / 2, frame.size[1] / 2];
  let m = rotate(frame.fromSource.rotateDeg, centre);
  if (frame.flipX) m = mul(flip('x', centre), m);
  if (frame.flipY) m = mul(flip('y', centre), m);
  m = mul(scale(1 / frame.pxPerMm), m);
  const ops: OpLoops[] = part.ops.map((op) => ({
    op,
    loops: toLoops(transform(fromLoops(toLoops(op.geometry, 0.05 * frame.pxPerMm)), m)),
  }));
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of ops) for (const [x, y] of o.loops.flat()) {
    if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y;
  }
  if (x2 < x1) { x1 = 0; y1 = 0; x2 = 0; y2 = 0; }
  return { part, item, ops, minX: x1, minY: y1, wMm: x2 - x1, hMm: y2 - y1 };
}

/** a part's passes with its loops shifted by `at - bbox min`: engrave/score first, then one cut pass per loop, holes first */
function passesFor(pm: PartMm, at: [number, number]): Pass[] {
  const dx = at[0] - pm.minX, dy = at[1] - pm.minY;
  const move = (loops: Pt[][]): Pt[][] => loops.map((l) => l.map(([x, y]) => [x + dx, y + dy] as Pt));
  const passes: Pass[] = [];
  for (const o of pm.ops.filter((x) => x.op.kind === 'engrave' || x.op.kind === 'score')) {
    if (o.loops.length) passes.push({ opId: o.op.id, partId: pm.part.id, kind: o.op.kind, shapesMm: move(o.loops) });
  }
  for (const o of pm.ops.filter((x) => x.op.kind === 'cut')) {
    const ds = depths(fromLoops(o.loops));
    const order = o.loops.map((_, i) => i).sort((a, b) => ds[b] - ds[a]);
    for (const i of order) passes.push({ opId: o.op.id, partId: pm.part.id, kind: 'cut', shapesMm: move([o.loops[i]]) });
  }
  return passes;
}

const byZ = (parts: PartDoc[]): PartDoc[] => [...parts].sort((a, b) => a.z - b.z);
const copiesOf = (item: ItemDoc): number => Math.max(1, item.qty ?? 1);

/** turn a craft into sheets for one device + material */
export function planCut(craft: CraftDoc, profile: CutProfile, rev?: number): CutPlan {
  const sheets: Sheet[] = [];
  const n = { v: 0 };
  const nextN = () => ++n.v;
  if (profile.layout === 'groups-together') planGroups(craft, profile, sheets, nextN);
  else if (profile.layout === 'one-item-per-sheet') planItems(craft, profile, sheets, nextN);
  else if (profile.layout === 'nest') planNest(craft, profile, sheets, nextN);
  else if (profile.layout === 'given') planGiven(craft, profile, sheets, nextN);
  else planParts(craft, profile, sheets, nextN);
  // kerf after placement (a no-op when the profile has none)
  const partNames = new Map(craft.items.flatMap((i) => i.parts.map((p) => [p.id, p.name] as [Id, string])));
  const kerfed = sheets.map((s) => withKerf(s, profile.kerfMm, partNames));
  return { craftId: craft.id, profileId: profile.id, craftRev: rev ?? craft.rev, sheets: kerfed };
}

/** one sheet per part, in item order then z order */
function planParts(craft: CraftDoc, profile: CutProfile, sheets: Sheet[], nextN: () => number, only?: Set<Id>): void {
  const m = profile.marginMm;
  const single = craft.items.length === 1;
  for (const item of craft.items) {
    if (only && !only.has(item.id)) continue;
    const qty = copiesOf(item);
    for (const part of byZ(item.parts)) {
      const pm = partMm(item, part);
      for (let copy = 1; copy <= qty; copy++) {
        const at: [number, number] = [m, m];
        const name = single || part.name === item.name ? part.name : `${item.name} · ${part.name}`;
        sheets.push({
          id: qty > 1 ? `${part.id}:${copy}` : part.id,
          n: nextN(),
          material: part.material, colour: part.colour,
          board: { ...profile.board },
          sizeMm: [pm.wMm + 2 * m, pm.hMm + 2 * m],
          placements: [{ partId: part.id, itemId: item.id, at, rotateDeg: 0 }],
          passes: passesFor(pm, at),
          forStep: { itemId: item.id, z: part.z },
          name: qty > 1 ? `${name} (${copy} of ${qty})` : name,
        });
      }
    }
  }
}

/** all of an item's parts on one sheet, overlaid as in the item (split by material: a sheet never mixes) */
function planItems(craft: CraftDoc, profile: CutProfile, sheets: Sheet[], nextN: () => number): void {
  const m = profile.marginMm;
  for (const item of craft.items) {
    const qty = copiesOf(item);
    const buckets = new Map<string, PartDoc[]>();
    for (const part of byZ(item.parts)) {
      if (!buckets.has(part.material)) buckets.set(part.material, []);
      buckets.get(part.material)!.push(part);
    }
    for (const parts of buckets.values()) {
      const pms = parts.map((part) => partMm(item, part));
      const jx = Math.min(...pms.map((p) => p.minX)), jy = Math.min(...pms.map((p) => p.minY));
      const w = Math.max(...pms.map((p) => p.minX + p.wMm)) - jx, h = Math.max(...pms.map((p) => p.minY + p.hMm)) - jy;
      for (let copy = 1; copy <= qty; copy++) {
        const placements: Placement[] = [];
        const passes: Pass[] = [];
        for (const pm of pms) {
          const at: [number, number] = [m + (pm.minX - jx), m + (pm.minY - jy)];
          placements.push({ partId: pm.part.id, itemId: item.id, at, rotateDeg: 0 });
          passes.push(...passesFor(pm, at));
        }
        const mat = parts[0].material;
        sheets.push({
          id: qty > 1 ? `${item.id}:${copy}` : item.id,
          n: nextN(),
          material: mat, colour: parts[0].colour,
          board: { ...profile.board },
          sizeMm: [w + 2 * m, h + 2 * m],
          placements, passes,
          forStep: { itemId: item.id },
          name: qty > 1 ? `${item.name} (${copy} of ${qty})` : item.name,
        });
      }
    }
  }
}

interface Unit { pms: PartMm[] }

/** same-sheet groups share nested sheets; ungrouped items lay out one part per sheet */
function planGroups(craft: CraftDoc, profile: CutProfile, sheets: Sheet[], nextN: () => number): void {
  const m = profile.marginMm;
  const area = { wMm: profile.board.wMm - 2 * m, hMm: profile.board.hMm - 2 * m };
  const byId = new Map(craft.items.map((i) => [i.id, i]));
  const grouped = new Set<Id>();
  for (const group of craft.groups) {
    if (group.rule !== 'same-sheet') continue;
    const members = group.items.map((id) => byId.get(id)).filter((i): i is ItemDoc => !!i && !grouped.has(i.id));
    if (!members.length) continue;
    members.forEach((i) => grouped.add(i.id));
    // a sheet never mixes materials: nest each material on its own sheets
    const buckets = new Map<string, Unit[]>();
    const pushUnit = (mat: string, unit: Unit) => {
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat)!.push(unit);
    };
    if (group.kind === 'pair') {
      // a pair is one atomic unit — except across materials, which must split
      const mats = new Map<string, PartMm[]>();
      for (const item of members) {
        for (let c = 0; c < copiesOf(item); c++) {
          for (const part of byZ(item.parts)) {
            const pm = partMm(item, part);
            if (!mats.has(part.material)) mats.set(part.material, []);
            mats.get(part.material)!.push(pm);
          }
        }
      }
      for (const [mat, pms] of mats) pushUnit(mat, { pms });
    } else {
      for (const item of members) {
        for (let c = 0; c < copiesOf(item); c++) {
          for (const part of byZ(item.parts)) pushUnit(part.material, { pms: [partMm(item, part)] });
        }
      }
    }
    let k = 0;
    for (const [mat, units] of buckets) {
      // pairs pack atomically (a pair that doesn't fit starts a fresh sheet); sets spill via the shelf
      const runs: PartMm[][] = [];
      if (group.kind === 'pair') {
        let current: PartMm[] = [];
        const flush = () => { if (current.length) { runs.push(current); current = []; } };
        for (const u of units) {
          const trial = [...current, ...u.pms];
          const t = nestParts(trial.map((p, i) => ({ id: `t${i}`, wMm: p.wMm, hMm: p.hMm })), area, profile.spacingMm);
          if (t.sheets.length <= 1) current = trial;
          else { flush(); current = [...u.pms]; }
        }
        flush();
      } else {
        runs.push(units.flatMap((u) => u.pms));
      }
      for (const run of runs) {
        const nested = nestParts(run.map((p, i) => ({ id: `p${i}`, wMm: p.wMm, hMm: p.hMm })), area, profile.spacingMm);
        for (const ns of nested.sheets) {
          k++;
          const placements: Placement[] = [];
          const passes: Pass[] = [];
          let right = 0, bottom = 0;
          for (const np of ns.placements) {
            const pm = run[Number(np.id.slice(1))];
            const at: [number, number] = [m + np.xMm, m + np.yMm];
            placements.push({ partId: pm.part.id, itemId: pm.item.id, at, rotateDeg: 0 });
            passes.push(...passesFor(pm, at));
            right = Math.max(right, at[0] + pm.wMm); bottom = Math.max(bottom, at[1] + pm.hMm);
          }
          sheets.push({
            id: `${group.id}:${k}`,
            n: nextN(),
            material: mat, colour: run[0].part.colour,
            board: { ...profile.board },
            sizeMm: [right + m, bottom + m],
            placements, passes,
            name: k > 1 ? `${group.name} ${k}` : group.name,
          });
        }
      }
    }
  }
  planParts(craft, profile, sheets, nextN, new Set(craft.items.map((i) => i.id).filter((id) => !grouped.has(id))));
}

/** given layout: a kit's parts stay where drawn (frame origin = sheet corner); other items lay out one part per sheet */
function planGiven(craft: CraftDoc, profile: CutProfile, sheets: Sheet[], nextN: () => number): void {
  const single = craft.items.length === 1;
  const rest = new Set<Id>();
  for (const item of craft.items) {
    if (item.build !== 'assembly') { rest.add(item.id); continue; }
    const qty = copiesOf(item);
    for (const part of byZ(item.parts)) {
      const pm = partMm(item, part);
      for (let copy = 1; copy <= qty; copy++) {
        const at: [number, number] = [pm.minX, pm.minY];
        const name = single || part.name === item.name ? part.name : `${item.name} · ${part.name}`;
        sheets.push({
          id: qty > 1 ? `${part.id}:${copy}` : part.id,
          n: nextN(),
          material: part.material, colour: part.colour,
          board: { ...profile.board },
          sizeMm: [item.frame.size[0] / item.frame.pxPerMm, item.frame.size[1] / item.frame.pxPerMm],
          placements: [{ partId: part.id, itemId: item.id, at, rotateDeg: 0 }],
          passes: passesFor(pm, at),
          forStep: { itemId: item.id, z: part.z },
          name: qty > 1 ? `${name} (${copy} of ${qty})` : name,
        });
      }
    }
  }
  if (rest.size) planParts(craft, profile, sheets, nextN, rest);
}

/** a warning dimension: whole when whole, one decimal otherwise */
const dim = (v: number): string => String(Math.round(v * 10) / 10);

/** nest layout: every part grid-packed onto as few boards as possible (pairs atomic, materials split) */
function planNest(craft: CraftDoc, profile: CutProfile, sheets: Sheet[], nextN: () => number): void {
  const m = profile.marginMm;
  const pairOf = new Map<Id, string>();
  for (const g of craft.groups) {
    if (g.kind === 'pair' && g.rule === 'same-sheet') for (const id of g.items) pairOf.set(id, g.id);
  }
  const inputs: NestInput[] = [];
  const pmOf = new Map<Id, PartMm>();
  for (const item of craft.items) {
    for (const part of byZ(item.parts)) {
      const pm = partMm(item, part);
      pmOf.set(part.id, pm);
      // the footprint is the cut outline at the origin (engravings ride along inside it)
      const cut = pm.ops.filter((o) => o.op.kind === 'cut').flatMap((o) => o.loops);
      const loopsMm = cut.map((l) => l.map(([x, y]) => [x - pm.minX, y - pm.minY] as Pt));
      inputs.push({
        partId: part.id, itemId: item.id, loopsMm, material: part.material, colour: part.colour, qty: copiesOf(item),
        ...(pairOf.has(item.id) ? { groupId: pairOf.get(item.id)!, keepTogether: true } : {}),
      });
    }
  }
  const nested = nestOnBoards(inputs, profile.board, { marginMm: m, spacingMm: profile.spacingMm });
  const perMat = new Map<string, number>();
  const letters = new Map<string, string>();
  for (const ns of nested.sheets) {
    const k = (perMat.get(ns.material) ?? 0) + 1;
    perMat.set(ns.material, k);
    if (!letters.has(ns.material)) letters.set(ns.material, String.fromCharCode(65 + letters.size));
    const placements: Placement[] = [];
    const passes: Pass[] = [];
    let right = 0, bottom = 0;
    for (const np of ns.placements) {
      const pm = pmOf.get(np.partId)!;
      // spin the part's loops about its origin, re-homed so the cut bbox min sits at the placement
      const r = (np.rotateDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      const spin = (loops: Pt[][]): Pt[][] => loops.map((l) => l.map(([x, y]) => [(x - pm.minX) * c - (y - pm.minY) * s, (x - pm.minX) * s + (y - pm.minY) * c] as Pt));
      const cut = spin(pm.ops.filter((o) => o.op.kind === 'cut').flatMap((o) => o.loops));
      const spun = pm.ops.map((o) => ({ op: o.op, loops: spin(o.loops) }));
      const anchor = cut.length ? cut : spun.flatMap((o) => o.loops);
      let nx = 0, ny = 0;
      if (anchor.some((l) => l.length)) {
        nx = Infinity; ny = Infinity;
        for (const l of anchor) for (const [x, y] of l) {
          if (x < nx) nx = x; if (y < ny) ny = y;
        }
      }
      const ops = spun.map((o) => ({ op: o.op, loops: o.loops.map((l) => l.map(([x, y]) => [x - nx, y - ny] as Pt)) }));
      const rot: PartMm = { ...pm, ops, minX: 0, minY: 0, wMm: 0, hMm: 0 };
      placements.push({ partId: np.partId, itemId: np.itemId, at: np.at, rotateDeg: np.rotateDeg });
      passes.push(...passesFor(rot, np.at));
      for (const o of ops) {
        for (const l of o.loops) {
          for (const [x, y] of l) {
            if (np.at[0] + x > right) right = np.at[0] + x;
            if (np.at[1] + y > bottom) bottom = np.at[1] + y;
          }
        }
      }
    }
    const n = nextN();
    const warnings: string[] = [];
    for (const np of ns.placements) {
      if (!np.oversize) continue;
      const w = dim(np.oversize.wMm), h = dim(np.oversize.hMm);
      const aw = dim(profile.board.wMm - 2 * m), ah = dim(profile.board.hMm - 2 * m);
      warnings.push(`Sheet ${letters.get(ns.material)}${k} (${w} × ${h} mm) is larger than the ${deviceShortName(profile.device)}'s ${aw} × ${ah} mm working area — scale it down or use a bigger board`);
    }
    sheets.push({
      id: `nest:${n}`,
      n,
      material: ns.material, colour: ns.colour,
      board: { ...profile.board },
      sizeMm: [right + m, bottom + m],
      placements, passes,
      name: `${ns.material} board ${k}`,
      ...(warnings.length ? { warnings } : {}),
    });
  }
}
