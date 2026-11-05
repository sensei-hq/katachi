import { beforeEach, describe, expect, it } from 'vitest';
import { CraftState } from './craft/craft.svelte';
import { ActionState } from './craft/actions.svelte';
import { MemoryStorage } from './project.svelte';
import { ChainStore } from './chains';
import { GalleryState } from './gallery.svelte';
import { migrateV1 } from '../domain/craft/migrate';
import { unregisterComposite, allComposites } from '../domain/actions/composites';

let k = 0;
function setup() {
  const c = new CraftState(() => 1);
  const a = new ActionState(c, () => ({ newId: () => `n${++k}`, pixels: async () => null }), {}, new ChainStore(new MemoryStorage()));
  const g = new GalleryState(a, new ChainStore(new MemoryStorage()), c);
  return { c, g };
}
beforeEach(() => { for (const c of allComposites()) if (!c.builtin) unregisterComposite(c.id); });

describe('the gallery', () => {
  it('loads a demo per action and shelves every action', async () => {
    const { g } = setup();
    await g.load();
    expect(Object.keys(g.demos).length).toBeGreaterThan(20);
    expect(g.groups.map((x) => x.id)).toEqual(['stack', 'shape', 'photo', 'cleanup']);
    expect(g.groups.flatMap((x) => x.actions).length).toBe(Object.keys(g.demos).length);
    expect(g.actionOptions.length).toBe(Object.keys(g.demos).length);
  });
  it('chains run by name; without a craft the refusal says so', async () => {
    const { g } = setup();
    await g.load();
    expect(g.chainList.map((c) => c.id)).toContain('polish');
    expect(g.canRun).toBe(false);
    await g.runChain('polish');
    expect(g.lastRun?.id).toBe('polish');
    expect(g.lastRun?.summary.length).toBeGreaterThan(0);
  });
  it('a built chain saves, lists and deletes', async () => {
    const { g } = setup();
    await g.load();
    expect(g.saveChain('Gallery test', ['tidy', 'smooth'])?.id.startsWith('user-')).toBe(true);
    expect(g.saveChain('Bogus', ['frobnicate'])).toBeNull();
    expect(g.chainList.some((c) => c.label === 'Gallery test')).toBe(true);
    const id = g.chainList.find((c) => c.label === 'Gallery test')!.id;
    g.deleteChain(id);
    expect(g.chainList.some((c) => c.label === 'Gallery test')).toBe(false);
  });
  it('a craft opens the Run gate', async () => {
    const { c, g } = setup();
    expect(g.canRun).toBe(false);
    c.load(migrateV1({ id: 'b', name: 'Shop', createdAt: 1, updatedAt: 1, kind: 'flat' },
      { aspect: 1, widthMm: 300, regionList: [{ id: 'r', name: 'Tile', paths: [[[0, 0], [100, 0], [100, 100], [0, 100]]] }],
      stack: [{ n: 1, name: 'Tile · cut', colour: '#C89B6A', material: 'birch', visiblePct: 9, hiddenPct: 0, regionId: 'r', itemName: 'Tile', role: 'cut' }] }, () => `m${++k}`));
    expect(g.canRun).toBe(true);
  });
});
