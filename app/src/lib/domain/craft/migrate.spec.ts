import { describe, expect, it } from 'vitest';
import { migrateV1, type V1Snapshot } from './migrate';
import { indexCraft, layersOf, prune, tierFor, frameSize, validate } from './index';
import { bbox } from '../geo';

const ids = () => { let k = 0; return () => `id${++k}`; };
const project = { id: 'c1', name: 'Test', createdAt: 1, updatedAt: 2, kind: 'flat' };
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const L = (n: number, name: string, regionId: string, extra: Partial<NonNullable<V1Snapshot['stack']>[number]> = {}) => ({ n, name, colour: '#C89B6A', material: 'cardstock', visiblePct: 20, hiddenPct: 5, regionId, ...extra });

describe('v1 → v2 migration', () => {
  it('the cat: one item, four parts back to front, each a cut of its whole sheet', () => {
    const snap: V1Snapshot = { subject: 'black cat wall art', build: 'stacked', aspect: 1, widthMm: 400,
      regionList: [0, 1, 2, 3].map((i) => ({ id: `r${i}`, name: `R${i}`, paths: [rect(100 + i * 20, 100 + i * 20, 400, 400)], cutPaths: [rect(100, 100, 600, 600)] })),
      stack: ['Gold Backer', 'Black Cat', 'Red Leaf', 'White Petals'].map((n, i) => L(i + 1, n, `r${i}`)) };
    const d = migrateV1(project, snap, ids());
    expect(validate(d)).toEqual([]);
    expect(d.kind).toBe('layered');
    expect(d.items).toHaveLength(1);
    expect(d.items[0].parts.map((p) => [p.name, p.z, p.ops.map((o) => o.kind)])).toEqual([['Gold Backer', 0, ['cut']], ['Black Cat', 1, ['cut']], ['Red Leaf', 2, ['cut']], ['White Petals', 3, ['cut']]]);
    // 600 photo units of a 400 mm wide photo = 240 mm → tier L; the frame covers the art at 1024 px
    expect(d.items[0].frame.tier).toBe('L');
    expect(d.items[0].frame.size).toEqual([1024, 1024]);
    expect(d.items[0].frame.pxPerMm).toBeCloseTo(1024 / 240, 3);
    // stacked: every layer's sheet is its whole outline (what shows + what sits under the layers in front)
    expect(bbox(d.items[0].parts[2].ops[0].geometry)).toEqual({ x: 0, y: 0, w: 1024, h: 1024 });
    expect(d.items[0].parts[1].measured).toEqual({ visiblePct: 20, hiddenPct: 5 });
  });
  it('bookmarks: one item each; the cut (with its holes) and the engraving are one part, engraving first; turned upright', () => {
    const tilted: [number, number][] = [[100, 100], [200, 80], [300, 700], [200, 720]];
    const snap: V1Snapshot = { aspect: 1.25, widthMm: 300,
      regionList: [{ id: 'a', name: 'Fox', paths: [tilted], holes: [rect(180, 300, 40, 40)] }, { id: 'a-e', name: 'Fox eng', paths: [rect(190, 400, 20, 20)] }, { id: 'b', name: 'Owl', paths: [rect(600, 100, 100, 600)] }],
      stack: [L(1, 'Fox bookmark · cut', 'a', { itemName: 'Fox bookmark', role: 'cut', material: '3 mm birch' }), L(2, 'Fox bookmark · engraving', 'a-e', { itemName: 'Fox bookmark', role: 'engrave' }), L(3, 'Owl bookmark · cut', 'b', { itemName: 'Owl bookmark', role: 'cut' })] };
    const d = migrateV1(project, snap, ids());
    expect(validate(d)).toEqual([]);
    expect(d.kind).toBe('items');
    expect(d.items.map((i) => [i.name, i.parts.length, i.parts[0].ops.map((o) => o.kind)])).toEqual([['Fox bookmark', 1, ['engrave', 'cut']], ['Owl bookmark', 1, ['cut']]]);
    const fox = d.items[0];
    expect(fox.parts[0].name).toBe('Fox bookmark');
    expect(fox.parts[0].material).toBe('3 mm birch');
    // the cut keeps its hole (2 loops), the frame is the bookmark's own box at tier M
    expect(fox.parts[0].ops[1].geometry.paths).toHaveLength(2);
    expect(fox.frame.tier).toBe('M');
    expect(Math.max(...fox.frame.size)).toBe(512);
    expect(Math.abs(fox.frame.fromSource.rotateDeg)).toBeGreaterThan(5);
    expect(d.items[1].frame.fromSource.rotateDeg).toBe(0);
  });
  it('earrings: left and right of the same design become a pair (cut together)', () => {
    const names = ['Swirl drop left', 'Swirl drop right', 'Mandala circle left', 'Mandala circle right', 'Leaf'];
    const snap: V1Snapshot = { aspect: 1, widthMm: 400, regionList: names.map((n, i) => ({ id: `r${i}`, name: n, paths: [rect(50 + i * 150, 100, 100, 150)] })), stack: names.map((n, i) => L(i + 1, `${n} · cut`, `r${i}`, { itemName: n, role: 'cut' })) };
    const d = migrateV1(project, snap, ids());
    expect(d.groups.map((g) => [g.name, g.kind, g.items.map((id) => d.items.find((i) => i.id === id)!.name)])).toEqual([['Swirl drop', 'pair', ['Swirl drop left', 'Swirl drop right']], ['Mandala circle', 'pair', ['Mandala circle left', 'Mandala circle right']]]);
    expect(d.items[0].frame.tier).toBe('S');
    expect(validate(d)).toEqual([]);
    // removing an earring drops its pair (a pair of one is no pair)
    const pruned = prune({ ...d, items: d.items.filter((i) => i.name !== 'Swirl drop right') });
    expect(pruned.groups.map((g) => g.name)).toEqual(['Mandala circle']);
  });
  it('earrings named "earring 1…6" (live Spark): neighbours of the same size and cut area are paired; bookmarks never', () => {
    const sizes = [[100, 150], [100, 150], [80, 160], [82, 158], [120, 120], [60, 140]];
    const names = sizes.map((_, i) => `top row earring ${i + 1}`);
    const snap = (subject: string): V1Snapshot => ({ subject, aspect: 1, widthMm: 400, regionList: names.map((n, i) => ({ id: `r${i}`, name: n, paths: [rect(20 + i * 160, 100, sizes[i][0], sizes[i][1])] })), stack: names.map((n, i) => L(i + 1, `${n} · cut`, `r${i}`, { itemName: n, role: 'cut' })) });
    const d = migrateV1(project, snap('28 laser-cut wooden earrings'), ids());
    expect(d.groups.map((g) => [g.name, g.items.map((id) => d.items.find((i) => i.id === id)!.name)])).toEqual([['Pair 1', ['top row earring 1', 'top row earring 2']], ['Pair 2', ['top row earring 3', 'top row earring 4']]]);
    expect(validate(d)).toEqual([]);
    expect(migrateV1(project, snap('five wooden bookmarks'), ids()).groups).toEqual([]);
  });
  it('the castle kit: one item whose parts are the layout sheets (engraving + cut), in mm × px', () => {
    const sheet = (name: string) => ({ name, cut: [rect(10, 10, 100, 50)], engrave: [rect(20, 20, 10, 10)], sizeMm: [300, 300] as [number, number] });
    const snap: V1Snapshot = { subject: 'castle kit', plan: [sheet('A1'), sheet('A2')], stack: [L(1, 'A1 · engrave', '', { planSheet: 0, role: 'engrave' }), L(2, 'A1 · cut', '', { planSheet: 0, role: 'cut', material: '3 mm ply' })] };
    const d = migrateV1(project, snap, ids());
    expect(d.kind).toBe('3d');
    expect(d.items[0].parts.map((p) => [p.name, p.ops.map((o) => o.kind)])).toEqual([['Sheet A1', ['engrave', 'cut']], ['Sheet A2', ['engrave', 'cut']]]);
    expect(d.items[0].frame.pxPerMm).toBeCloseTo(2048 / 300, 3);
    expect(bbox(d.items[0].parts[0].ops[1].geometry)!.w).toBeCloseTo(100 * (2048 / 300), 1);
    expect(d.sources.map((s) => s.kind)).toEqual(['photo', 'kit-layout']);
  });
  it('an empty craft migrates to no items', () => {
    expect(migrateV1(project, {}, ids()).items).toEqual([]);
  });
});

