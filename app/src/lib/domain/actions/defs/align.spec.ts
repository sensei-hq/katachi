import { describe, expect, it } from 'vitest';
import { bbox } from '../../geo';
import { align } from './align';
import { craftOf, sq, testCtx } from './fixtures';

const items = () => craftOf({ items: [
  { name: 'A', frame: { fromSource: { box: { x: 10, y: 10, w: 100, h: 100 } } }, parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 20)] }] }] },
  { name: 'B', frame: { fromSource: { box: { x: 50, y: 30, w: 100, h: 100 } } }, parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 20)] }] }] },
] });
const parts = () => craftOf({ items: [
  { name: 'Stack', parts: [
    { name: 'Back', z: 0, ops: [{ kind: 'cut', loops: [sq(0, 0, 20)] }] },
    { name: 'Front', z: 1, ops: [{ kind: 'cut', loops: [sq(30, 5, 20)] }] },
  ] },
] });

describe('align', () => {
  it('items: boxes line up on the first, first stays', async () => {
    const doc = items(), before = structuredClone(doc);
    const r = await align.run(doc, { targets: ['item0', 'item1'], opts: { to: 'left', relativeTo: 'first' } }, testCtx());
    expect(r.items.length).toBe(1);
    expect(r.items[0].frame.fromSource.box).toEqual({ x: 10, y: 30, w: 100, h: 100 });
    const c = await align.run(doc, { targets: ['item0', 'item1'], opts: { to: 'centre', relativeTo: 'first' } }, testCtx());
    expect(c.items[0].frame.fromSource.box).toEqual({ x: 10, y: 10, w: 100, h: 100 });
    expect(doc).toEqual(before);
  });
  it('parts: geometry translates; one part can align to the backing', async () => {
    const doc = parts();
    const r = await align.run(doc, { targets: ['part0-0', 'part0-1'], opts: { to: 'left', relativeTo: 'first' } }, testCtx());
    const front = r.items[0].parts.find((p) => p.id === 'part0-1')!;
    const bb = bbox(front.ops[0].geometry)!;
    expect([bb.x, bb.y]).toEqual([0, 5]);
    // only the moved part's item is returned, back part untouched
    expect(r.items[0].parts.find((p) => p.id === 'part0-0')).toEqual(doc.items[0].parts[0]);
    const b = await align.run(doc, { targets: ['part0-1'], opts: { to: 'top', relativeTo: 'backing' } }, testCtx());
    const bb2 = bbox(b.items[0].parts.find((p) => p.id === 'part0-1')!.ops[0].geometry)!;
    expect([bb2.x, bb2.y]).toEqual([30, 0]);
  });
  it('refuses mixed targets, split items, lone firsts, and bad edges', () => {
    const doc = parts();
    const good = { to: 'left' as const, relativeTo: 'first' as const };
    expect(align.can(doc, { targets: ['part0-0', 'part0-1'], opts: good })).toBe(true);
    expect(align.can(doc, { targets: ['part0-1'], opts: { to: 'top', relativeTo: 'backing' } })).toBe(true);
    expect(align.can(doc, { targets: ['part0-0'], opts: good })).not.toBe(true);
    expect(align.can(doc, { targets: ['item0', 'part0-0'], opts: good })).not.toBe(true);
    expect(align.can(items(), { targets: ['item0'], opts: good })).not.toBe(true);
    expect(align.can(doc, { targets: ['part0-0', 'part0-1'], opts: { to: 'sideways' as 'left', relativeTo: 'first' } })).not.toBe(true);
    const split = craftOf({ items: [
      { name: 'A', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
      { name: 'B', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
    ] });
    expect(align.can(split, { targets: ['part0-0', 'part1-0'], opts: good })).not.toBe(true);
  });
});
