import { beforeEach, describe, expect, it } from 'vitest';
import { fastPath } from '../domain/actions/chat';
import { allComposites, compositeOf, unregisterComposite } from '../domain/actions/composites';
import { registerAll } from '../domain/actions/defs';
import { craftOf, sq } from '../domain/actions/defs/fixtures';
import { MemoryStorage } from './project.svelte';
import { ChainStore, type StoredStep } from './chains';

registerAll();
let store: ChainStore;
beforeEach(() => { store = new ChainStore(new MemoryStorage()); for (const c of allComposites()) if (!c.builtin) unregisterComposite(c.id); });

const STEPS: StoredStep[] = [{ action: 'tidy', refs: [{ all: true }], opts: {} }, { action: 'smooth', refs: [{ all: true }], opts: { strength: 2 } }];
const doc = () => craftOf({ items: [{ name: 'Panel', parts: [{ name: 'Base', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(0, 0, 100)] }] }] }] });

describe('saved chains', () => {
  it('a saved chain registers, reloads after a restart, and runs by name with no model', () => {
    const storage = new MemoryStorage();
    store = new ChainStore(storage);
    const saved = store.save('Evening shine', STEPS);
    expect(saved?.id.startsWith('user-')).toBe(true);
    expect(compositeOf(saved!.id)?.calls).toHaveLength(2);
    // a restart: the registry forgets, storage remembers
    for (const c of allComposites()) if (!c.builtin) unregisterComposite(c.id);
    expect(new ChainStore(storage).load()).toHaveLength(1);
    const r = fastPath('evening shine', doc());
    expect(r?.kind).toBe('calls');
    if (r?.kind === 'calls') expect(r.calls.map((c) => c.action)).toEqual(['tidy', 'smooth']);
  });
  it('a name that also reads as an action falls through to the planner (no guessing)', () => {
    store.save('Evening tidy', STEPS);
    expect(fastPath('evening tidy', doc())).toBeNull();
  });
  it('steps that are not actions are refused, never half-saved', () => {
    expect(store.save('Bogus', [...STEPS, { action: 'frobnicate', refs: [], opts: {} }])).toBeNull();
    expect(store.save('  ', STEPS)).toBeNull();
    expect(store.load()).toHaveLength(0);
  });
  it('deleting forgets the chain (built-ins stay)', () => {
    const saved = store.save('Evening tidy', STEPS);
    expect(store.delete('polish')).toBe(false);
    expect(store.delete(saved!.id)).toBe(true);
    expect(compositeOf(saved!.id)).toBeUndefined();
    expect(store.load()).toHaveLength(0);
  });
});
