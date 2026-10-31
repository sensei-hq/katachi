import { describe, expect, it } from 'vitest';
import { islands } from '../../geo';
import { bridge } from './bridge';
import { craftOf, oShape, sq, testCtx } from './fixtures';

const oPart = () => craftOf({ items: [
  { name: 'Fox', parts: [
    { name: 'O', ops: [{ kind: 'cut', loops: oShape() }] },
    { name: 'Other', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] },
  ] },
] });

describe('bridge', () => {
  it('leaves no islands and counts them', async () => {
    const doc = oPart(), before = structuredClone(doc);
    expect(islands(doc.items[0].parts[0].ops[0].geometry)).toEqual([2]);
    // O is 40px at pxPerMm 4 → gaps are 2mm; width 1mm, the geo default
    const r = await bridge.run(doc, { targets: ['part0-0'], opts: { widthMm: 1, per: 2 } }, testCtx());
    const [geom] = r.items[0].parts.map((p) => p.ops[0].geometry);
    expect(islands(geom)).toEqual([]);
    expect(r.summary).toBe('1 island bridged — nothing falls out');
    expect(doc).toEqual(before);
  });
  it('refuses layers with no islands, bad widths, and bad targets', () => {
    const doc = oPart();
    const good = { widthMm: 1, per: 2 };
    expect(bridge.can(doc, { targets: ['part0-0'], opts: good })).toBe(true);
    expect(bridge.can(doc, { targets: ['part0-1'], opts: good })).toBe('This layer has no islands to bridge');
    expect(bridge.can(doc, { targets: [], opts: good })).not.toBe(true);
    expect(bridge.can(doc, { targets: ['nope'], opts: good })).not.toBe(true);
    expect(bridge.can(doc, { targets: ['part0-0'], opts: { widthMm: 0, per: 2 } })).not.toBe(true);
    expect(bridge.can(doc, { targets: ['part0-0'], opts: { widthMm: 1, per: 0 } })).not.toBe(true);
    const noCut = craftOf({ items: [{ name: 'E', parts: [{ name: 'Mark', ops: [{ kind: 'engrave', loops: [sq(0, 0, 10)] }] }] }] });
    expect(bridge.can(noCut, { targets: ['part0-0'], opts: good })).not.toBe(true);
  });
});
