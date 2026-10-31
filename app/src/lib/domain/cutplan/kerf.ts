// Kerf compensation (task T6): cut passes move half the beam so parts come out the drawn size. Pure.
import { depths, fromLoops, offset, toLoops, type Pt } from '../geo';
import type { Id } from '../craft/types';
import type { Pass, Sheet } from './types';

const fmt = (v: number): string => String(+v.toFixed(3));

/** every cut loop offset by half the kerf (outlines grow, holes shrink); holes too small to cut drop with a warning */
export function withKerf(sheet: Sheet, kerfMm: number, partNames?: Map<Id, string>): Sheet {
  if (!(kerfMm > 0)) return sheet;
  const half = kerfMm / 2;
  const nameOf = (partId: Id): string => partNames?.get(partId) ?? sheet.name;
  const warnings = [...(sheet.warnings ?? [])];
  // depth comes from the part's own cut loops on this sheet (outlines even, holes odd)
  const cutLoopsOf = new Map<Id, Pt[][]>();
  for (const p of sheet.passes) {
    if (p.kind !== 'cut') continue;
    if (!cutLoopsOf.has(p.partId)) cutLoopsOf.set(p.partId, []);
    cutLoopsOf.get(p.partId)!.push(...p.shapesMm);
  }
  const depthOf = new Map<Id, number[]>();
  for (const [partId, loops] of cutLoopsOf) depthOf.set(partId, depths(fromLoops(loops)));
  const seen = new Map<Id, number>();
  const passes: Pass[] = [];
  for (const p of sheet.passes) {
    if (p.kind !== 'cut') { passes.push(p); continue; }
    const ds = depthOf.get(p.partId) ?? [];
    const shapes: Pt[][] = [];
    for (const loop of p.shapesMm) {
      const idx = seen.get(p.partId) ?? 0;
      seen.set(p.partId, idx + 1);
      const grown = toLoops(offset(fromLoops([loop]), (ds[idx] ?? 0) % 2 === 0 ? half : -half));
      if (!grown.length) {
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const [x, y] of loop) {
          if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y;
        }
        const size = Math.min(x2 - x1, y2 - y1);
        warnings.push(`a ${fmt(size)} mm hole in ${nameOf(p.partId)} can't be cut with a ${fmt(kerfMm)} mm kerf`);
        continue;
      }
      shapes.push(...grown);
    }
    if (shapes.length) passes.push({ ...p, shapesMm: shapes });
  }
  return warnings.length || sheet.warnings ? { ...sheet, passes, warnings } : { ...sheet, passes };
}
