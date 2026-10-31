import { describe, expect, it } from 'vitest';
import { interpretLayerOp } from './layer-op';
import type { MetaClient } from './client';

describe('layers.refine · Spark reads one edit for one layer', () => {
  it('asks Spark with the layer and the other layers, and returns its op', async () => {
    let asked = '';
    const client = { sparkJson: async (_s: string, user: string) => { asked = user; return { data: { op: 'fill', colour: '', other: '', reply: 'Filling the backing.' }, costUsd: 0.002, latencyMs: 300 }; } } as unknown as MetaClient;
    const r = await interpretLayerOp({ META_API_KEY: 'k' }, { text: 'make it completely filled', layer: 'Gold backing', layers: ['Black cat'] }, client);
    expect(r).toMatchObject({ source: 'live', answer: { op: 'fill', reply: 'Filling the backing.' } });
    expect(asked).toContain('Layer: Gold backing'); expect(asked).toContain('Black cat');
  });
  it('without a key, an unknown op, or a failure: a note (none)', async () => {
    expect((await interpretLayerOp({}, { text: 'x' })).answer.op).toBe('none');
    const bad = { sparkJson: async () => ({ data: { op: 'explode' }, costUsd: 0, latencyMs: 1 }) } as unknown as MetaClient;
    expect((await interpretLayerOp({ META_API_KEY: 'k' }, { text: 'x' }, bad)).source).toBe('fixture');
    const broken = { sparkJson: async () => { throw new Error('down'); } } as unknown as MetaClient;
    expect((await interpretLayerOp({ META_API_KEY: 'k' }, { text: 'x' }, broken)).answer.op).toBe('none');
  });
});
