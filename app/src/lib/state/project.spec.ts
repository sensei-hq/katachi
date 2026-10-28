import { describe, expect, it } from 'vitest';
import { MemoryStorage, ProjectStore, projectName, type ProjectRecord } from './project.svelte';

const rec = (id: string, updatedAt: number, name = id): ProjectRecord => ({
  id, name, createdAt: updatedAt, updatedAt, reached: 0, kind: 'flat', path: '/make/import', image: '', choices: {}
});

describe('project name from the first step', () => {
  it('an upload is named after its file', () => {
    expect(projectName({ fileName: 'alpine-forest.png', at: new Date(2026, 9, 28, 14, 5) })).toBe('Alpine forest');
    expect(projectName({ fileName: 'IMG_2041.HEIC', at: new Date(2026, 9, 28, 14, 5) })).toBe('IMG 2041');
  });
  it('a camera shot is named by when it was taken', () => {
    expect(projectName({ at: new Date(2026, 9, 28, 14, 5) })).toBe('Photo · 28 Oct, 14:05');
  });
});

describe('ProjectStore · saved projects (browser storage)', () => {
  it('saves, lists newest first, loads and remembers the current one', () => {
    const store = new ProjectStore(new MemoryStorage());
    store.save(rec('a', 1)); store.save(rec('b', 3)); store.save(rec('c', 2));
    expect(store.list().map((p) => p.id)).toEqual(['b', 'c', 'a']);
    store.save({ ...rec('a', 5), name: 'Renamed' });
    expect(store.list()[0]).toMatchObject({ id: 'a', name: 'Renamed' });
    expect(store.list()).toHaveLength(3);
    expect(store.load('c')?.updatedAt).toBe(2);
    store.setCurrent('c');
    expect(store.current()).toBe('c');
    store.remove('c');
    expect([store.load('c'), store.current()]).toEqual([null, null]);
  });
  it('survives corrupt storage', () => {
    const s = new MemoryStorage(); s.setItem('katachi.projects', '{nope');
    expect(new ProjectStore(s).list()).toEqual([]);
  });
});

describe('ProjectStore · per-user namespaces (invite code as user_id)', () => {
  it('isolates crafts between two invite codes on the same browser', () => {
    const mem = new MemoryStorage();
    const alice = new ProjectStore(mem, 'ALICE-1');
    alice.save(rec('a', 1));
    alice.setCurrent('a');
    const bob = new ProjectStore(mem, 'BOB-2');
    expect(bob.list()).toEqual([]);
    expect(bob.current()).toBeNull();
    bob.save(rec('b', 2));
    expect(alice.list().map((p) => p.id)).toEqual(['a']);
    expect(mem.getItem('katachi:v1:ALICE-1:projects')).toContain('"a"');
  });
  it('migrates legacy un-namespaced crafts to the first user who signs in', () => {
    const mem = new MemoryStorage();
    mem.setItem('katachi.projects', JSON.stringify([rec('old', 1)]));
    mem.setItem('katachi.current', 'old');
    const store = new ProjectStore(mem, 'guest');
    expect(store.list()).toEqual([]);
    store.setUserId('ALICE-1');
    expect(store.list().map((p) => p.id)).toEqual(['old']);
    expect(store.current()).toBe('old');
    expect(mem.getItem('katachi.projects')).toBeNull();
  });
});
