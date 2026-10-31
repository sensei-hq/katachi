import { describe, expect, it } from 'vitest';
import { bbox, toLoops } from '../../geo';
import { mirror } from './mirror';
import { craftOf, sq, testCtx } from './fixtures';

const oneItem = () => craftOf({ items: [
  { name: 'Earring', parts: [{ name: 'Drop', ops: [{ kind: 'cut', loops: [sq(0, 0, 40)] }, { kind: 'engrave', loops: [sq(10, 10, 10)] }] }] },
] });

describe('mirror', () => {
  it('mirrored copy: same-size bbox, mirrored geometry, pair group, all ids new', async () => {
    const doc = oneItem(), before = structuredClone(doc);
    const r = await mirror.run(doc, { targets: ['item0'], opts: { axis: 'x', pair: true } }, testCtx());
    expect(r.items.length).toBe(1);
    const [copy] = r.items;
    expect(copy.name).toBe('Earring (mirrored)');
    expect(copy.id).not.toBe('item0');
    expect(copy.parts[0].id).not.toBe('part0-0');
    expect(copy.parts[0].ops.map((o) => o.id)).not.toContain('op0-0-0');
    // same-size bbox, mirrored: x=0 edge is now at x=100
    const bb = bbox(copy.parts[0].ops[0].geometry)!;
    expect([bb.w, bb.h]).toEqual([40, 40]);
    expect(bb.x).toBe(60);
    expect(toLoops(copy.parts[0].ops[0].geometry)[0]).toContainEqual([100, 0]);
    // pair group created, new item selected
    expect(r.groups?.length).toBe(1);
    expect(r.groups![0]).toMatchObject({ kind: 'pair', rule: 'same-sheet', items: ['item0', copy.id] });
    expect(r.select).toEqual([copy.id]);
    expect(r.order).toEqual(['item0', copy.id]);
    expect(doc).toEqual(before);
  });
  it('joins the existing pair group; refuses bad targets', async () => {
    const doc = craftOf({
      items: [
        { name: 'A', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
        { name: 'B', parts: [{ name: 'P', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] }] },
      ],
      groups: [{ id: 'g', name: 'AB', kind: 'pair', items: ['item0', 'item1'], rule: 'same-sheet' }],
    });
    const r = await mirror.run(doc, { targets: ['item0'], opts: { axis: 'x', pair: true } }, testCtx());
    expect(r.groups![0].id).toBe('g');
    expect(r.groups![0].items).toEqual(['item0', 'item1', r.items[0].id]);
    expect(doc.groups).toEqual([{ id: 'g', name: 'AB', kind: 'pair', items: ['item0', 'item1'], rule: 'same-sheet' }]);
    expect(mirror.can(doc, { targets: [], opts: { axis: 'x', pair: true } })).not.toBe(true);
    expect(mirror.can(doc, { targets: ['nope'], opts: { axis: 'x', pair: true } })).not.toBe(true);
  });
});
