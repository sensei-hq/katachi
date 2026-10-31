import { describe, expect, it } from 'vitest';
import { hausdorff, type Pt } from '../../geo';
import { simplify } from './simplify';
import { craftOf, sq, testCtx } from './fixtures';

const circle = (r: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as Pt; });
const ptsOf = (g: { paths: { segs: unknown[] }[] }) => g.paths.reduce((n, p) => n + 1 + p.segs.length, 0);

const dense = () => craftOf({ items: [
  { name: 'Fox', parts: [
    { name: 'Dense', ops: [{ kind: 'cut', loops: [circle(20, 200)] }] },
    { name: 'Other', ops: [{ kind: 'cut', loops: [sq(0, 0, 20)] }] },
  ] },
] });

describe('simplify', () => {
  it('drops points within tolerance and counts them', async () => {
    const doc = dense(), before = structuredClone(doc);
    const r = await simplify.run(doc, { targets: ['part0-0'], opts: { toleranceMm: 0.1 } }, testCtx());
    const [part] = r.items[0].parts;
    const n0 = ptsOf(doc.items[0].parts[0].ops[0].geometry);
    const n1 = ptsOf(part.ops[0].geometry);
    expect(n0).toBe(200);
    expect(n1).toBeLessThan(n0);
    // 0.1 mm → 0.4 px at pxPerMm 4
    expect(hausdorff(part.ops[0].geometry, doc.items[0].parts[0].ops[0].geometry)).toBeLessThanOrEqual(0.4);
    expect(r.summary).toContain(`${n0} → ${n1}`);
    expect(doc).toEqual(before);
  });
  it('leaves untargeted parts alone and refuses out-of-range options', () => {
    const doc = dense();
    expect(simplify.can(doc, { targets: ['part0-0'], opts: { toleranceMm: 0.1 } })).toBe(true);
    expect(simplify.can(doc, { targets: [], opts: { toleranceMm: 0.1 } })).not.toBe(true);
    expect(simplify.can(doc, { targets: ['nope'], opts: { toleranceMm: 0.1 } })).not.toBe(true);
    expect(simplify.can(doc, { targets: ['part0-0'], opts: { toleranceMm: -1 } })).not.toBe(true);
  });
});
