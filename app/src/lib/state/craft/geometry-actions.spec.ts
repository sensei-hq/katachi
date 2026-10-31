// Review of T3 through the real engine: each geometry action, run on a migrated craft via ActionState, undone and
// redone exactly; the chat's plain phrases reach it; the cut plan honours flip and quantity.
import { describe, expect, it } from 'vitest';
import { CraftState } from './craft.svelte';
import { ActionState } from './actions.svelte';
import { migrateV1 } from '../../domain/craft/migrate';
import { fastPath } from '../../domain/actions/chat';
import { planCut } from '../../domain/cutplan/plan';
import { profileFor } from '../../domain/cutplan/profiles';
import * as geo from '../../domain/geo';

let k = 0;
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
function setup() {
  const doc = migrateV1({ id: 'b', name: 'Shop', createdAt: 1, updatedAt: 1, kind: 'flat' }, {
    aspect: 1, widthMm: 300,
    regionList: [
      { id: 'fox', name: 'Fox', paths: [rect(100, 100, 100, 600)], holes: [rect(130, 300, 30, 30)] }, { id: 'fox-e', name: 'Fox e', paths: [rect(120, 450, 40, 40)] },
      // the O: outline, its hole and an island inside it (falls out unless bridged)
      { id: 'o', name: 'Ring', paths: [rect(400, 100, 300, 300)], holes: [rect(450, 150, 200, 200), rect(500, 200, 100, 100)] },
      { id: 'leaf', name: 'Leaf', paths: [rect(750, 500, 100, 200)] },
      { id: 'coin', name: 'Coin', paths: [Array.from({ length: 240 }, (_, i) => [200 + 80 * Math.cos((i / 240) * Math.PI * 2), 850 + 80 * Math.sin((i / 240) * Math.PI * 2)] as [number, number])] }
    ],
    stack: [
      { n: 1, name: 'Fox · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'fox', itemName: 'Fox', role: 'cut' },
      { n: 2, name: 'Fox · engraving', colour: '#5A3A22', material: 'birch', visiblePct: 1, hiddenPct: 0, regionId: 'fox-e', itemName: 'Fox', role: 'engrave' },
      { n: 3, name: 'Ring · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'o', itemName: 'Ring', role: 'cut' },
      { n: 4, name: 'Leaf · cut', colour: '#C89B6A', material: 'birch', visiblePct: 4, hiddenPct: 0, regionId: 'leaf', itemName: 'Leaf', role: 'cut' },
      { n: 5, name: 'Coin · cut', colour: '#C89B6A', material: 'birch', visiblePct: 4, hiddenPct: 0, regionId: 'coin', itemName: 'Coin', role: 'cut' }
    ]
  }, () => `m${++k}`);
  const c = new CraftState(() => 1); c.load(doc);
  const a = new ActionState(c, () => ({ newId: () => `n${++k}`, pixels: async () => null }));
  return { c, a };
}
const items = (c: CraftState) => JSON.stringify(c.toJSON().items) + JSON.stringify(c.toJSON().groups);

describe('T3 geometry actions, through the engine', () => {
  const cases: [string, Parameters<ActionState['perform']>[1], Record<string, unknown>][] = [
    ['flip', [{ item: 'Fox' }], {}], ['mirror', [{ item: 'Leaf' }], {}], ['rotate', [{ item: 'Leaf' }], { deg: 90 }], ['quantity', [{ item: 'Leaf' }], { qty: 3 }],
    ['smooth', [{ item: 'Fox' }], { strength: 3 }], ['simplify', [{ item: 'Coin' }], {}], ['offset', [{ item: 'Leaf' }], { mm: 2 }], ['offset', [{ item: 'Leaf' }], { mm: 2, as: 'new-part' }],
    ['weld', [{ item: 'Ring' }], {}], ['bridge', [{ item: 'Ring' }], {}], ['add-hole', [{ item: 'Fox' }], {}], ['align', [{ item: 'Fox' }, { item: 'Leaf' }], { to: 'top' }], ['distribute', [{ all: true }], {}]
  ];
  for (const [action, refs, opts] of cases) it(`${action} ${JSON.stringify(opts)}: runs, undo puts it back exactly, redo brings it back`, async () => {
    const { c, a } = setup();
    const before = items(c);
    const r = await a.perform(action as never, refs, opts);
    if (!r.ok) throw new Error(`${action} refused: ${r.reason}`);
    const after = items(c);
    expect(after).not.toBe(before);
    a.undo(); expect(items(c)).toBe(before);
    a.redo(); expect(items(c)).toBe(after);
  });
  it('what each does, on real shapes', async () => {
    const { c, a } = setup();
    await a.perform('mirror', [{ item: 'Leaf' }]);
    expect(c.items.map((i) => i.name)).toContain('Leaf (mirrored)');
    expect(c.groups[0]).toMatchObject({ kind: 'pair', rule: 'same-sheet' });
    const loops = (name: string) => geo.toLoops(c.items.find((i) => i.name === name)!.parts[0].cut!.geometry).length;
    expect(geo.islands(c.items.find((i) => i.name === 'Ring')!.parts[0].cut!.geometry)).toHaveLength(1);
    await a.perform('bridge', [{ item: 'Ring' }]);
    expect(geo.islands(c.items.find((i) => i.name === 'Ring')!.parts[0].cut!.geometry)).toHaveLength(0);
    const foxLoops = loops('Fox');
    await a.perform('add-hole', [{ item: 'Fox' }]);
    expect(loops('Fox')).toBe(foxLoops + 1);
    // flip and quantity reach the cut plan
    await a.perform('flip', [{ item: 'Leaf' }]);
    await a.perform('quantity', [{ item: 'Fox' }], { qty: 3 });
    const plan = planCut(c.toJSON(), profileFor('xtool', 'birch'));
    expect(plan.sheets.filter((s) => s.name.startsWith('Fox')).length).toBe(3);
    expect(c.items.find((i) => i.name === 'Leaf')!.flipped).toBe(true);
  });
  it('the chat reaches them in plain words', () => {
    const { c } = setup();
    const said = (t: string) => { const s = fastPath(t, c.doc); return s?.kind === 'calls' ? [s.calls[0].action, s.calls[0].opts] : s?.kind ?? null; };
    expect(said('flip the fox')).toEqual(['flip', { axis: 'x' }]);
    expect(said('mirror the leaf')).toEqual(['mirror', { axis: 'x' }]);
    expect(said('make 5 of the leaf')).toEqual(['quantity', { qty: 5 }]);
    expect(said('smooth the fox a lot')).toEqual(['smooth', { strength: 4 }]);
    expect(said('rotate the leaf')?.[0]).toBe('rotate');
    expect(said('bridge the islands of the ring')?.[0]).toBe('bridge');
    expect(said('add a hanging hole to the leaf')?.[0]).toBe('add-hole');
    expect(said('weld the ring')?.[0]).toBe('weld');
    // options from the phrase itself; everyday sentences don't fire the wrong action
    expect(said('flip the fox vertically')).toEqual(['flip', { axis: 'y' }]);
    expect(said('rotate the leaf 45 degrees')).toEqual(['rotate', { deg: 45 }]);
    expect(said('add a 4 mm hole to the leaf')).toEqual(['add-hole', { diaMm: 4 }]);
    expect(said('make 5 copies of the leaf')).toEqual(['quantity', { qty: 5 }]);
    expect(said('fill the hole in the fox')?.[0]).not.toBe('add-hole');
    expect(said('make the leaf 40 mm tall')).toEqual(['resize', { hMm: 40 }]);
  });
});
