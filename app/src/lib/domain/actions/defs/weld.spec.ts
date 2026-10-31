import { describe, expect, it } from 'vitest';
import { area, toLoops } from '../../geo';
import { weld } from './weld';
import { craftOf, sq, testCtx } from './fixtures';

const petals = () => craftOf({ items: [
  { name: 'Flower', parts: [
    { name: 'Petals', ops: [{ kind: 'cut', loops: [sq(0, 0, 20), sq(10, 10, 20)] }] },
    { name: 'Other', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] },
  ] },
] });

describe('weld', () => {
  it('unions overlapping loops and counts them', async () => {
    const doc = petals(), before = structuredClone(doc);
    const r = await weld.run(doc, { targets: ['part0-0'], opts: {} }, testCtx());
    const [geom] = r.items[0].parts.map((p) => p.ops[0].geometry);
    expect(toLoops(geom).length).toBe(1);
    expect(area(geom)).toBeCloseTo(700, 0);
    expect(r.summary).toBe('Welded 2 loops into 1 outline');
    expect(doc).toEqual(before);
  });
  it('leaves untargeted parts alone and refuses parts with no cut', () => {
    const doc = petals();
    expect(weld.can(doc, { targets: ['part0-0'], opts: {} })).toBe(true);
    expect(weld.can(doc, { targets: [], opts: {} })).not.toBe(true);
    expect(weld.can(doc, { targets: ['nope'], opts: {} })).not.toBe(true);
    const noCut = craftOf({ items: [{ name: 'E', parts: [{ name: 'Mark', ops: [{ kind: 'engrave', loops: [sq(0, 0, 10)] }] }] }] });
    expect(weld.can(noCut, { targets: ['part0-0'], opts: {} })).not.toBe(true);
  });
});
