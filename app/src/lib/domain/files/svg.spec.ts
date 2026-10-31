import { describe, expect, it } from 'vitest';
import { validate } from '../craft';
import { toLoops, type Pt } from '../geo';
import { profileFor } from '../cutplan/profiles';
import { planCut } from '../cutplan/plan';
import { craftOf, rect } from '../cutplan/fixtures';
import { sheetToSvg, svgToCraft } from './svg';

const cricut = () => profileFor('cricut', 'cardstock');
const ids = () => { let k = 0; return () => `n${++k}`; };
const disc = () => craftOf([{
  name: 'Disc', parts: [{ name: 'Disc', z: 0, ops: [
    { kind: 'engrave' as const, loops: [rect(20, 20, 10, 10)] },
    { kind: 'score' as const, loops: [[[30, 40], [50, 40]] as Pt[]] },
    { kind: 'cut' as const, loops: [rect(0, 0, 60, 60), rect(20, 20, 20, 20)] },
  ] }],
}]);

describe('files svg export', () => {
  it('mm units, kind groups in machine order, colours, Z, part groups', () => {
    const [sheet] = planCut(disc(), cricut()).sheets;
    const svg = sheetToSvg(sheet);
    expect(svg).toContain('width="70mm"');
    expect(svg).toContain('height="70mm"');
    expect(svg).toContain('viewBox="0 0 70 70"');
    expect(svg.indexOf('id="engrave"')).toBeLessThan(svg.indexOf('id="score"'));
    expect(svg.indexOf('id="score"')).toBeLessThan(svg.indexOf('id="cut"'));
    expect(svg).toContain('stroke="#FF0000"');
    expect(svg).toContain('stroke-width="0.1"');
    expect(svg).toContain('stroke="#0000FF"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('<path d="M 5 5 L 65 5 L 65 65 L 5 65 Z"/>');
    expect(svg).toContain('<path d="M 35 45 L 55 45"/>');
    expect(svg).toContain('<path d="M 25 25 L 35 25 L 35 35 L 25 35 Z"/>');
    expect(svg.match(/data-part="part0-0"/g)!.length).toBe(3);
  });
  it('empty sheet → bare svg, no groups', () => {
    const svg = sheetToSvg({ id: 's', n: 1, material: 'm', colour: 'c', board: { wMm: 10, hMm: 10 }, sizeMm: [0, 0], placements: [], passes: [], name: 's' });
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<g');
  });
  it('empty loops are skipped', () => {
    const svg = sheetToSvg({ id: 's', n: 1, material: 'm', colour: 'c', board: { wMm: 10, hMm: 10 }, sizeMm: [10, 10], placements: [], passes: [{ opId: 'o', partId: 'p', kind: 'cut', shapesMm: [[]] }], name: 's' });
    expect(svg).not.toContain('<path');
  });
});

describe('files svg import', () => {
  it('round trip: plan → svg → craft → plan keeps loops, kinds and part count', () => {
    const [sheet1] = planCut(disc(), cricut()).sheets;
    const craft2 = svgToCraft(sheetToSvg(sheet1), { name: 'RT', newId: ids() });
    expect(validate(craft2)).toEqual([]);
    expect(craft2.items.length).toBe(1);
    expect(craft2.items[0].parts.length).toBe(1);
    const [sheet2] = planCut(craft2, cricut()).sheets;
    expect(sheet2.passes.map((p) => p.kind)).toEqual(sheet1.passes.map((p) => p.kind));
    for (const kind of ['engrave', 'score', 'cut'] as const) {
      const a = sheet1.passes.filter((p) => p.kind === kind).flatMap((p) => p.shapesMm);
      const b = sheet2.passes.filter((p) => p.kind === kind).flatMap((p) => p.shapesMm);
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i].length).toBe(a[i].length);
        for (let j = 0; j < a[i].length; j++) {
          expect(b[i][j][0]).toBeCloseTo(a[i][j][0], 2);
          expect(b[i][j][1]).toBeCloseTo(a[i][j][1], 2);
        }
      }
    }
  });
  it('real-world svg: transformed group, rect, circle-with-hole path, blue score', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <g transform="translate(10,10) scale(2)">
        <rect x="0" y="0" width="10" height="10" fill="none" stroke="red"/>
        <path d="M 25,10 A 5,5 0 1,0 35,10 A 5,5 0 1,0 25,10 Z M 28,10 A 2,2 0 1,0 32,10 A 2,2 0 1,0 28,10 Z" fill="none" stroke="red"/>
        <path d="m 2,5 l 6,0" stroke="blue" fill="none"/>
      </g>
    </svg>`;
    const craft = svgToCraft(svg, { name: 'Kit', newId: ids() });
    expect(validate(craft)).toEqual([]);
    expect(craft.kind).toBe('3d');
    expect(craft.items[0].build).toBe('assembly');
    expect(craft.items[0].frame.tier).toBe('XL');
    expect(craft.items[0].parts.length).toBe(2);
    // drawing-mm positions, read off the craft (sheets re-home parts to the margin)
    const k = craft.items[0].frame.pxPerMm;
    const mm = (loops: Pt[][]): Pt[][] => loops.map((l) => l.map(([x, y]) => [x / k, y / k] as Pt));
    const box = (l: Pt[]): number[] => [Math.min(...l.map((p) => p[0])), Math.min(...l.map((p) => p[1])), Math.max(...l.map((p) => p[0])), Math.max(...l.map((p) => p[1]))];
    const [rectPart, circlePart] = craft.items[0].parts;
    const cut0 = mm(toLoops(rectPart.ops.find((o) => o.kind === 'cut')!.geometry))[0];
    for (const [i, v] of [10, 10, 30, 30].entries()) expect(box(cut0)[i]).toBeCloseTo(v, 1);
    const score = mm(toLoops(rectPart.ops.find((o) => o.kind === 'score')!.geometry))[0];
    expect(score.length).toBe(2);
    expect(score[0][0]).toBeCloseTo(14, 1);
    expect(score[0][1]).toBeCloseTo(20, 1);
    expect(score[1][0]).toBeCloseTo(26, 1);
    expect(score[1][1]).toBeCloseTo(20, 1);
    expect(circlePart.ops.find((o) => o.kind === 'score')).toBeUndefined();
    const circleCuts = mm(toLoops(circlePart.ops.find((o) => o.kind === 'cut')!.geometry));
    expect(circleCuts.length).toBe(2);
    const boxes = circleCuts.map(box);
    const outer = boxes.find((b) => b[2] - b[0] > 10)!, inner = boxes.find((b) => b[2] - b[0] < 10)!;
    for (const [i, v] of [60, 20, 80, 40].entries()) expect(outer[i]).toBeCloseTo(v, 1);
    for (const [i, v] of [66, 26, 74, 34].entries()) expect(inner[i]).toBeCloseTo(v, 1);
    const plan = planCut(craft, cricut());
    expect(plan.sheets.length).toBe(2);
  });
  it('units: mm, cm, in, default px and explicit override', () => {
    const unit = (svg: string, mmPerUnit?: number) => {
      const craft = svgToCraft(svg, { name: 'U', newId: ids(), ...(mmPerUnit === undefined ? {} : { mmPerUnit }) });
      const [sheet] = planCut(craft, cricut()).sheets;
      const loop = sheet.passes[0].shapesMm[0];
      return Math.max(...loop.map((p) => p[0])) - Math.min(...loop.map((p) => p[0]));
    };
    const r = '<rect x="0" y="0" width="100" height="100" fill="none" stroke="red"/>';
    expect(unit(`<svg width="100mm" viewBox="0 0 1000 1000">${r}</svg>`)).toBeCloseTo(10, 6);
    expect(unit(`<svg width="10cm" viewBox="0 0 100 100">${r}</svg>`)).toBeCloseTo(100, 6);
    expect(unit(`<svg width="1in" viewBox="0 0 96 96"><rect x="0" y="0" width="96" height="96" fill="none" stroke="red"/></svg>`)).toBeCloseTo(25.4, 6);
    expect(unit(`<svg><rect x="0" y="0" width="96" height="96" fill="none" stroke="red"/></svg>`)).toBeCloseTo(25.4, 6);
    expect(unit(`<svg>${r}</svg>`, 2)).toBeCloseTo(200, 6);
  });
  it('unit edge cases: px widths ignored, height-only, bad viewBox, bad numbers', () => {
    const unit = (svg: string) => {
      const craft = svgToCraft(svg, { name: 'U', newId: ids() });
      const [sheet] = planCut(craft, cricut()).sheets;
      const loop = sheet.passes[0].shapesMm[0];
      return Math.max(...loop.map((p) => p[0])) - Math.min(...loop.map((p) => p[0]));
    };
    const r96 = '<rect x="0" y="0" width="96" height="96" fill="none" stroke="red"/>';
    expect(unit(`<svg width="100px" viewBox="0 0 100 100">${r96}</svg>`)).toBeCloseTo(25.4, 6);
    expect(unit(`<svg width="." viewBox="0 0 100 100">${r96}</svg>`)).toBeCloseTo(25.4, 6);
    expect(unit(`<svg height="25.4mm" viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="none" stroke="red"/></svg>`)).toBeCloseTo(25.4, 6);
    expect(unit(`<svg width="100mm" viewBox="0 0 0 0">${r96}</svg>`)).toBeCloseTo(25.4, 6);
  });
});

describe('files svg import shapes', () => {
  it('polygon, polyline, circle, ellipse, rounded rect, matrix and rotate transforms', () => {
    const svg = `<svg width="100mm" viewBox="0 0 100 100">
      <polygon points="0,0 10,0 10,10 0,10" fill="none" stroke="red"/>
      <polyline points="2,2 8,2 8,8" fill="none" stroke="blue"/>
      <circle cx="50" cy="50" r="10" fill="none" stroke="red"/>
      <ellipse cx="80" cy="10" rx="5" ry="8" fill="none" stroke="red"/>
      <rect x="40" y="70" width="20" height="10" rx="5" fill="none" stroke="red"/>
      <g transform="matrix(1,0,0,1,70,70) skewX(30)"><rect x="0" y="0" width="10" height="10" fill="none" stroke="red"/></g>
      <g transform="rotate(90,30,75)"><rect x="20" y="70" width="20" height="10" fill="none" stroke="red"/></g>
      <g transform="rotate(180)"><rect x="-95" y="-95" width="5" height="5" fill="none" stroke="red"/></g>
    </svg>`;
    const craft = svgToCraft(svg, { name: 'S', newId: ids() });
    expect(validate(craft)).toEqual([]);
    expect(craft.items[0].parts.length).toBe(7);
    const sheets = planCut(craft, cricut()).sheets;
    const sizes = sheets.map((s) => {
      const loop = s.passes.find((p) => p.kind === 'cut')!.shapesMm[0];
      return [Math.max(...loop.map((p) => p[0])) - Math.min(...loop.map((p) => p[0])), Math.max(...loop.map((p) => p[1])) - Math.min(...loop.map((p) => p[1]))];
    });
    for (const [i, [w, h]] of [[10, 10], [20, 20], [10, 16], [20, 10], [10, 10], [10, 20], [5, 5]].entries()) {
      expect(sizes[i][0]).toBeCloseTo(w, 0);
      expect(sizes[i][1]).toBeCloseTo(h, 0);
    }
    // the polyline score landed in the polygon part
    expect(sheets[0].passes.some((p) => p.kind === 'score')).toBe(true);
    // matrix + rotate placements, read off the craft in mm
    const k = craft.items[0].frame.pxPerMm;
    const minOf = (part: number) => {
      const loop = toLoops(craft.items[0].parts[part].ops.find((o) => o.kind === 'cut')!.geometry)[0];
      return [Math.min(...loop.map((p) => p[0])) / k, Math.min(...loop.map((p) => p[1])) / k];
    };
    const [mx, my] = minOf(4);
    expect(mx).toBeCloseTo(70, 9);
    expect(my).toBeCloseTo(70, 9);
    const [rx, ry] = minOf(5);
    expect(rx).toBeCloseTo(25, 6);
    expect(ry).toBeCloseTo(65, 6);
  });
});

describe('files svg import paths', () => {
  it('H V C S Q T, relative, implicit lineto', () => {
    const svg = `<svg width="100mm" viewBox="0 0 100 100">
      <path d="M 0 0 H 10 V 10 H 0 Z" fill="none" stroke="red"/>
      <path d="M 20 20 C 25 20 25 30 30 30 S 40 30 40 40" fill="none" stroke="red"/>
      <path d="M 50 50 Q 55 50 55 55 T 55 65" fill="none" stroke="red"/>
      <path d="m 60 60 h 10 v 10 h -10 z" fill="none" stroke="red"/>
      <path d="M 80 80 L 85 80 85 85 80 85 Z" fill="none" stroke="red"/>
    </svg>`;
    const craft = svgToCraft(svg, { name: 'P', newId: ids() });
    expect(craft.items[0].parts.length).toBe(5);
    const sheets = planCut(craft, cricut()).sheets;
    const sizes = sheets.map((s) => {
      const loop = s.passes.find((p) => p.kind === 'cut')!.shapesMm[0];
      return [Math.max(...loop.map((p) => p[0])) - Math.min(...loop.map((p) => p[0])), Math.max(...loop.map((p) => p[1])) - Math.min(...loop.map((p) => p[1]))];
    });
    // closed outlines first, then open parts, each in document order
    for (const [i, [w, h]] of [[10, 10], [10, 10], [5, 5], [20, 20], [5, 15]].entries()) {
      expect(sizes[i][0]).toBeCloseTo(w, 0);
      expect(sizes[i][1]).toBeCloseTo(h, 0);
    }
  });
  it('arcs: degenerate, full ellipse, small radii, rotated, run-together flags', () => {
    const svg = `<svg width="100mm" viewBox="0 0 100 100">
      <path d="M 0 0 A 0 0 0 0 0 10 0" fill="none" stroke="red"/>
      <path d="M 20 10 A 5 5 0 1 1 20 10 Z" fill="none" stroke="red"/>
      <path d="M 0 30 A 2 2 0 0 0 20 30" fill="none" stroke="red"/>
      <path d="M 40 40 A 10 5 45 0 1 50 50" fill="none" stroke="red"/>
      <path d="M 60 60 A 5 5 0 00 65 60" fill="none" stroke="red"/>
    </svg>`;
    const craft = svgToCraft(svg, { name: 'A', newId: ids() });
    expect(craft.items[0].parts.length).toBe(5);
    const k = craft.items[0].frame.pxPerMm;
    const boxes = craft.items[0].parts.map((p) => {
      const loop = toLoops(p.ops.find((o) => o.kind === 'cut')!.geometry)[0].map(([x, y]) => [x / k, y / k] as Pt);
      return [Math.min(...loop.map((q) => q[0])), Math.min(...loop.map((q) => q[1])), Math.max(...loop.map((q) => q[0])), Math.max(...loop.map((q) => q[1]))];
    });
    // the closed full ellipse sorts first, then the open arcs in document order
    for (const [i, v] of [15, 5, 25, 15].entries()) expect(boxes[0][i]).toBeCloseTo(v, 0);
    expect(boxes[1][2] - boxes[1][0]).toBeCloseTo(10, 6);
    expect(boxes[1][3] - boxes[1][1]).toBe(0);
    expect(boxes[2][2] - boxes[2][0]).toBeCloseTo(20, 6);
    expect(boxes[2][3] - boxes[2][1]).toBeCloseTo(10, 0);
    for (const [x, y] of [[40, 40], [50, 50]]) {
      expect(boxes[3][0]).toBeLessThanOrEqual(x + 0.01);
      expect(boxes[3][2]).toBeGreaterThanOrEqual(x - 0.01);
      expect(boxes[3][1]).toBeLessThanOrEqual(y + 0.01);
      expect(boxes[3][3]).toBeGreaterThanOrEqual(y - 0.01);
    }
    expect(boxes[4][0]).toBeCloseTo(60, 6);
    expect(boxes[4][2]).toBeCloseTo(65, 0);
  });
  it('implicit lineto after M, empty arcs, reversed sweep', () => {
    const svg = `<svg width="100mm" viewBox="0 0 100 100">
      <path d="M 70 70 80 70 80 80 Z" fill="none" stroke="red"/>
      <path d="M 0 70 A 5 5 0 0 0 0 70 L 10 70" fill="none" stroke="red"/>
      <path d="M 50 55 A 10 5 45 0 1 40 55" fill="none" stroke="red"/>
    </svg>`;
    const craft = svgToCraft(svg, { name: 'I', newId: ids() });
    expect(craft.items[0].parts.length).toBe(3);
    const k = craft.items[0].frame.pxPerMm;
    const boxes = craft.items[0].parts.map((p) => {
      const loop = toLoops(p.ops.find((o) => o.kind === 'cut')!.geometry)[0].map(([x, y]) => [x / k, y / k] as Pt);
      return [Math.min(...loop.map((q) => q[0])), Math.min(...loop.map((q) => q[1])), Math.max(...loop.map((q) => q[0])), Math.max(...loop.map((q) => q[1]))];
    });
    for (const [i, v] of [70, 70, 80, 80].entries()) expect(boxes[0][i]).toBeCloseTo(v, 6);
    expect(boxes[1][0]).toBeCloseTo(0, 6);
    expect(boxes[1][2]).toBeCloseTo(10, 6);
    expect(boxes[2][0]).toBeLessThanOrEqual(40.01);
    expect(boxes[2][2]).toBeGreaterThanOrEqual(49.99);
  });
  it('ragged path data never throws', () => {
    const svg = `<svg width="100mm" viewBox="0 0 100 100">
      <path d="M 10" fill="none" stroke="red"/>
      <path d="L 10 10" fill="none" stroke="red"/>
      <path d="Z M 0 0 L 5 5" fill="none" stroke="red"/>
      <path d="M 0 0 M 10 10 L 20 20" fill="none" stroke="red"/>
    </svg>`;
    const craft = svgToCraft(svg, { name: 'R', newId: ids() });
    expect(validate(craft)).toEqual([]);
    expect(craft.items[0].parts.length).toBe(3);
  });
});

describe('files svg import paint', () => {
  it('inheritance, style precedence, named/rgb/unknown colours, orphans, slits', () => {
    const svg = `<svg width="100mm" viewBox="0 0 100 100">
      <rect x="0" y="0" width="40" height="40" fill="none" stroke="red"/>
      <path d="M 5 5 L 15 5" fill="none" stroke="blue"/>
      <rect x="20" y="20" width="8" height="8" fill="none" stroke="black"/>
      <rect x="20" y="8" width="8" height="8" fill="none" stroke="#1234"/>
      <rect x="8" y="20" width="8" height="8" fill="black" stroke="none"/>
      <path d="M 5 35 L 15 35" fill="none" stroke="red"/>
      <rect x="50" y="0" width="10" height="10" fill="none" stroke="rgb(255,0,0)"/>
      <rect x="50" y="20" width="10" height="10" fill="none" stroke="#f00"/>
      <rect x="70" y="0" width="10" height="10" fill="none" stroke="chartreuse"/>
      <rect x="70" y="20" width="10" height="10" fill="red" stroke="#008000" style="fill:none;blah"/>
      <path d="M 50 50 L 60 50" fill="none" stroke="rgb(0%,0%,100%)"/>
      <g stroke="red" fill="none"><rect x="0" y="50" width="10" height="10"/></g>
      <rect x="20" y="50" width="10" height="10"/>
      <path d="M 50 70 L 60 70" fill="none" stroke="red"/>
      <rect x="70" y="50" width="10" height="10" fill="none" stroke="rgb(1,2)"/>
    </svg>`;
    const craft = svgToCraft(svg, { name: 'C', newId: ids() });
    expect(validate(craft)).toEqual([]);
    // outer + rgb + #f00 + chartreuse + style-precedence + inherited + open cut + bad rgb; orphans dropped
    expect(craft.items[0].parts.length).toBe(8);
    const [sheet0] = planCut(craft, cricut()).sheets;
    expect(sheet0.passes.filter((p) => p.kind === 'cut').length).toBe(2);
    expect(sheet0.passes.filter((p) => p.kind === 'score').length).toBe(1);
    expect(sheet0.passes.find((p) => p.kind === 'engrave')!.shapesMm.length).toBe(3);
  });
});

describe('files svg import edges', () => {
  it('comments, doctype, entities, namespaces, skipped elements, stray tags', () => {
    const svg = `<?xml version="1.0"?><!DOCTYPE svg><svg width="100mm" viewBox="0 0 100 100"><!-- hi --><svg:g><rect x='0' y='0' width='10' height='10' fill='none' stroke='red' id='a&amp;b&#65;&#x42;'/><></svg:g></oops><defs><rect x="50" y="50" width="10" height="10" fill="none" stroke="red"/></defs><use href="#x"/><text>hi</text></svg>`;
    const craft = svgToCraft(svg, { name: 'E', newId: ids() });
    expect(craft.items[0].parts.length).toBe(1);
    const k = craft.items[0].frame.pxPerMm;
    const loop = toLoops(craft.items[0].parts[0].ops[0].geometry)[0].map(([x, y]) => [x / k, y / k] as Pt);
    expect(Math.max(...loop.map((p) => p[0]))).toBeCloseTo(10, 6);
  });
  it('nested svg x/y shifts content', () => {
    const craft = svgToCraft('<svg width="100mm" viewBox="0 0 100 100"><svg x="10" y="10"><rect x="0" y="0" width="10" height="10" fill="none" stroke="red"/></svg></svg>', { name: 'N', newId: ids() });
    const k = craft.items[0].frame.pxPerMm;
    const loop = toLoops(craft.items[0].parts[0].ops[0].geometry)[0].map(([x, y]) => [x / k, y / k] as Pt);
    expect(Math.min(...loop.map((p) => p[0]))).toBeCloseTo(10, 6);
    expect(Math.min(...loop.map((p) => p[1]))).toBeCloseTo(10, 6);
  });
  it('empty svg → empty item; missing root throws', () => {
    const craft = svgToCraft('<svg/>', { name: 'E', newId: ids() });
    expect(validate(craft)).toEqual([]);
    expect(craft.items[0].parts).toEqual([]);
    expect(() => svgToCraft('<div/>', { name: 'X', newId: ids() })).toThrow('no <svg> root');
    expect(() => svgToCraft('<svg', { name: 'X', newId: ids() })).toThrow('no <svg> root');
  });
  it('zero-size shapes and short point lists are skipped', () => {
    const svg = `<svg width="100mm" viewBox="0 0 100 100">
      <rect x="0" y="0" width="0" height="10" fill="none" stroke="red"/>
      <circle cx="50" cy="50" r="0" fill="none" stroke="red"/>
      <polyline points="0 0 10" fill="none" stroke="blue"/>
      <rect x="0" y="0" width="10" height="10" fill="none" stroke="red"/>
    </svg>`;
    expect(svgToCraft(svg, { name: 'Z', newId: ids() }).items[0].parts.length).toBe(1);
  });
});
