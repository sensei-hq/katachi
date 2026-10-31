import { describe, expect, it } from 'vitest';
import type { Pt } from '../geo';
import { migrateV1, type V1Project, type V1Snapshot } from '../craft/migrate';
import { profileFor } from './profiles';
import { craftOf, rect } from './fixtures';
import { planCut } from './plan';

const cricut = () => profileFor('cricut', 'cardstock');
const bboxOf = (loops: Pt[][]): [number, number] => {
  const xs = loops.flat().map((p) => p[0]), ys = loops.flat().map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};
const signed = (l: Pt[]): number => l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

const catLike = () => craftOf([{
  name: 'Cat', parts: [
    { name: 'Tail', z: 2, ops: [{ kind: 'cut', loops: [rect(0, 0, 20, 20)] }] },
    { name: 'Back', z: 0, ops: [{ kind: 'cut', loops: [rect(0, 0, 20, 20)] }] },
    { name: 'Head', z: 3, ops: [{ kind: 'cut', loops: [rect(0, 0, 20, 20)] }] },
    { name: 'Body', z: 1, ops: [{ kind: 'cut', loops: [rect(0, 0, 20, 20)] }] },
  ],
}]);

describe('cutplan plan', () => {
  it('cat-like: 1 item x 4 parts cut only → 4 sheets, z order, bbox + margins', () => {
    const plan = planCut(catLike(), cricut());
    expect(plan.craftId).toBe('craft');
    expect(plan.profileId).toBe('cricut');
    expect(plan.craftRev).toBe(1);
    expect(plan.sheets.map((s) => s.name)).toEqual(['Back', 'Body', 'Tail', 'Head']);
    expect(plan.sheets.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    for (const s of plan.sheets) {
      expect(s.sizeMm).toEqual([30, 30]);
      expect(s.passes.map((p) => p.kind)).toEqual(['cut']);
      expect(s.forStep?.z).toBe(plan.sheets.indexOf(s));
    }
    expect(plan.sheets[0].id).toBe('part0-1');
  });
  it('bookmark-like: engrave, hole cut, outline cut — in both one-part and one-item layouts', () => {
    const bm = () => craftOf(['A', 'B'].map((name) => ({
      name, parts: [{ name: 'Front', z: 0, ops: [
        { kind: 'engrave' as const, loops: [rect(2, 2, 6, 6)] },
        { kind: 'cut' as const, loops: [rect(0, 0, 10, 10), rect(3, 3, 4, 4)] },
      ] }],
    })));
    for (const layout of ['one-part-per-sheet', 'one-item-per-sheet'] as const) {
      const plan = planCut(bm(), { ...cricut(), layout });
      expect(plan.sheets.length).toBe(2);
      for (const s of plan.sheets) {
        expect(s.passes.map((p) => p.kind)).toEqual(['engrave', 'cut', 'cut']);
        expect(bboxOf(s.passes[1].shapesMm)).toEqual([4, 4]);
        expect(bboxOf(s.passes[2].shapesMm)).toEqual([10, 10]);
      }
    }
    expect(planCut(bm(), cricut()).sheets[0].name).toBe('A · Front');
  });
  it('rotate: a 10x40 frame turned 90° → a 50x20 sheet', () => {
    const craft = craftOf([{
      name: 'Strip', frame: { size: [10, 40], fromSource: { rotateDeg: 90 } },
      parts: [{ name: 'P', z: 0, ops: [{ kind: 'cut', loops: [rect(0, 0, 10, 40)] }] }],
    }]);
    expect(planCut(craft, cricut()).sheets[0].sizeMm).toEqual([50, 20]);
  });
  it('flipX mirrors the passes and keeps the winding', () => {
    const tri: Pt[] = [[0, 0], [10, 0], [0, 10]];
    const craft = craftOf([{
      name: 'Tri', frame: { size: [10, 10], flipX: true },
      parts: [{ name: 'P', z: 0, ops: [{ kind: 'cut', loops: [tri] }] }],
    }]);
    const [loop] = planCut(craft, cricut()).sheets[0].passes[0].shapesMm;
    expect(new Set(loop.map((p) => p.join(',')))).toEqual(new Set(['15,5', '5,5', '15,15']));
    expect(Math.sign(signed(loop))).toBe(Math.sign(signed(tri)));
  });
  it('pair: two 30x60 earrings share one sheet, spacing respected, no overlap', () => {
    const craft = craftOf(
      ['Left', 'Right'].map((name) => ({ name, parts: [{ name: 'Earring', z: 0, ops: [{ kind: 'cut' as const, loops: [rect(0, 0, 30, 60)] }] }] })),
      { groups: [{ id: 'g', name: 'Earrings', kind: 'pair', items: ['item0', 'item1'], rule: 'same-sheet' }] },
    );
    const plan = planCut(craft, { ...profileFor('xtool', 'gold'), layout: 'groups-together' });
    expect(plan.sheets.length).toBe(1);
    const [sheet] = plan.sheets;
    expect(sheet.id).toBe('g:1');
    expect(sheet.placements.map((p) => p.at)).toEqual([[5, 5], [38, 5]]);
    const [a, b] = sheet.placements;
    expect(b.at[0] - (a.at[0] + 30)).toBe(3);
  });
  it('spill: 20 earrings in a set on a small board → several sheets, all inside', () => {
    const craft = craftOf(
      Array.from({ length: 20 }, (_, i) => ({ name: `E${i}`, parts: [{ name: 'Earring', z: 0, ops: [{ kind: 'cut' as const, loops: [rect(0, 0, 30, 60)] }] }] })),
      { groups: [{ id: 'g', name: 'Earrings', kind: 'set', items: Array.from({ length: 20 }, (_, i) => `item${i}`), rule: 'same-sheet' }] },
    );
    const profile = { ...profileFor('xtool', 'gold'), board: { wMm: 70, hMm: 70 }, layout: 'groups-together' as const };
    const plan = planCut(craft, profile);
    expect(plan.sheets.length).toBeGreaterThan(1);
    expect(plan.sheets.reduce((n, s) => n + s.placements.length, 0)).toBe(20);
    for (const s of plan.sheets) {
      for (const p of s.placements) {
        expect(p.at[0]).toBeGreaterThanOrEqual(5);
        expect(p.at[1]).toBeGreaterThanOrEqual(5);
        expect(p.at[0] + 30).toBeLessThanOrEqual(65);
        expect(p.at[1] + 60).toBeLessThanOrEqual(65);
      }
    }
  });
  it('qty 3 → 3 sheets with (n of 3) names', () => {
    const craft = craftOf([{ name: 'Charm', qty: 3, parts: [{ name: 'Disc', z: 0, ops: [{ kind: 'cut', loops: [rect(0, 0, 10, 10)] }] }] }]);
    const plan = planCut(craft, cricut());
    expect(plan.sheets.map((s) => s.name)).toEqual(['Disc (1 of 3)', 'Disc (2 of 3)', 'Disc (3 of 3)']);
    expect(plan.sheets.map((s) => s.id)).toEqual(['part0-0:1', 'part0-0:2', 'part0-0:3']);
  });
  it('materials never share a sheet', () => {
    const craft = craftOf(
      [{ name: 'G', parts: [{ name: 'P', z: 0, material: 'gold', ops: [{ kind: 'cut' as const, loops: [rect(0, 0, 10, 10)] }] }] },
        { name: 'B', parts: [{ name: 'P', z: 0, material: 'black', ops: [{ kind: 'cut' as const, loops: [rect(0, 0, 10, 10)] }] }] }],
      { groups: [{ id: 'g', name: 'Mixed', kind: 'set', items: ['item0', 'item1'], rule: 'same-sheet' }] },
    );
    const plan = planCut(craft, { ...cricut(), layout: 'groups-together' });
    expect(plan.sheets.map((s) => s.material).sort()).toEqual(['black', 'gold']);
    expect(plan.sheets.every((s) => s.placements.length === 1)).toBe(true);
  });
  it('rev is recorded', () => {
    expect(planCut(catLike(), cricut(), 7).craftRev).toBe(7);
  });
  it('empty craft → no sheets', () => {
    expect(planCut(craftOf([]), cricut()).sheets).toEqual([]);
  });
});

describe('cutplan plan nest layout', () => {
  const nestCraft = () => craftOf([{
    name: 'Charm', qty: 3, parts: [{ name: 'Disc', z: 0, ops: [
      { kind: 'engrave' as const, loops: [rect(2, 2, 6, 6)] },
      { kind: 'cut' as const, loops: [rect(0, 0, 10, 10), rect(3, 3, 4, 4)] },
    ] }],
  }]);
  it('qty 3 → 3 placements on one board, machine order per part', () => {
    const plan = planCut(nestCraft(), { ...cricut(), layout: 'nest' });
    expect(plan.sheets.length).toBe(1);
    const s = plan.sheets[0];
    expect(s.placements.length).toBe(3);
    expect(s.passes.map((p) => p.kind)).toEqual(['engrave', 'cut', 'cut', 'engrave', 'cut', 'cut', 'engrave', 'cut', 'cut']);
    for (let k = 0; k < 3; k++) {
      expect(bboxOf(s.passes[k * 3 + 1].shapesMm)).toEqual([4, 4]);
      expect(bboxOf(s.passes[k * 3 + 2].shapesMm)).toEqual([10, 10]);
    }
    for (const p of s.placements) {
      expect(p.at[0]).toBeGreaterThanOrEqual(5);
      expect(p.at[1]).toBeGreaterThanOrEqual(5);
      expect(p.at[0] + 10).toBeLessThanOrEqual(304.8 - 5);
      expect(p.at[1] + 10).toBeLessThanOrEqual(304.8 - 5);
      expect([0, 90, 180, 270]).toContain(p.rotateDeg);
    }
    expect(s.board).toEqual({ wMm: 304.8, hMm: 304.8 });
  });
  it('pairs nest together, sets spill, materials split sheets', () => {
    const big = [rect(0, 0, 100, 100)], small = [rect(0, 0, 40, 40)];
    const craft = craftOf([
      { name: 'Left', parts: [{ name: 'Ear', ops: [{ kind: 'cut', loops: small }] }] },
      { name: 'Right', parts: [{ name: 'Ear', ops: [{ kind: 'cut', loops: small }] }] },
      { name: 'F1', parts: [{ name: 'Tile', ops: [{ kind: 'cut', loops: big }] }] },
      { name: 'F2', parts: [{ name: 'Tile', ops: [{ kind: 'cut', loops: big }] }] },
      { name: 'F3', parts: [{ name: 'Tile', ops: [{ kind: 'cut', loops: big }] }] },
      { name: 'F4', parts: [{ name: 'Tile', ops: [{ kind: 'cut', loops: big }] }] },
      { name: 'F5', parts: [{ name: 'Tile', ops: [{ kind: 'cut', loops: big }] }] },
      { name: 'F6', parts: [{ name: 'Tile', ops: [{ kind: 'cut', loops: big }] }] },
      { name: 'Gold', parts: [{ name: 'Disc', material: 'gold', ops: [{ kind: 'cut', loops: small }] }] },
    ], {
      groups: [
        { id: 'pair1', name: 'Earrings', kind: 'pair', items: ['item0', 'item1'], rule: 'same-sheet' },
        { id: 'set1', name: 'Tiles', kind: 'set', items: ['item2', 'item3', 'item4', 'item5', 'item6', 'item7'], rule: 'same-sheet' },
      ],
    });
    const plan = planCut(craft, { ...cricut(), layout: 'nest' });
    expect(plan.sheets.length).toBe(3);
    const sheetOf = new Map(plan.sheets.flatMap((s, i) => s.placements.map((p) => [p.partId, i])));
    expect(sheetOf.get('part0-0')).toBe(sheetOf.get('part1-0'));
    expect(new Set(['part2-0', 'part3-0', 'part4-0', 'part5-0', 'part6-0', 'part7-0'].map((id) => sheetOf.get(id))).size).toBe(2);
    for (const s of plan.sheets) expect(new Set([s.material]).size).toBe(1);
    expect(plan.sheets.map((s) => s.material).sort()).toEqual(['cardstock', 'cardstock', 'gold']);
  });
  it('rotated placements cut rotated loops: L twins share one board', () => {
    const l: Pt[] = [[0, 0], [64, 0], [64, 30], [30, 30], [30, 64], [0, 64]];
    const craft = craftOf([
      { name: 'A', frame: { size: [100, 100] }, parts: [{ name: 'L', ops: [{ kind: 'cut', loops: [l] }] }] },
      { name: 'B', frame: { size: [100, 100] }, parts: [{ name: 'L', ops: [{ kind: 'cut', loops: [l] }] }] },
    ]);
    const plan = planCut(craft, { ...cricut(), layout: 'nest' });
    expect(plan.sheets.length).toBe(1);
    const rots = plan.sheets[0].placements.map((p) => p.rotateDeg).sort();
    expect(rots).toEqual([0, 180]);
    for (const pass of plan.sheets[0].passes) {
      const [w, h] = bboxOf(pass.shapesMm);
      expect(w).toBeCloseTo(64, 9);
      expect(h).toBeCloseTo(64, 9);
    }
  });
  it('empty craft → no sheets', () => {
    expect(planCut(craftOf([]), { ...cricut(), layout: 'nest' }).sheets).toEqual([]);
  });
});

describe('cutplan plan kerf', () => {
  it('glowforge kerf 0.2 grows outlines and shrinks holes after placement', () => {
    const craft = craftOf([{
      name: 'Fox', parts: [{ name: 'Fox', z: 0, ops: [
        { kind: 'cut' as const, loops: [rect(0, 0, 20, 20), rect(5, 5, 10, 10)] },
      ] }],
    }]);
    const [sheet] = planCut(craft, { ...profileFor('glowforge', 'ply'), layout: 'one-part-per-sheet' }).sheets;
    const [hole, outline] = sheet.passes.map((p) => p.shapesMm);
    expect(bboxOf(outline)[0]).toBeCloseTo(20.2, 6);
    expect(bboxOf(hole)[0]).toBeCloseTo(9.8, 6);
  });
  it('warnings name the part, not the board', () => {
    const craft = craftOf([
      { name: 'Fox', parts: [{ name: 'Fox', z: 0, ops: [{ kind: 'cut' as const, loops: [rect(0, 0, 20, 20), rect(5, 5, 0.15, 0.15)] }] }] },
      { name: 'Leaf', parts: [{ name: 'Leaf', z: 0, ops: [{ kind: 'cut' as const, loops: [rect(0, 0, 20, 20)] }] }] },
    ]);
    const [sheet] = planCut(craft, { ...profileFor('glowforge', 'ply'), layout: 'nest' }).sheets;
    expect(sheet.warnings).toEqual(["a 0.15 mm hole in Fox can't be cut with a 0.2 mm kerf"]);
  });
});

describe('cutplan plan given layout', () => {
  const kit = () => {
    let k = 0;
    const snap: V1Snapshot = {
      subject: 'Castle',
      plan: [
        { name: 'A1', cut: [[[10, 10], [60, 10], [60, 40], [10, 40]]], engrave: [], sizeMm: [300, 300] },
        { name: 'A2', cut: [[[100, 100], [200, 100], [200, 200], [100, 200]]], engrave: [], sizeMm: [300, 300] },
      ],
    };
    const project: V1Project = { id: 'kit', name: 'Castle', createdAt: 0, updatedAt: 0, kind: 'kit' };
    return migrateV1(project, snap, () => `n${++k}`);
  };
  it('a kit item becomes one in-place 300x300 sheet per part', () => {
    const plan = planCut(kit(), { ...cricut(), layout: 'given' });
    expect(plan.sheets.length).toBe(2);
    expect(plan.sheets.map((s) => s.name)).toEqual(['Sheet A1', 'Sheet A2']);
    for (const s of plan.sheets) {
      expect(s.sizeMm[0]).toBeCloseTo(300, 9);
      expect(s.sizeMm[1]).toBeCloseTo(300, 9);
    }
    const [loop] = plan.sheets[0].passes[0].shapesMm;
    expect(loop.length).toBe(4);
    for (const [i, [x, y]] of [[10, 10], [60, 10], [60, 40], [10, 40]].entries()) {
      expect(loop[i][0]).toBeCloseTo(x, 9);
      expect(loop[i][1]).toBeCloseTo(y, 9);
    }
  });
  it('non-kit items in the same craft get one-part-per-sheet', () => {
    const doc = kit();
    doc.items.push(craftOf([{ name: 'Tag', parts: [{ name: 'Tag', z: 0, ops: [{ kind: 'cut' as const, loops: [rect(0, 0, 10, 10)] }] }] }]).items[0]);
    const plan = planCut(doc, { ...cricut(), layout: 'given' });
    expect(plan.sheets.length).toBe(3);
    expect(plan.sheets[2].sizeMm).toEqual([20, 20]);
    expect(plan.sheets[2].name).toBe('Tag');
  });
});

describe('cutplan plan nest oversize', () => {
  const xtool = () => ({ ...profileFor('xtool', 'ply'), layout: 'nest' as const });
  const square = (name: string, s: number) => ({
    name, parts: [{ name, z: 0, ops: [{ kind: 'cut' as const, loops: [rect(0, 0, s, s)] }] }],
  });
  it('a 310 mm part alone → its own sheet with a warning', () => {
    const plan = planCut(craftOf([square('Big', 310)]), xtool());
    expect(plan.sheets.length).toBe(1);
    expect(plan.sheets[0].placements.map((p) => p.partId)).toEqual(['part0-0']);
    expect(plan.sheets[0].warnings).toEqual([
      "Sheet A1 (310 × 310 mm) is larger than the xTool S1's 290 × 290 mm working area — scale it down or use a bigger board",
    ]);
  });
  it('a 301 mm and a 100 mm part → 2 sheets, no overlap', () => {
    const plan = planCut(craftOf([square('Big', 301), square('Small', 100)]), xtool());
    expect(plan.sheets.length).toBe(2);
    expect(plan.sheets[0].placements.map((p) => p.partId)).toEqual(['part0-0']);
    expect(plan.sheets[0].warnings).toEqual([
      "Sheet A1 (301 × 301 mm) is larger than the xTool S1's 290 × 290 mm working area — scale it down or use a bigger board",
    ]);
    expect(plan.sheets[1].placements.map((p) => p.partId)).toEqual(['part1-0']);
    expect(plan.sheets[1].warnings ?? []).toEqual([]);
    const [at] = plan.sheets[1].placements.map((p) => p.at);
    expect(at[0]).toBeGreaterThanOrEqual(5);
    expect(at[1]).toBeGreaterThanOrEqual(5);
    expect(at[0] + 100).toBeLessThanOrEqual(295);
    expect(at[1] + 100).toBeLessThanOrEqual(295);
  });
  it('a 299 mm part alone → a warning (299 > 290)', () => {
    const plan = planCut(craftOf([square('Big', 299)]), xtool());
    expect(plan.sheets.length).toBe(1);
    expect(plan.sheets[0].warnings?.length).toBe(1);
  });
  it('castle: 11 kit parts nest in under 3 s, every sheet warned or fitting', async () => {
    const sharp = (await import('sharp')).default;
    const { readPlan } = await import('../layering');
    const { data, info } = await sharp(`${process.cwd()}/../samples/3D/castle/castle_5.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const sheets = readPlan({ w: info.width, h: info.height, data: new Uint8ClampedArray(data) });
    expect(sheets.length).toBe(11);
    let k = 0;
    const project: V1Project = { id: 'castle', name: 'Castle', createdAt: 0, updatedAt: 0, kind: 'kit' };
    const snap: V1Snapshot = {
      subject: 'Castle',
      plan: sheets.map((s) => ({ name: s.name, cut: s.cut, engrave: s.engrave, sizeMm: s.sizeMm })),
    };
    const craft = migrateV1(project, snap, () => `n${++k}`);
    const t0 = performance.now();
    const plan = planCut(craft, { ...profileFor('xtool', 'ply'), layout: 'nest' });
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(plan.sheets.length).toBeGreaterThan(0);
    for (const s of plan.sheets) {
      const fits = s.sizeMm[0] <= s.board.wMm && s.sizeMm[1] <= s.board.hMm;
      expect((s.warnings?.length ?? 0) > 0 || fits).toBe(true);
    }
  }, 10_000);
});
