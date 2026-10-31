import { describe, expect, it } from 'vitest';
import { rotate } from './rotate';
import { craftOf, sq, testCtx } from './fixtures';

const twoItems = () => craftOf({ items: [
  { name: 'Fox', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 40)] }] }] },
  { name: 'Other', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
] });

describe('rotate', () => {
  it('adds to rotateDeg, normalised to (−180, 180], snapped to 0.5°', async () => {
    const doc = twoItems(), before = structuredClone(doc);
    const r = await rotate.run(doc, { targets: ['item0'], opts: { deg: 90, snap: true } }, testCtx());
    expect(r.items[0].frame.fromSource.rotateDeg).toBe(90);
    expect(r.summary).toContain('90');
    // normalisation: 170 + 90 → −100; snap: 0.51 → 0.5
    const doc2 = structuredClone(doc);
    doc2.items[0].frame.fromSource.rotateDeg = 170;
    const r2 = await rotate.run(doc2, { targets: ['item0'], opts: { deg: 90, snap: true } }, testCtx());
    expect(r2.items[0].frame.fromSource.rotateDeg).toBe(-100);
    const r3 = await rotate.run(doc, { targets: ['item0'], opts: { deg: 0.51, snap: true } }, testCtx());
    expect(r3.items[0].frame.fromSource.rotateDeg).toBe(0.5);
    const r4 = await rotate.run(doc, { targets: ['item0'], opts: { deg: 0.51, snap: false } }, testCtx());
    expect(r4.items[0].frame.fromSource.rotateDeg).toBeCloseTo(0.51, 10);
    expect(doc).toEqual(before);
  });
  it('leaves untargeted items alone and refuses bad targets', () => {
    const doc = twoItems();
    expect(rotate.can(doc, { targets: [], opts: { deg: 90, snap: true } })).not.toBe(true);
    expect(rotate.can(doc, { targets: ['nope'], opts: { deg: 90, snap: true } })).not.toBe(true);
    expect(rotate.can(doc, { targets: ['item0'], opts: { deg: NaN, snap: true } })).not.toBe(true);
  });
});
