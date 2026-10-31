import { describe, expect, it } from 'vitest';
import { flip } from './flip';
import { craftOf, sq, testCtx } from './fixtures';

const twoItems = () => craftOf({ items: [
  { name: 'Fox bookmark', parts: [{ name: 'Fox', ops: [{ kind: 'cut', loops: [sq(0, 0, 40)] }] }] },
  { name: 'Phoenix', parts: [{ name: 'Bird', ops: [{ kind: 'cut', loops: [sq(0, 0, 20)] }] }] },
] });

describe('flip', () => {
  it('toggles flipX, geometry unchanged; twice is the original', async () => {
    const doc = twoItems(), before = structuredClone(doc);
    const r1 = await flip.run(doc, { targets: ['item0'], opts: { axis: 'x' } }, testCtx());
    expect(r1.items.length).toBe(1);
    expect(r1.items[0].frame.flipX).toBe(true);
    expect(r1.items[0].parts[0].ops[0].geometry).toEqual(doc.items[0].parts[0].ops[0].geometry);
    expect(r1.summary).toContain('left-to-right');
    // flipped twice, from the flipped doc, is the original frame
    const doc2 = structuredClone(doc);
    doc2.items[0] = r1.items[0];
    const r2 = await flip.run(doc2, { targets: ['item0'], opts: { axis: 'x' } }, testCtx());
    expect(r2.items[0].frame).toEqual(before.items[0].frame);
    expect(doc).toEqual(before);
  });
  it('leaves untargeted items alone and refuses bad targets', () => {
    const doc = twoItems();
    expect(flip.can(doc, { targets: [], opts: { axis: 'x' } })).not.toBe(true);
    expect(flip.can(doc, { targets: ['item0', 'item1'], opts: { axis: 'x' } })).not.toBe(true);
    expect(flip.can(doc, { targets: ['nope'], opts: { axis: 'x' } })).not.toBe(true);
    expect(flip.can(doc, { targets: ['item0'], opts: { axis: 'z' as 'x' } })).not.toBe(true);
  });
});
