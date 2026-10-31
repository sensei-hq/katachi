import { describe, expect, it } from 'vitest';
import { profileFor } from '../cutplan/profiles';
import { planCut } from '../cutplan/plan';
import { craftOf, rect } from '../cutplan/fixtures';
import type { Pt } from '../geo';
import { sheetToDxf } from './dxf';

const cricut = () => profileFor('cricut', 'cardstock');
const disc = () => craftOf([{
  name: 'Disc', parts: [{ name: 'Disc', z: 0, ops: [
    { kind: 'engrave' as const, loops: [rect(20, 20, 10, 10)] },
    { kind: 'score' as const, loops: [[[30, 40], [50, 40]] as Pt[]] },
    { kind: 'cut' as const, loops: [rect(0, 0, 60, 60), rect(20, 20, 20, 20)] },
  ] }],
}]);

interface DxfPoly { layer: string; closed: boolean; verts: Pt[] }

/** minimal R12 reader: header vars, layer table, polyline entities */
const readDxf = (dxf: string): { vars: Map<string, string>; layers: Map<string, number>; polys: DxfPoly[] } => {
  const lines = dxf.split(/\r?\n/);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1].trim()]);
  const vars = new Map<string, string>(), layers = new Map<string, number>(), polys: DxfPoly[] = [];
  let section = '';
  for (let i = 0; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (code === '2' && pairs[i - 1]?.[1] === 'SECTION') section = val;
    if (section === 'HEADER' && code === '9') vars.set(val, pairs[i + 1][1]);
    if (code === '0' && val === 'LAYER' && section === 'TABLES') {
      let name = '', color = 0;
      for (let j = i + 1; j < pairs.length && pairs[j][0] !== '0'; j++) {
        if (pairs[j][0] === '2') name = pairs[j][1];
        if (pairs[j][0] === '62') color = Number(pairs[j][1]);
      }
      layers.set(name, color);
    }
    if (code === '0' && val === 'POLYLINE' && section === 'ENTITIES') {
      let layer = '', closed = false;
      const verts: Pt[] = [];
      for (let j = i + 1; j < pairs.length; j++) {
        const [c, v] = pairs[j];
        if (c === '0' && v === 'SEQEND') break;
        if (c === '8' && !verts.length && layer === '') layer = v;
        if (c === '70') closed = v === '1';
        if (c === '0' && v === 'VERTEX') verts.push([Number(pairs[j + 2][1]), Number(pairs[j + 3][1])]);
      }
      polys.push({ layer, closed, verts });
    }
  }
  return { vars, layers, polys };
};

describe('files dxf export', () => {
  it('R12 polylines on CUT/SCORE/ENGRAVE layers, mm units, closed flags, y flipped', () => {
    const [sheet] = planCut(disc(), cricut()).sheets;
    const { vars, layers, polys } = readDxf(sheetToDxf(sheet));
    expect(vars.get('$ACADVER')).toBe('AC1009');
    expect(vars.get('$INSUNITS')).toBe('4');
    expect([...layers.entries()].sort()).toEqual([['CUT', 1], ['ENGRAVE', 7], ['SCORE', 5]]);
    const byLayer = (l: string): DxfPoly[] => polys.filter((p) => p.layer === l);
    expect(byLayer('CUT').length).toBe(2);
    expect(byLayer('SCORE').length).toBe(1);
    expect(byLayer('ENGRAVE').length).toBe(1);
    expect(byLayer('CUT').every((p) => p.closed)).toBe(true);
    expect(byLayer('SCORE')[0].closed).toBe(false);
    expect(byLayer('ENGRAVE')[0].closed).toBe(true);
    // sheet y grows down, dxf y grows up: outline vertex (5,5) reads back (5,65)
    expect(byLayer('CUT')[1].verts[0]).toEqual([5, 65]);
    expect(byLayer('SCORE')[0].verts).toEqual([[35, 25], [55, 25]]);
    expect(sheetToDxf(sheet).trimEnd().endsWith('EOF')).toBe(true);
  });
  it('empty loops are skipped', () => {
    const dxf = sheetToDxf({ id: 's', n: 1, material: 'm', colour: 'c', board: { wMm: 10, hMm: 10 }, sizeMm: [10, 10], placements: [], passes: [{ opId: 'o', partId: 'p', kind: 'cut', shapesMm: [[]] }], name: 's' });
    expect(dxf).not.toContain('VERTEX');
  });
});
