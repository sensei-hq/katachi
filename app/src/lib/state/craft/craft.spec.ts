import { describe, expect, it } from 'vitest';
import { CraftState } from './craft.svelte';
import { LocalRepository } from './repository';
import { MemoryStorage, ProjectStore } from '../project.svelte';
import { migrateV1 } from '../../domain/craft/migrate';

const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const bookmarks = () => migrateV1({ id: 'c1', name: 'Bookmarks', createdAt: 1, updatedAt: 1, kind: 'flat' }, {
  aspect: 1, widthMm: 300,
  regionList: [{ id: 'a', name: 'A', paths: [rect(100, 100, 100, 600)] }, { id: 'a-e', name: 'Ae', paths: [rect(120, 300, 20, 20)] }, { id: 'b', name: 'B', paths: [rect(500, 100, 100, 600)] }],
  stack: [
    { n: 1, name: 'Fox · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'a', itemName: 'Fox', role: 'cut' },
    { n: 2, name: 'Fox · engraving', colour: '#5A3A22', material: 'birch', visiblePct: 1, hiddenPct: 0, regionId: 'a-e', itemName: 'Fox', role: 'engrave' },
    { n: 3, name: 'Owl · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'b', itemName: 'Owl', role: 'cut' }
  ]
}, (() => { let k = 0; return () => `id${++k}`; })());

describe('CraftState', () => {
  it('reads the tree: items, their parts as layers, sizes in mm, roles', () => {
    const c = new CraftState(() => 100);
    c.load(bookmarks());
    expect(c.items.map((i) => i.name)).toEqual(['Fox', 'Owl']);
    expect(c.layers.map((p) => [p.name, p.role, p.engravings.length])).toEqual([['Fox', 'cut', 1], ['Owl', 'cut', 0]]);
    expect(c.separateItems).toBe(true);
    const fox = c.items[0];
    // 100 × 600 photo units of a 300 mm photo = 30 × 180 mm
    expect(fox.sizeMm.hMm).toBeCloseTo(180, 0);
    expect(fox.sizeMm.wMm).toBeCloseTo(30, 0);
    expect(fox.parts[0].item).toBe(fox);
    expect(fox.parts[0].boundsMm!.h).toBeCloseTo(180, 0);
    expect(c.item(fox.id)).toBe(fox);
    expect(c.part('nope')).toBeUndefined();
  });
  it('commit prunes links, moves the rev and time on; toJSON is the plain doc', () => {
    const c = new CraftState(() => 500);
    c.load(bookmarks());
    const d = c.toJSON();
    c.commit({ ...d, items: d.items.slice(0, 1), groups: [{ id: 'g', name: 'pair', kind: 'pair', items: [d.items[0].id, d.items[1].id], rule: 'same-sheet' }] });
    expect(c.doc.rev).toBe(2); expect(c.doc.updatedAt).toBe(500);
    expect(c.items).toHaveLength(1);
    expect(c.groups).toEqual([]);
    expect(JSON.parse(JSON.stringify(c.toJSON())).v).toBe(2);
  });
});

describe('LocalRepository', () => {
  it('a v1 craft is migrated on load; once saved as v2 it loads as is', async () => {
    const store = new ProjectStore(new MemoryStorage());
    store.save({ id: 'old', name: 'Old cat', createdAt: 1, updatedAt: 2, reached: 3, kind: 'flat', path: '/make/layers', image: '', choices: { build: 'stacked', aspect: 1, widthMm: 300, stack: [{ n: 1, name: 'Gold', colour: '#D4A24C', material: 'card', visiblePct: 40, hiddenPct: 0, regionId: 'r' }], regionList: [{ id: 'r', name: 'Gold', paths: [rect(100, 100, 800, 800)] }] } });
    const repo = new LocalRepository(store, (() => { let k = 0; return () => `n${++k}`; })());
    expect((await repo.list()).map((s) => s.name)).toEqual(['Old cat']);
    const doc = (await repo.load('old'))!;
    expect(doc.v).toBe(2);
    expect(doc.items[0].parts[0].name).toBe('Gold');
    await repo.save({ ...doc, name: 'Renamed' });
    expect((await repo.load('old'))!.name).toBe('Renamed');
    await repo.remove('old');
    expect((await repo.load('old'))!.name).toBe('Old cat');
    expect(await repo.load('missing')).toBeNull();
  });
});
