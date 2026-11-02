import { describe, expect, it } from 'vitest';
import { split } from './structure';
import { craftOf, sq, testCtx } from './fixtures';

// a bookmark traced with specks of noise beside it: still one piece, so split refuses (T7: it made 22 pieces)
const specks = Array.from({ length: 20 }, (_, k) => sq(100 + (k % 5) * 3, 5 + Math.floor(k / 5) * 3, 1));
const doc = (loops = [sq(0, 0, 40), sq(10, 10, 20), ...specks]) => craftOf({ items: [{ name: 'Elephant', parts: [{ name: 'Elephant', ops: [{ kind: 'cut', loops }] }] }] });

describe('split', () => {
  it('a piece with specks of trace noise is one piece: refused, saying why', () => {
    expect(split.can(doc(), { targets: ['part0-0'], opts: {} })).toBe('One piece — nothing to split');
  });
  it('two real pieces split in two; the specks stay with the biggest, holes with their piece', async () => {
    const d = doc([sq(0, 0, 40), sq(10, 10, 20), sq(50, 0, 30), ...specks]);
    expect(split.can(d, { targets: ['part0-0'], opts: {} })).toBe(true);
    const r = await split.run(d, { targets: ['part0-0'], opts: {} }, testCtx());
    expect(r.summary).toBe('Split Elephant into 2 pieces');
    expect(r.items[0].parts.map((p) => p.ops[0].geometry.paths.length)).toEqual([2 + specks.length, 1]);
  });
});
