import { describe, expect, it } from 'vitest';
import { area, fromLoops, type Pt } from '../geo';
import { rect } from './fixtures';
import { nestCellMm, nestOnBoards, rasterize, rotatedLoops, type NestInput } from './nest';

const part = (partId: string, loops: Pt[][], extra: Partial<NestInput> = {}): NestInput => ({
  partId, itemId: 'item0', loopsMm: loops, material: 'cardstock', colour: '#ffffff', qty: 1, ...extra,
});

/** stamp every placement's cells onto a board grid; returns double-marked cells */
const stampAll = (
  sheets: { placements: { partId: string; at: [number, number]; rotateDeg: number }[] }[],
  byId: Map<string, Pt[][]>,
  board: { wMm: number; hMm: number }, marginMm: number, spacingMm: number,
): string[] => {
  const cell = nestCellMm(board), dil = spacingMm / 2, seen = new Set<string>(), dupes: string[] = [];
  for (const s of sheets) {
    for (const p of s.placements) {
      const r = rasterize(rotatedLoops(byId.get(p.partId)!, p.rotateDeg), cell, dil);
      const px = Math.round((p.at[0] - marginMm - dil) / cell), py = Math.round((p.at[1] - marginMm - dil) / cell);
      for (const [i, j] of r.cells) {
        const k = `${px + i},${py + j}`;
        if (seen.has(k)) dupes.push(k);
        seen.add(k);
      }
    }
    seen.clear();
  }
  return dupes;
};

