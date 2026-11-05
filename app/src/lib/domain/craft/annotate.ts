// Project checks for the annotations page: what the maker should know before cutting. Pure over the craft:
// every layer outlined, names unique, everything on the board, nothing too small to cut.
import * as geo from '../geo';
import type { Pt } from '../geo';
import type { CraftDoc, ItemDoc, PartDoc } from './types';

export interface Annotation { text: string; status: 'pass' | 'warn' | 'info' }
/** the default board (matches the xTool profile) until the machine is selectable */
const BOARD_MM = 300;
/** below this at its smallest, a part may not cut cleanly */
const MIN_MM = 2;

const loopsOf = (p: PartDoc): Pt[][] => {
  try {
    return p.ops.filter((o) => o.kind === 'cut').flatMap((o) => geo.toLoops(o.geometry, 0.5));
  } catch {
    return [];
  }
};
const mmBox = (it: ItemDoc, loops: Pt[][]): { w: number; h: number } | null => {
  const pts = loops.flat();
  if (!pts.length || !(it.frame.pxPerMm > 0)) return null;
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { w: (Math.max(...xs) - Math.min(...xs)) / it.frame.pxPerMm, h: (Math.max(...ys) - Math.min(...ys)) / it.frame.pxPerMm };
};
const r1 = (n: number) => Math.round(n * 10) / 10;

export function annotate(doc: CraftDoc): Annotation[] {
  if (!doc.items.length) return [];
  const out: Annotation[] = [];
  const layers = doc.items.reduce((n, i) => n + i.parts.length, 0);
  out.push({ text: `${doc.items.length} item${doc.items.length === 1 ? '' : 's'} · ${layers} layer${layers === 1 ? '' : 's'}${doc.groups.length ? ` · ${doc.groups.length} set${doc.groups.length === 1 ? '' : 's'}` : ''}`, status: 'info' });
  const empty: string[] = [], big: string[] = [], small: string[] = [], dupes: string[] = [];
  for (const it of doc.items) {
    const seen = new Map<string, number>();
    for (const p of it.parts) {
      const loops = loopsOf(p);
      if (!loops.length) { empty.push(p.name); continue; }
      const box = mmBox(it, loops);
      if (box) {
        if (box.w > BOARD_MM || box.h > BOARD_MM) big.push(`“${p.name}” is ${r1(box.w)} × ${r1(box.h)} mm — bigger than the ${BOARD_MM} × ${BOARD_MM} mm board`);
        else if (Math.min(box.w, box.h) < MIN_MM) small.push(`“${p.name}” is ${r1(Math.min(box.w, box.h))} mm at its smallest — may not cut cleanly`);
      }
      const k = p.name.trim().toLowerCase();
      seen.set(k, (seen.get(k) ?? 0) + 1);
      if (seen.get(k) === 2) dupes.push(p.name);
    }
  }
  out.push(...(empty.length ? empty.map((n) => ({ text: `“${n}” has no outline to cut`, status: 'warn' as const })) : [{ text: 'Every layer has an outline', status: 'pass' as const }]));
  for (const n of dupes) out.push({ text: `“${n}” is used twice — rename one layer`, status: 'warn' });
  out.push(...(big.length ? big.map((text) => ({ text, status: 'warn' as const })) : [{ text: `Everything fits the ${BOARD_MM} × ${BOARD_MM} mm board`, status: 'pass' as const }]));
  out.push(...small.map((text) => ({ text, status: 'warn' as const })));
  return out;
}
