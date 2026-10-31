import { describe, expect, it } from 'vitest';
import { planActions } from './actions-plan';
import type { MetaClient } from './client';

const actions = [{ id: 'merge', hint: 'Join layers', options: 'name' }, { id: 'smooth', hint: 'Smooth curves', options: 'strength 1-5' }];
const layers = [{ n: 1, name: 'Fox', item: 'Fox bookmark', role: 'cut', shows: 9 }, { n: 2, name: 'Owl', item: 'Owl bookmark', role: 'cut', shows: 9 }];
describe('the chat planner · Spark picks actions as tools', () => {
  it('sends the actions and layers, and returns validated calls (unknown actions and bad options dropped)', async () => {
    let asked = '';
    const client = { sparkJson: async (_s: string, user: string) => { asked = user; return { data: { calls: [
      { action: 'smooth', refs: [{ kind: 'item', value: 'Fox bookmark' }], optsJson: '{"strength":4}' },
      { action: 'explode', refs: [], optsJson: '{}' },
      { action: 'merge', refs: [{ kind: 'n', value: '1' }, { kind: 'n', value: '2' }], optsJson: 'not json' }
    ], reply: 'Smoothing the fox a lot, then merging.', ask: '' }, costUsd: 0.002, latencyMs: 200 }; } } as unknown as MetaClient;
    const r = await planActions({ META_API_KEY: 'k' }, { text: 'smooth the fox a lot and merge 1 and 2', layers, actions }, client);
    expect(asked).toContain('- smooth: Smooth curves Options: strength 1-5');
    expect(asked).toContain('1. Fox — item Fox bookmark, cut, 9% shows');
    expect(r.source).toBe('live');
    expect(r.answer.calls).toEqual([{ action: 'smooth', refs: [{ kind: 'item', value: 'Fox bookmark' }], opts: { strength: 4 } }, { action: 'merge', refs: [{ kind: 'n', value: '1' }, { kind: 'n', value: '2' }], opts: {} }]);
    expect(r.trace[0].purpose).toBe('action_plan');
  });
  it('no key, no text, no actions, or a failure: no calls', async () => {
    expect((await planActions({}, { text: 'x', actions })).answer.calls).toEqual([]);
    expect((await planActions({ META_API_KEY: 'k' }, { text: '', actions })).source).toBe('fixture');
    const broken = { sparkJson: async () => { throw new Error('down'); } } as unknown as MetaClient;
    expect((await planActions({ META_API_KEY: 'k' }, { text: 'x', actions }, broken)).answer.calls).toEqual([]);
  });
});