describe('the tree helpers', () => {
  it('index, layers in display order, tiers and frame sizes', () => {
    const snap: V1Snapshot = { aspect: 1, widthMm: 100, regionList: [{ id: 'r', name: 'R', paths: [rect(0, 0, 500, 1000)] }], stack: [L(1, 'Only', 'r')] };
    const d = migrateV1(project, snap, ids());
    const ix = indexCraft(d);
    const part = d.items[0].parts[0];
    expect(ix.get(part.id)?.kind).toBe('part');
    expect(ix.get(part.ops[0].id)).toMatchObject({ kind: 'op', part: { id: part.id } });
    expect(layersOf(d).map((l) => l.part.name)).toEqual(['Only']);
    expect([tierFor(40), tierFor(150), tierFor(300), tierFor(900)]).toEqual(['S', 'M', 'L', 'XL']);
    expect(frameSize('M', 50, 180)).toEqual([142, 512]);
    expect(frameSize('S', 60, 60)).toEqual([256, 256]);
  });
  it('validate reports duplicates, dangling groups and joins across items', () => {
    const snap: V1Snapshot = { aspect: 1, widthMm: 300, regionList: [{ id: 'a', name: 'A', paths: [rect(0, 0, 100, 100)] }, { id: 'b', name: 'B', paths: [rect(200, 0, 100, 100)] }], stack: [L(1, 'A', 'a', { itemName: 'A' }), L(2, 'B', 'b', { itemName: 'B' })] };
    const d = migrateV1(project, snap, ids());
    const bad = { ...d, groups: [{ id: 'g', name: 'G', kind: 'set' as const, items: ['nope'], rule: 'none' as const }], items: [{ ...d.items[0], joins: [{ id: 'j', a: d.items[0].parts[0].id, b: d.items[1].parts[0].id, type: 'tab' as const }] }, { ...d.items[1], id: d.items[0].id }] };
    const errs = validate(bad);
    expect(errs.some((e) => e.startsWith('duplicate id'))).toBe(true);
    expect(errs.some((e) => e.includes('missing item'))).toBe(true);
    expect(errs.some((e) => e.includes('outside'))).toBe(true);
  });
});
