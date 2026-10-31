import { describe, expect, it } from 'vitest';
import { bbox } from '../../geo';
import { offset } from './offset';
import { craftOf, sq, testCtx } from './fixtures';

const cat = () => craftOf({ items: [
  { name: 'Cat', parts: [
    { name: 'Body', z: 0, material: 'black', colour: '#111111', ops: [{ kind: 'cut', loops: [sq(0, 0, 40)] }] },
    { name: 'Head', z: 1, material: 'black', colour: '#111111', ops: [{ kind: 'cut', loops: [sq(0, 0, 20)] }] },
  ] },
] });

describe('offset', () => {
  it('grow offsets the cut op in place (2 mm → 8 px each side)', async () => {
    const doc = cat(), before = structuredClone(doc);
    const r = await offset.run(doc, { targets: ['part0-0'], opts: { mm: 2, as: 'grow' } }, testCtx());
    const [part] = r.items[0].parts;
    const bb = bbox(part.ops[0].geometry)!;
    expect([bb.w, bb.h]).toEqual([56, 56]);
    expect(r.summary).toContain('2 mm');
    expect(doc).toEqual(before);
  });
  it('new-part adds a Border behind, material from options or the part', async () => {
    const doc = cat();
    const r = await offset.run(doc, { targets: ['part0-1'], opts: { mm: 1, as: 'new-part', material: 'gold', colour: '#ffd700' } }, testCtx());
    const parts = r.items[0].parts;
    expect(parts.length).toBe(3);
    const border = parts.find((p) => p.name === 'Border')!;
    expect(border.z).toBe(-1);
    expect(border.material).toBe('gold');
    expect(border.colour).toBe('#ffd700');
    expect(border.ops.length).toBe(1);
    expect(border.ops[0].kind).toBe('cut');
    const bb = bbox(border.ops[0].geometry)!;
    expect([bb.w, bb.h]).toEqual([28, 28]); // 20 + 2·4px
    // untouched original part still there
    expect(parts.find((p) => p.id === 'part0-1')!.ops[0].geometry).toEqual(doc.items[0].parts[1].ops[0].geometry);
    // defaults come from the part
    const r2 = await offset.run(doc, { targets: ['part0-1'], opts: { mm: 1, as: 'new-part' } }, testCtx());
    const b2 = r2.items[0].parts.find((p) => p.name === 'Border')!;
    expect([b2.material, b2.colour]).toEqual(['black', '#111111']);
    expect(doc).toEqual(structuredClone(cat()));
  });
  it('refuses bad targets, bad mode, and parts with no cut', () => {
    const doc = cat();
    const good = { mm: 2, as: 'grow' as const };
    expect(offset.can(doc, { targets: ['part0-0'], opts: good })).toBe(true);
    expect(offset.can(doc, { targets: [], opts: good })).not.toBe(true);
    expect(offset.can(doc, { targets: ['nope'], opts: good })).not.toBe(true);
    expect(offset.can(doc, { targets: ['part0-0'], opts: { mm: 2, as: 'sideways' as 'grow' } })).not.toBe(true);
    expect(offset.can(doc, { targets: ['part0-0'], opts: { mm: NaN, as: 'grow' } })).not.toBe(true);
    const noCut = craftOf({ items: [{ name: 'E', parts: [{ name: 'Mark', ops: [{ kind: 'engrave', loops: [sq(0, 0, 10)] }] }] }] });
    expect(offset.can(noCut, { targets: ['part0-0'], opts: good })).not.toBe(true);
  });
});
