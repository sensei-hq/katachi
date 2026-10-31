import { describe, expect, it } from 'vitest';
import { CraftState } from './craft.svelte';
import { ActionState } from './actions.svelte';
import { migrateV1 } from '../../domain/craft/migrate';
import type { CraftDoc } from '../../domain/craft/types';

const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
let k = 0;
const ctx = () => ({ newId: () => `n${++k}`, pixels: async () => null });
const earrings = (): CraftDoc => {
  const names = ['Swirl drop left', 'Swirl drop right', 'Leaf'];
  return migrateV1({ id: 'e', name: 'Earrings', createdAt: 1, updatedAt: 1, kind: 'flat' }, {
    aspect: 1, widthMm: 400,
    regionList: names.flatMap((n, i) => [{ id: `r${i}`, name: n, paths: [rect(50 + i * 300, 100, 100, 150)] }, { id: `r${i}e`, name: `${n} e`, paths: [rect(70 + i * 300, 150, 20, 20)] }]),
    stack: names.flatMap((n, i) => [
      { n: 0, name: `${n} · cut`, colour: '#C89B6A', material: 'birch', visiblePct: 3, hiddenPct: 0, regionId: `r${i}`, itemName: n, role: 'cut' as const },
      { n: 0, name: `${n} · engraving`, colour: '#5A3A22', material: 'birch', visiblePct: i === 2 ? 0 : 1, hiddenPct: 0, regionId: `r${i}e`, itemName: n, role: 'engrave' as const }])
  }, () => `m${++k}`);
};
const setup = () => { const c = new CraftState(() => 1); c.load(earrings()); const log: string[] = []; const a = new ActionState(c, ctx, { done: (_k, t) => log.push(t), fail: (_k, t) => log.push(`✗ ${t}`) }); return { c, a, log }; };
const cat = (): CraftDoc => migrateV1({ id: 'c', name: 'Cat', createdAt: 1, updatedAt: 1, kind: 'flat' }, {
  build: 'stacked', aspect: 1, widthMm: 300, regionList: [0, 1, 2, 3].map((i) => ({ id: `r${i}`, name: `R${i}`, paths: [rect(100 + i * 50, 100, 300, 300)] })),
  stack: ['Gold', 'Black', 'Red', 'White'].map((n, i) => ({ n: i + 1, name: n, colour: '#000000', material: 'card', visiblePct: 10, hiddenPct: 0, regionId: `r${i}` }))
}, () => `m${++k}`);

describe('ActionState', () => {
  it('merge by number, undo, redo — the doc comes back exactly', async () => {
    const c = new CraftState(() => 1); c.load(cat()); const a = new ActionState(c, ctx);
    const before = JSON.stringify(c.toJSON().items);
    const r = await a.perform('merge', [{ n: 2 }, { n: 3 }]);
    expect(r.ok).toBe(true);
    expect(c.layers.map((l) => l.name)).toEqual(['Gold', 'Black + Red', 'White']);
    expect(c.layers.map((l) => l.z)).toEqual([0, 1, 2]);
    expect(a.canUndo).toBe(true);
    a.undo();
    expect(JSON.stringify(c.toJSON().items)).toBe(before);
    a.redo();
    expect(c.layers.map((l) => l.name)).toEqual(['Gold', 'Black + Red', 'White']);
    expect(a.redo()).toBeNull();
  });
  it('delete the empty layers; a merge across items lands in the frontmost item; deleting a whole item drops its pair', async () => {
    const { c, a, log } = setup();
    expect(c.layers).toHaveLength(3);
    // the earrings' engravings are ops of their parts: "delete the swirl drop right" removes that earring
    expect(c.groups).toHaveLength(1);
    await a.perform('delete', [{ name: 'the swirl drop right' }]);
    expect(c.items.map((i) => i.name)).toEqual(['Swirl drop left', 'Leaf']);
    expect(c.groups).toEqual([]);
    expect(log.at(-1)).toBe('Deleted Swirl drop right');
    a.undo();
    expect(c.groups).toHaveLength(1);
    expect(c.items).toHaveLength(3);
  });
  it('several actions as one group: one undo puts everything back; refusals say why and change nothing', async () => {
    const c = new CraftState(() => 1); c.load(cat()); const log: string[] = []; const a = new ActionState(c, ctx, { done: (_k, t) => log.push(t), fail: (_k, t) => log.push(`✗ ${t}`) });
    const r = await a.performAll([{ action: 'merge', refs: [{ n: 3 }, { n: 4 }] }, { action: 'rename', refs: [{ n: 3 }], opts: { name: 'Front' } }, { action: 'reorder', refs: [{ n: 1 }], opts: { to: 'front' } }]);
    expect(r.ok).toBe(true);
    expect(c.layers.map((l) => l.name)).toEqual(['Black', 'Front', 'Gold']);
    expect(a.done).toHaveLength(1);
    expect(a.done[0].children).toHaveLength(3);
    a.undo();
    expect(c.layers.map((l) => l.name)).toEqual(['Gold', 'Black', 'Red', 'White']);
    expect((await a.perform('merge', [{ n: 1 }])).ok).toBe(false);
    expect(log.at(-1)).toBe('✗ Nothing to merge — pick two or more layers');
    expect((await a.perform('reorder', [{ n: 1 }], { to: 'sideways' })).ok).toBe(false);
    expect((await a.perform('nope' as never, [])).ok).toBe(false);
    expect(a.done).toHaveLength(0);
  });
  it('again repeats the last action on new targets; duplicate, recolour, set-role, group / ungroup', async () => {
    const { c, a } = setup();
    await a.perform('recolour', [{ item: 'Leaf' }], { colour: '#112233' });
    await a.again([{ item: 'Swirl drop left' }]);
    expect(c.items[0].parts[0].colour).toBe('#112233');
    await a.perform('set-role', [{ item: 'Leaf' }], { role: 'engrave' });
    expect(c.items[2].parts[0].role).toBe('engrave');
    await a.perform('ungroup', [{ item: 'Swirl drop left' }]);
    expect(c.groups).toEqual([]);
    await a.perform('group', [{ item: 'Swirl drop left' }, { item: 'Leaf' }], { kind: 'pair' });
    expect(c.groups[0].kind).toBe('pair');
    await a.perform('duplicate', [{ n: 1 }]);
    expect(c.items[0].parts.map((p) => p.name)).toEqual(['Swirl drop left', 'Swirl drop left copy']);
    expect(a.selected).toEqual([c.items[0].parts[1].id]);
    // the history travels with the doc (saved with the craft)
    expect(c.toJSON().history.done.length).toBe(6);
  });
});
