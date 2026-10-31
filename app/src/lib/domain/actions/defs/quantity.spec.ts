import { describe, expect, it } from 'vitest';
import { quantity } from './quantity';
import { craftOf, sq, testCtx } from './fixtures';

const twoItems = () => craftOf({ items: [
  { name: 'Earring', parts: [{ name: 'Drop', ops: [{ kind: 'cut', loops: [sq(0, 0, 40)] }] }] },
  { name: 'Other', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
] });

describe('quantity', () => {
  it('sets qty 1–99; untargeted items and input untouched', async () => {
    const doc = twoItems(), before = structuredClone(doc);
    const r = await quantity.run(doc, { targets: ['item0'], opts: { qty: 5 } }, testCtx());
    expect(r.items).toEqual([{ ...doc.items[0], qty: 5 }]);
    expect(r.summary).toContain('5');
    expect(doc).toEqual(before);
  });
  it('refuses out-of-range qty and bad targets', () => {
    const doc = twoItems();
    for (const qty of [0, 100, 2.5, NaN]) {
      expect(quantity.can(doc, { targets: ['item0'], opts: { qty } })).not.toBe(true);
    }
    expect(quantity.can(doc, { targets: ['item0'], opts: { qty: 1 } })).toBe(true);
    expect(quantity.can(doc, { targets: ['item0'], opts: { qty: 99 } })).toBe(true);
    expect(quantity.can(doc, { targets: [], opts: { qty: 5 } })).not.toBe(true);
    expect(quantity.can(doc, { targets: ['nope'], opts: { qty: 5 } })).not.toBe(true);
  });
});