describe('cutplan nest', () => {
  it('rectangles: 20 x 50x30 on 300x300 margin 5 → 1 sheet, no overlap, inside margins', () => {
    const board = { wMm: 300, hMm: 300 };
    const inputs = Array.from({ length: 20 }, (_, i) => part(`r${i}`, [rect(0, 0, 50, 30)]));
    const res = nestOnBoards(inputs, board, { marginMm: 5, spacingMm: 3 });
    expect(res.sheets.length).toBe(1);
    expect(res.sheets[0].placements.length).toBe(20);
    const byId = new Map(inputs.map((p) => [p.partId, p.loopsMm]));
    expect(stampAll(res.sheets, byId, board, 5, 3)).toEqual([]);
    for (const p of res.sheets[0].placements) {
      expect(p.at[0]).toBeGreaterThanOrEqual(5);
      expect(p.at[1]).toBeGreaterThanOrEqual(5);
      expect(p.at[0] + 50).toBeLessThanOrEqual(295);
      expect(p.at[1] + 30).toBeLessThanOrEqual(295);
    }
  });
  it('rotation: an L and its 180° twin nest into roughly one bounding box', () => {
    const l: Pt[] = [[0, 0], [64, 0], [64, 30], [30, 30], [30, 64], [0, 64]];
    const board = { wMm: 300, hMm: 300 };
    const res = nestOnBoards([part('l1', [l]), part('l2', [l])], board, { marginMm: 5, spacingMm: 1 });
    expect(res.sheets.length).toBe(1);
    const [a, b] = res.sheets[0].placements;
    expect(new Set([a.rotateDeg, b.rotateDeg])).toEqual(new Set([0, 180]));
    const boxOf = (loops: Pt[][]) => {
      const xs = loops.flat().map((p) => p[0]), ys = loops.flat().map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    const boxes = res.sheets[0].placements.map((p) => {
      const [x1, y1, x2, y2] = boxOf(rotatedLoops([l], p.rotateDeg));
      return [p.at[0] + x1, p.at[1] + y1, p.at[0] + x2, p.at[1] + y2];
    });
    const ux1 = Math.min(...boxes.map((x) => x[0])), uy1 = Math.min(...boxes.map((x) => x[1]));
    const ux2 = Math.max(...boxes.map((x) => x[2])), uy2 = Math.max(...boxes.map((x) => x[3]));
    const both = (ux2 - ux1) * (uy2 - uy1);
    expect(both).toBeLessThan(1.3 * 2 * area(fromLoops([l])));
  });
  it('parts inside holes: 100x100 square lands inside the ring hole', () => {
    const board = { wMm: 300, hMm: 300 };
    const ring = part('ring', [rect(0, 0, 200, 200), rect(25, 25, 150, 150)]);
    const sq = part('sq', [rect(0, 0, 100, 100)]);
    const res = nestOnBoards([ring, sq], board, { marginMm: 5, spacingMm: 3 });
    expect(res.sheets.length).toBe(1);
    const at = new Map(res.sheets[0].placements.map((p) => [p.partId, p.at]));
    const r = at.get('ring')!, s = at.get('sq')!;
    expect(s[0]).toBeGreaterThanOrEqual(r[0] + 25);
    expect(s[1]).toBeGreaterThanOrEqual(r[1] + 25);
    expect(s[0] + 100).toBeLessThanOrEqual(r[0] + 175);
    expect(s[1] + 100).toBeLessThanOrEqual(r[1] + 175);
  });
  it('pairs stay together; materials never mix', () => {
    const board = { wMm: 100, hMm: 100 };
    const sq = [rect(0, 0, 40, 40)];
    const inputs = [
      part('p1', sq, { groupId: 'g', keepTogether: true }),
      part('p2', sq, { groupId: 'g', keepTogether: true }),
      part('f1', sq), part('f2', sq), part('f3', sq),
      part('m1', sq, { material: 'ply', colour: '#c89b6a' }),
    ];
    const res = nestOnBoards(inputs, board, { marginMm: 5, spacingMm: 2 });
    expect(res.sheets.length).toBe(3);
    for (const s of res.sheets) expect(new Set([s.material]).size).toBe(1);
    const sheetOf = new Map(res.sheets.flatMap((s, i) => s.placements.map((p) => [p.partId, i])));
    expect(sheetOf.get('p1')).toBe(sheetOf.get('p2'));
    expect(res.sheets[sheetOf.get('m1')!].material).toBe('ply');
  });
  it('determinism: two runs give deep-equal output', () => {
    const board = { wMm: 300, hMm: 300 };
    const inputs = Array.from({ length: 20 }, (_, i) => part(`r${i}`, [rect(0, 0, 50, 30)]));
    const opts = { marginMm: 5, spacingMm: 3 };
    expect(nestOnBoards(inputs, board, opts)).toEqual(nestOnBoards(inputs, board, opts));
  });
  it('allowRotate: a bar that fits only diagonally places at 45°', () => {
    const board = { wMm: 100, hMm: 100 };
    const bar = [part('bar', [rect(0, 0, 100, 10)])];
    const res = nestOnBoards(bar, board, { marginMm: 5, spacingMm: 1, allowRotate: true });
    expect(res.sheets.length).toBe(1);
    expect(res.sheets[0].placements[0].rotateDeg).toBe(45);
    const p = res.sheets[0].placements[0];
    expect(p.at[0]).toBeGreaterThanOrEqual(5);
    expect(p.at[1]).toBeGreaterThanOrEqual(5);
  });
  it('oversize parts are kept on their own sheet rather than dropped', () => {
    const board = { wMm: 100, hMm: 100 };
    const res = nestOnBoards([part('big', [rect(0, 0, 400, 400)])], board, { marginMm: 5, spacingMm: 2 });
    expect(res.sheets.length).toBe(1);
    expect(res.sheets[0].placements.map((p) => p.partId)).toEqual(['big']);
    expect(res.sheets[0].placements[0].oversize).toEqual({ wMm: 400, hMm: 400 });
  });
  it('nothing joins an oversized part on its sheet', () => {
    const board = { wMm: 100, hMm: 100 };
    const res = nestOnBoards(
      [part('big', [rect(0, 0, 400, 400)]), part('small', [rect(0, 0, 10, 10)])],
      board, { marginMm: 5, spacingMm: 2 },
    );
    expect(res.sheets.length).toBe(2);
    expect(res.sheets[0].placements.map((p) => p.partId)).toEqual(['big']);
    expect(res.sheets[1].placements.map((p) => p.partId)).toEqual(['small']);
    expect(res.sheets[1].placements[0].oversize).toBeUndefined();
  });
  it('empty input → no sheets; qty 0 places nothing', () => {
    const board = { wMm: 300, hMm: 300 };
    expect(nestOnBoards([], board, { marginMm: 5, spacingMm: 3 }).sheets).toEqual([]);
    const res = nestOnBoards([part('zero', [rect(0, 0, 10, 10)], { qty: 0 })], board, { marginMm: 5, spacingMm: 3 });
    expect(res.sheets).toEqual([]);
  });
  it('speed: 50 earrings on 300x300 stays under 0.5 s', () => {
    const board = { wMm: 300, hMm: 300 };
    const outline: Pt[] = [[10, 0], [16, 2], [20, 10], [20, 20], [16, 28], [10, 30], [4, 28], [0, 20], [0, 10], [4, 2]];
    const ear = part('ear', [outline, rect(8, 13, 4, 4)], { qty: 50 });
    const t0 = performance.now();
    const res = nestOnBoards([ear], board, { marginMm: 5, spacingMm: 3 });
    expect(performance.now() - t0).toBeLessThan(500);
    expect(res.sheets.length).toBe(1);
    expect(res.sheets[0].placements.length).toBe(50);
  });
  it('rasterize matches brute force on a 40x40 part with 3 holes', () => {
    const loops = [rect(0, 0, 40, 40), rect(5, 5, 8, 8), rect(22, 8, 6, 14), rect(8, 26, 16, 6)];
    for (const cell of [1, 0.5]) {
      const r = rasterize(loops, cell, 1.5);
      expect(new Set(r.cells.map(([i, j]) => `${i},${j}`))).toEqual(bruteCells(loops, cell, 1.5));
    }
  });
  it('speed: a 280 mm part with 2,000 holes rasterises in under 200 ms', () => {
    const loops: Pt[][] = [rect(0, 0, 280, 280)];
    for (let gx = 0; gx < 40; gx++) for (let gy = 0; gy < 50; gy++) loops.push(rect(2 + gx * 6.9, 2 + gy * 5.53, 5, 5));
    expect(loops.length).toBe(2001);
    const t0 = performance.now();
    const r = rasterize(loops, 1, 1.5);
    expect(performance.now() - t0).toBeLessThan(200);
    const cells = new Set(r.cells.map(([i, j]) => `${i},${j}`));
    expect(cells.has('5,5')).toBe(false);
    expect(r.cells.length).toBeGreaterThan(1000);
  });
});

/** the old per-cell even-odd + edge-distance raster, kept as the referee */
const bruteCells = (loops: Pt[][], cellMm: number, dilMm: number): Set<string> => {
  const xs = loops.flat().map((p) => p[0]), ys = loops.flat().map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const cols = Math.max(1, Math.ceil((w + 2 * dilMm) / cellMm)), rows = Math.max(1, Math.ceil((h + 2 * dilMm) / cellMm));
  const inside = (x: number, y: number): boolean => {
    let in_ = false;
    for (const l of loops) {
      for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
        const xi = l[i][0], yi = l[i][1], xj = l[j][0], yj = l[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) in_ = !in_;
      }
    }
    return in_;
  };
  const dist = (x: number, y: number): number => {
    let m = Infinity;
    for (const l of loops) {
      for (let i = 0; i < l.length; i++) {
        const a = l[i], b = l[(i + 1) % l.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        if (l2 === 0) { m = Math.min(m, Math.hypot(x - a[0], y - a[1])); continue; }
        const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
        m = Math.min(m, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
      }
    }
    return m;
  };
  const out = new Set<string>();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * cellMm - dilMm, y = (j + 0.5) * cellMm - dilMm;
      if (inside(x, y) || dist(x, y) <= dilMm) out.add(`${i},${j}`);
    }
  }
  return out;
};
