// All of a cut plan's sheets as one download: an SVG and a DXF per sheet, zipped (design/15 §5). Pure.
import { strToU8, zipSync } from 'fflate';
import type { CutPlan } from '../cutplan/types';
import { sheetToSvg } from './svg';
import { sheetToDxf } from './dxf';

/** a file name a maker's computer accepts: no slashes, no odd characters */
export const fileName = (s: string) => s.replace(/[^\p{L}\p{N} ._-]+/gu, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'sheet';

export function sheetFile(plan: CutPlan, n: number, format: 'svg' | 'dxf'): { name: string; mime: string; text: string } | null {
  const sheet = plan.sheets.find((s) => s.n === n);
  if (!sheet) return null;
  const base = `${String(n).padStart(2, '0')} ${fileName(sheet.name)}`;
  return format === 'svg' ? { name: `${base}.svg`, mime: 'image/svg+xml', text: sheetToSvg(sheet) } : { name: `${base}.dxf`, mime: 'application/dxf', text: sheetToDxf(sheet) };
}

/** every sheet as SVG + DXF, in one zip */
export function planZip(plan: CutPlan, craftName: string): { name: string; bytes: Uint8Array } {
  const files: Record<string, Uint8Array> = {};
  for (const s of plan.sheets) for (const f of ['svg', 'dxf'] as const) { const x = sheetFile(plan, s.n, f)!; files[`${f}/${x.name}`] = strToU8(x.text); }
  return { name: `${fileName(craftName || 'katachi')} sheets.zip`, bytes: zipSync(files, { level: 6 }) };
}
