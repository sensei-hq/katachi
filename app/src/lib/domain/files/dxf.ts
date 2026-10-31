// Sheet files (task T5): DXF export as R12-strict ASCII (POLYLINE/VERTEX/SEQEND). Pure.
import type { Pt } from '../geo/types';
import type { Sheet } from '../cutplan/types';

const signedArea = (l: Pt[]): number => l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const f = (v: number): string => { const s = String(+v.toFixed(6)); return s === '-0' ? '0' : s; };

const LAYERS = [
  { kind: 'engrave', name: 'ENGRAVE', color: 7 },
  { kind: 'score', name: 'SCORE', color: 5 },
  { kind: 'cut', name: 'CUT', color: 1 },
] as const;

/** a sheet as AutoCAD R12 DXF in mm (POLYLINE entities; sheet y is flipped to y-up) */
export function sheetToDxf(sheet: Sheet): string {
  const H = sheet.sizeMm[1];
  const present = LAYERS.filter((l) => sheet.passes.some((p) => p.kind === l.kind));
  const L: string[] = [];
  const pair = (code: number | string, val: number | string): void => { L.push(String(code), String(val)); };
  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1009');
  pair(9, '$INSUNITS'); pair(70, 4);
  pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, present.length);
  for (const l of present) {
    pair(0, 'LAYER'); pair(2, l.name); pair(70, 0); pair(62, l.color); pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const l of present) {
    for (const p of sheet.passes.filter((x) => x.kind === l.kind)) {
      for (const loop of p.shapesMm) {
        if (!loop.length) continue;
        const last = loop[loop.length - 1];
        const pts = loop.length > 1 && loop[0][0] === last[0] && loop[0][1] === last[1] ? loop.slice(0, -1) : loop;
        pair(0, 'POLYLINE'); pair(8, l.name); pair(66, 1); pair(70, Math.abs(signedArea(pts)) > 1e-9 ? 1 : 0);
        for (const [x, y] of pts) {
          pair(0, 'VERTEX'); pair(8, l.name); pair(10, f(x)); pair(20, f(H - y)); pair(30, '0.0');
        }
        pair(0, 'SEQEND');
      }
    }
  }
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return L.join('\r\n') + '\r\n';
}
