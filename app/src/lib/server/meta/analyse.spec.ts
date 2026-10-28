import { describe, it, expect } from 'vitest';
import { analyseScene } from './analyse';
describe('analyseScene degraded modes (PRD 04 §4.4)', () => {
  it('uses fixtures without a key', async () => {
    const r = await analyseScene({});
    expect(r.source).toBe('fixture');
    expect(r.measure.status).toBe('measured');
  });
  it('uses live Spark output when valid, falls back on invalid', async () => {
    const good = { sparkJson: async () => ({ data: { objects: [], reference: { objectId: 'x', kind: 'none' }, camera: { topDownConfidence: 0.5 }, notes: '' }, costUsd: 0.01, latencyMs: 5 }) };
    expect((await analyseScene({ META_API_KEY: 'k' }, good as any)).source).toBe('live');
    const bad = { sparkJson: async () => ({ data: { nope: 1 }, costUsd: 0, latencyMs: 1 }) };
    expect((await analyseScene({ META_API_KEY: 'k' }, bad as any)).source).toBe('fixture');
  });
});

describe('analyseImage (S2 ImageBrief)', () => {
  it('returns the fixture brief without a key or image', async () => {
    const { analyseImage } = await import('./analyse');
    const r = await analyseImage({}, undefined);
    expect(r.source).toBe('fixture');
    expect(r.brief.class).toBe('layered');
  });
  it('uses live Spark vision when the brief parses', async () => {
    const { analyseImage } = await import('./analyse');
    const brief = { subject: 'wooden sunset', class: 'layered', arrangement: 'stacked', likelyMaterial: 'wood', subjectPrompt: 'wall art', regions: [], colourGroupsHint: 5, reference: null, topDownConfidence: 0.8, notes: '' };
    const live = { sparkVision: async () => ({ data: brief, costUsd: 0.01, latencyMs: 5 }) };
    const r = await analyseImage({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', live as any);
    expect([r.source, r.brief.subject]).toEqual(['live', 'wooden sunset']);
    const bad = { sparkVision: async () => ({ data: { nope: 1 }, costUsd: 0, latencyMs: 1 }) };
    expect((await analyseImage({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', bad as any)).source).toBe('fixture');
  });
});
