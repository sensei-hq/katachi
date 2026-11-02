import { describe, expect, it } from 'vitest';
import { toLoops } from '../../geo';
import { sameSize, setsOf } from './samesize';
import { craftOf, testCtx } from './fixtures';
import type { Pt } from '../../geo';

const rect = (w: number, h: number): Pt[] => [[0, 0], [w, 0], [w, h], [0, h]];
const size = (loops: Pt[][]) => { const p = loops.flat(); const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys))]; };

describe('same size', () => {
  it('five bookmarks are one set: each made the size of the one shot squarest and whole', async () => {
    const dims: [number, number][] = [[200, 720], [176, 708], [208, 716], [216, 704], [236, 696]];
    const doc = craftOf({ items: ['Elephant', 'Fox', 'Whale', 'Butterfly', 'Phoenix'].map((n, i) => ({ name: `${n} bookmark`, parts: [{ name: n, ops: [{ kind: 'cut' as const, loops: [rect(...dims[i])] }] }] })) });
    doc.items[0].shot = { skewDeg: 6.5 }; doc.items[1].shot = { skewDeg: 4.1 }; doc.items[2].shot = { skewDeg: 1, filledPct: 15 }; doc.items[3].shot = { skewDeg: 9.5 }; doc.items[4].shot = { skewDeg: 7.7 };
    expect(setsOf(doc, doc.items.map((i) => i.id))).toHaveLength(1);
    const r = await sameSize.run(doc, { targets: doc.items.map((i) => i.id), opts: { tolerancePct: 40 } }, testCtx());
    // the fox: squarest of the whole ones (the whale was squarer but half filled in)
    expect(r.detail).toContain('like Fox bookmark, shot 4.1° off square');
    for (const it of r.items) expect(size(toLoops(it.parts[0].ops[0].geometry))).toEqual([176, 708]);
    expect(r.items).toHaveLength(4);
  });
  it('earrings: each pair is a set, a tray of different earrings is not', () => {
    const doc = craftOf({ items: ['Swirl drop left', 'Swirl drop right', 'Leaf earring', 'Moon earring', 'Star earring'].map((n) => ({ name: n, parts: [{ name: n, ops: [{ kind: 'cut' as const, loops: [rect(40, 70)] }] }] })) });
    expect(setsOf(doc, doc.items.map((i) => i.id))).toHaveLength(0);
    doc.groups = [{ id: 'g', name: 'Swirl drop', kind: 'pair', items: [doc.items[0].id, doc.items[1].id], rule: 'same-sheet' }];
    expect(setsOf(doc, doc.items.map((i) => i.id)).map((s) => s.map((i) => i.name))).toEqual([['Swirl drop left', 'Swirl drop right']]);
  });
});
