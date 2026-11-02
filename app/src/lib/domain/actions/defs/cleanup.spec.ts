import { describe, expect, it } from 'vitest';
import { toLoops } from '../../geo';
import { tidy, repeatPattern, symmetrize } from './cleanup';
import { craftOf, sq, testCtx } from './fixtures';
import type { Pt } from '../../geo';

const one = (loops: Pt[][], frame?: { fromSource?: { rotateDeg: number } }) => craftOf({ items: [{ name: 'Charm', frame, parts: [{ name: 'Charm', ops: [{ kind: 'cut', loops }] }] }] });

describe('the clean-up pass', () => {
  it('tidy drops specks and pin-holes, keeps the piece and its real holes', async () => {
    // pxPerMm 4 → 1 mm² = 16 px²: a 2×2 px speck and a 2×2 px pin-hole go, the 20×20 hole stays
    const doc = one([sq(0, 0, 100), sq(40, 40, 20), sq(10, 10, 2), sq(150, 150, 2)]);
    const r = await tidy.run(doc, { targets: ['part0-0'], opts: { minMm2: 1, thinMm: 0 } }, testCtx());
    expect(toLoops(r.items[0].parts[0].ops[0].geometry)).toHaveLength(2);
    expect(r.detail).toBe('1 speck and 1 pin-hole under 1 mm² dropped');
  });
  it('tidy takes an earring’s hook wire off the outline, never its fretwork bars', async () => {
    // a 100 px (25 mm) drop with a 2 px (0.5 mm) wire hook on top, and a 2 px bar between two holes inside
    const drop: Pt[] = [[0, 20], [48, 20], [48, 0], [50, 0], [50, 20], [100, 20], [100, 120], [0, 120]];
    const doc = one([drop, sq(10, 30, 39), sq(51, 30, 39)]);
    const r = await tidy.run(doc, { targets: ['part0-0'], opts: { minMm2: 1, thinMm: 0.6 } }, testCtx());
    const loops = toLoops(r.items[0].parts[0].ops[0].geometry);
    expect(Math.min(...loops.flat().map((p) => p[1]))).toBeGreaterThan(15);
    expect(loops).toHaveLength(3);
    expect(r.detail).toContain('thin wire bits (hooks, cords) taken off 1 outline');
  });
  it('repeat-pattern makes a lattice’s ragged holes identical copies of the cleanest', async () => {
    const ragged = (x: number, y: number, d: number): Pt[] => [[x, y], [x + 5, y - d], [x + 10, y], [x + 10, y + 10], [x + 5, y + 10 + d], [x, y + 10]];
    const holes = [ragged(10, 10, 0.5), ragged(30, 10, 1), ragged(50, 10, 1.5), ragged(70, 10, 1)];
    const doc = one([sq(0, 0, 100), ...holes]);
    const r = await repeatPattern.run(doc, { targets: ['part0-0'], opts: { tolerancePct: 20 } }, testCtx());
    expect(r.summary).toBe('Evened out 1 repeated hole');
    // every hole is now the same shape: its points relative to its own box are identical
    const shape = (l: Pt[]) => { const x = Math.min(...l.map((p) => p[0])), y = Math.min(...l.map((p) => p[1])); return JSON.stringify(l.map(([px, py]) => [Math.round(px - x), Math.round(py - y)])); };
    const loops = toLoops(r.items[0].parts[0].ops[0].geometry).filter((l) => Math.max(...l.map((p) => p[0])) - Math.min(...l.map((p) => p[0])) < 50);
    expect(loops).toHaveLength(4);
    expect(new Set(loops.map(shape)).size).toBe(1);
  });
  it('symmetrize: a nearly symmetric charm becomes exactly symmetric; a lopsided one is left alone', async () => {
    const near: Pt[] = [[0, 0], [50, -2], [100, 0], [101, 100], [50, 130], [0, 100]];
    const r = await symmetrize.run(one([near]), { targets: ['item0'], opts: { maxOffPct: 3 } }, testCtx());
    expect(r.summary).toBe('Made 1 item exactly symmetric');
    const xs = toLoops(r.items[0].parts[0].ops[0].geometry)[0].map((p) => p[0]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(101, 0);
    const lop: Pt[] = [[0, 0], [100, 0], [100, 30], [0, 100]];
    const r2 = await symmetrize.run(one([lop]), { targets: ['item0'], opts: { maxOffPct: 3 } }, testCtx());
    expect(r2.items).toHaveLength(0);
    expect(r2.summary).toBe('Nothing was nearly symmetric');
    // a symmetric outline with a lopsided cut-out (a bookmark's elephant) is not a symmetric design
    const card: Pt[] = [[0, 0], [100, 0], [100, 200], [0, 200]];
    const r3 = await symmetrize.run(one([card, sq(10, 20, 30), sq(20, 120, 15)]), { targets: ['item0'], opts: { maxOffPct: 3 } }, testCtx());
    expect(r3.items).toHaveLength(0);
    const twins = await symmetrize.run(one([card, sq(10, 20, 30), sq(60, 20, 30)]), { targets: ['item0'], opts: { maxOffPct: 3 } }, testCtx());
    expect(twins.items).toHaveLength(1);
  });
});
