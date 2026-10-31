import { describe, expect, it } from 'vitest';
import { AppState } from './app.svelte';
import { ProjectStore, type KeyValueStorage, type ProjectRecord } from './project.svelte';
import { getCraftData } from './media-store';

/** a localStorage that refuses anything over `cap` characters, like a full browser quota */
class SmallStorage implements KeyValueStorage {
  data: Record<string, string> = {};
  constructor(private cap: number) {}
  getItem(k: string) { return this.data[k] ?? null; }
  setItem(k: string, v: string) { if (v.length > this.cap) throw new Error('QuotaExceededError'); this.data[k] = v; }
  removeItem(k: string) { delete this.data[k]; }
}
const rec = (id: string, image: string, t: number): ProjectRecord => ({ id, name: id, createdAt: t, updatedAt: t, reached: 0, kind: 'flat', path: '/make/import', image, choices: {} });

describe('crafts survive a full browser storage', () => {
  it('a save never throws on quota: old thumbnails go first (the photos stay in IndexedDB)', () => {
    const store = new ProjectStore(new SmallStorage(2500));
    store.save(rec('a', 'x'.repeat(1000), 1));
    store.save(rec('b', 'y'.repeat(1000), 2));
    expect(() => store.save(rec('c', 'z'.repeat(1000), 3))).not.toThrow();
    const list = store.list();
    expect(list.map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(list.find((p) => p.id === 'a')!.image).toBe('');
    expect(list.find((p) => p.id === 'c')!.image).not.toBe('');
  });

  it('traced paths are kept out of the craft list and come back when the craft is reopened', async () => {
    const storage = new SmallStorage(200_000);
    const a = new AppState(new ProjectStore(storage));
    a.startCraft('flat');
    a.startFromCapture({ images: ['x'], mode: 'single' });
    const paths: [number, number][][] = [Array.from({ length: 4000 }, (_, i) => [i % 1000, (i * 7) % 1000] as [number, number])];
    a.layers.applyCutout({ outline: { shape: 'free', sizeMm: 300 }, checks: [], paths });
    a.save();
    const listed = JSON.stringify(storage.data);
    expect(listed).not.toContain('"subjectPaths"');
    expect((await getCraftData(a.project!.id))?.subjectPaths).toHaveLength(1);
    const b = new AppState(new ProjectStore(storage));
    await b.hydrating;
    expect(b.layers.subjectPaths).toHaveLength(1);
    expect(b.layers.subjectPaths[0]).toHaveLength(4000);
  });
});
