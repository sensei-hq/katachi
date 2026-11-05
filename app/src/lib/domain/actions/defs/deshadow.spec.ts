import { describe, expect, it } from 'vitest';
import { toLoops } from '../../geo';
import { fastPath } from '../chat';
import { registerAll } from './index';
import { deshadow, shadePairs, type DeshadowOpts } from './deshadow';
import { craftOf, sq, testCtx } from './fixtures';

registerAll();

const BASE = '#b03a2e'; // warm red
const SHADE = '#6e231c'; // the same hue, darker (its shadow)
const GREEN = '#1e8449'; // another hue entirely
const WHITE = '#ffffff';
const WHITE2 = '#f7f7f7'; // a second white layer (a backer and petals): near-identical, not a shadow
const OPTS: DeshadowOpts = { minGap: 5, maxGap: 30, maxHue: 12, maxSharePct: 20 };

const two = (c1: string, c2: string, l1 = [sq(0, 0, 100)], l2 = [sq(10, 10, 30)]) => craftOf({
  items: [{ name: 'Panel', parts: [
    { name: 'Base', colour: c1, ops: [{ kind: 'cut', loops: l1 }] },
    { name: 'Shade', colour: c2, ops: [{ kind: 'cut', loops: l2 }] }
  ] }]
});

describe('deshadow', () => {
  it('folds a darker shade layer into the base it overlaps', async () => {
    const doc = two(BASE, SHADE);
    expect(shadePairs(doc, ['part0-0', 'part0-1'], OPTS)).toHaveLength(1);
    const r = await deshadow.run(doc, { targets: ['part0-0', 'part0-1'], opts: OPTS }, testCtx());
    expect(r.items).toHaveLength(1);
    expect(r.items[0].parts).toHaveLength(1);
    expect(r.items[0].parts[0].name).toBe('Base');
    expect(r.items[0].parts[0].colour).toBe(BASE);
    // the union covers both: the shadow's corner is inside the merged loops' bounds
    const pts = toLoops(r.items[0].parts[0].ops[0].geometry).flat();
    expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(0, 6);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(100, 6);
    expect(r.summary).toContain('Shade');
  });
  it('keeps the base’s engraving when it folds the shadow in', async () => {
    const doc = craftOf({ items: [{ name: 'Panel', parts: [
      { name: 'Base', colour: BASE, ops: [{ kind: 'cut', loops: [sq(0, 0, 100)] }, { kind: 'engrave', loops: [sq(40, 40, 20)] }] },
      { name: 'Shade', colour: SHADE, ops: [{ kind: 'cut', loops: [sq(10, 10, 30)] }] }
    ] }] });
    const r = await deshadow.run(doc, { targets: ['part0-0', 'part0-1'], opts: OPTS }, testCtx());
    const kinds = r.items[0].parts[0].ops.map((o) => o.kind).sort();
    expect(kinds).toEqual(['cut', 'engrave']);
  });
  it('leaves near-identical same-colour layers alone (a backer and petals, not a shadow)', async () => {
    const doc = two(WHITE, WHITE2);
    expect(shadePairs(doc, ['part0-0', 'part0-1'], OPTS)).toHaveLength(0);
    const r = await deshadow.run(doc, { targets: ['part0-0', 'part0-1'], opts: OPTS }, testCtx());
    expect(r.items).toHaveLength(0);
    expect(r.summary).toBe('No shadow layers found');
  });
  it('leaves other hues alone', async () => {
    const doc = two(BASE, GREEN);
    expect(shadePairs(doc, ['part0-0', 'part0-1'], OPTS)).toHaveLength(0);
  });
  it('leaves a large darker layer alone (a design choice, not a shadow)', async () => {
    const doc = two(BASE, SHADE, [sq(0, 0, 100)], [sq(0, 0, 80)]);
    expect(shadePairs(doc, ['part0-0', 'part0-1'], OPTS)).toHaveLength(0);
  });
  it('leaves disjoint shade pairs alone (no overlap, no fold)', async () => {
    const doc = two(BASE, SHADE, [sq(0, 0, 100)], [sq(200, 200, 30)]);
    expect(shadePairs(doc, ['part0-0', 'part0-1'], OPTS)).toHaveLength(0);
  });
  it('says why it cannot run with nothing to compare', async () => {
    const doc = two(BASE, SHADE);
    expect(deshadow.can(doc, { targets: [], opts: OPTS })).not.toBe(true);
    expect(deshadow.can(doc, { targets: ['part0-0', 'part0-1'], opts: OPTS })).toBe(true);
  });
  it('“fold the shadows” reaches it with no model', async () => {
    const doc = two(BASE, SHADE);
    const r = fastPath('fold the shadows into their layers', doc);
    expect(r?.kind).toBe('calls');
    if (r?.kind === 'calls') expect(r.calls[0].action).toBe('deshadow');
  });
  it('the suggestion’s words (“fold all the shadows…”) target every layer', async () => {
    const doc = two(BASE, SHADE);
    const r = fastPath('Fold all the shadows into their layers', doc);
    expect(r?.kind).toBe('calls');
    if (r?.kind === 'calls') {
      expect(r.calls[0].action).toBe('deshadow');
      expect(r.calls[0].refs).toEqual([{ all: true }]);
    }
  });
});
