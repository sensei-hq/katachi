// Until every screen reads the craft (task L3), the craft is written back into the shapes the screens read today
// (LayerFlowState's layers and regions, 0-1000 photo units). Rows and ids match migrateV1, so reading the result
// back gives the same craft, and one history covers both.
import { toLoops, type Geometry } from '../geo';
import type { Pt } from '../toolpath';
import type { CraftDoc, ItemDoc } from './types';
import { rowsOf } from './index';

type Loops = [number, number][][];
export interface FlowLayer { n: number; name: string; shapes: ['sky']; colour: string; material: string; visiblePct: number; hiddenPct: number; regionId: string; itemName?: string; role?: 'cut' | 'engrave'; tune?: { detail: number; weight: number }; /** the item's frame is flipped over (e2e `data-flipped` hook; views don't mirror yet) */ flipped?: boolean }
export interface FlowRegion { id: string; name: string; pct: number; note: string; tone: 'ok' | 'ink'; keep: boolean; paths: Loops; cutPaths?: Loops; holes?: Loops; colour: string; itemId?: string; itemName?: string; role?: 'cut' | 'engrave' }

const inside = ([x, y]: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** a frame's loops in photo units, split into outlines (even depth) and holes (odd depth) */
function toPhoto(g: Geometry, item: ItemDoc): { outer: Loops; holes: Loops } {
  const { box } = item.frame.fromSource, [w, h] = item.frame.size;
  // curves (a smoothed outline) are flattened to half a photo unit — the screens' own precision — not to
  // half a frame pixel, which on an XL frame is ten times the points every layer view then has to draw and measure
  const tol = Math.max(0.5, (0.5 * w) / Math.max(box.w, 1e-6));
  const loops = toLoops(g, tol).map((l) => l.map(([x, y]) => [Math.round((box.x + (x / w) * box.w) * 10) / 10, Math.round((box.y + (y / h) * box.h) * 10) / 10] as [number, number])
    .filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]));
  const outer: Loops = [], holes: Loops = [];
  loops.forEach((l, i) => { const depth = loops.filter((o, j) => j !== i && o.length > 2 && inside(l[0], o)).length; (depth % 2 ? holes : outer).push(l); });
  return { outer, holes };
}

export function craftToFlow(doc: CraftDoc): { stack: FlowLayer[]; regionList: FlowRegion[] } {
  const separate = doc.kind === 'items', stack: FlowLayer[] = [], regionList: FlowRegion[] = [];
  for (const row of rowsOf(doc)) {
    const { item, part, op } = row, measured = part.measured;
    const id = op ? (op.id === `${part.id}:engrave` ? `p:${part.id}:e` : `p:${part.id}:${op.id}`) : `p:${part.id}`;
    const geom = op?.geometry ?? part.ops.find((o) => o.kind === 'cut')?.geometry ?? part.ops[0]?.geometry ?? { paths: [] };
    const { outer, holes } = toPhoto(geom, item);
    const shows = !op && part.shows ? toPhoto(part.shows, item).outer : undefined;
    const role = separate ? row.role : !part.ops.some((o) => o.kind === 'cut') ? 'engrave' : undefined;
    regionList.push({ id, name: row.name, pct: row.shows, note: '', tone: op ? 'ink' : 'ok', keep: true, colour: op ? '#5A3A22' : part.colour,
      ...(separate ? { paths: op ? [...outer, ...holes] : outer, ...(holes.length && !op ? { holes } : {}), itemId: item.id, itemName: item.name, role: row.role }
        : shows ? { paths: shows, cutPaths: outer.concat(holes) } : { paths: outer.concat(holes), ...(role ? { role } : {}) }) });
    stack.push({ n: row.n, name: row.name.replace(/ · cut$/, separate ? ' · cut' : ''), shapes: ['sky'], colour: op ? '#5A3A22' : part.colour, material: part.material, visiblePct: row.shows, hiddenPct: measured?.hiddenPct ?? 0, regionId: id,
      ...((item.frame.flipX || item.frame.flipY) ? { flipped: true } : {}),
      ...(separate ? { itemName: item.name, role: row.role } : role ? { role } : {}), ...(measured?.tune && !op ? { tune: measured.tune } : {}) });
  }
  return { stack, regionList };
}
