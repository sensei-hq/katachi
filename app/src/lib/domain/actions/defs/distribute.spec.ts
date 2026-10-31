import { describe, expect, it } from 'vitest';
import { distribute } from './distribute';
import { craftOf, sq, testCtx } from './fixtures';

const row = () => craftOf({ items: [
  { name: 'A', frame: { fromSource: { box: { x: 400, y: 0, w: 80, h: 100 } } }, parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
  { name: 'B', frame: { fromSource: { box: { x: 10, y: 0, w: 100, h: 100 } } }, parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
  { name: 'C', frame: { fromSource: { box: { x: 100, y: 0, w: 50, h: 100 } } }, parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
] });

describe('distribute', () => {
  it('even gaps along x, order kept, first stays', async () => {
    const doc = row(), before = structuredClone(doc);
    // 5mm at pxPerMm 4 with a 100-wide box on a 100px frame → 20 photo units
    const r = await distribute.run(doc, { targets: ['item0', 'item1', 'item2'], opts: { gapMm: 5 } }, testCtx());
    const at = new Map(r.items.map((i) => [i.id, i.frame.fromSource.box.x]));
    expect(at.get('item1')).toBe(10);
    expect(at.get('item2')).toBe(130);
    expect(at.get('item0')).toBe(200);
    for (const i of r.items) expect(i.frame.fromSource.box.y).toBe(0);
    expect(r.summary).toContain('5 mm');
    expect(doc).toEqual(before);
  });
  it('refuses lone targets, non-items, and negative gaps', () => {
    const doc = row();
    const good = { gapMm: 5 };
    expect(distribute.can(doc, { targets: ['item0', 'item1'], opts: good })).toBe(true);
    expect(distribute.can(doc, { targets: ['item0'], opts: good })).not.toBe(true);
    expect(distribute.can(doc, { targets: [], opts: good })).not.toBe(true);
    expect(distribute.can(doc, { targets: ['item0', 'part1-0'], opts: good })).not.toBe(true);
    expect(distribute.can(doc, { targets: ['nope', 'item1'], opts: good })).not.toBe(true);
    expect(distribute.can(doc, { targets: ['item0', 'item1'], opts: { gapMm: -1 } })).not.toBe(true);
  });
});
