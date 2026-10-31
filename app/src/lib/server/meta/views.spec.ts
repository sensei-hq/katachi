import { describe, expect, it } from 'vitest';
import { fixtureViews, sortViews } from './views';
import type { MetaClient } from './client';

describe('several pictures of one object · Spark sorts them', () => {
  it('sends every supported picture at once and keeps the roles it returns (any number, extras allowed)', async () => {
    let sent = 0;
    const client = { sparkVisionMany: async (_s: string, _t: string, imgs: string[]) => { sent = imgs.length; return { data: { subject: 'a lit wooden castle', likelyMaterial: 'wood', realSizeMm: { w: 260, h: 300, d: 260, basis: 'a desk lamp-sized model' }, pictures: [
      { index: 1, kind: 'view', angle: 'front', note: '' }, { index: 2, kind: 'detail', angle: 'unknown', note: 'lit doorway' }, { index: 3, kind: 'plan', angle: 'unknown', note: 'parts layout' }, { index: 9, kind: 'view', angle: 'top', note: 'out of range' }] }, costUsd: 0.03, latencyMs: 2000 }; } } as unknown as MetaClient;
    const r = await sortViews({ META_API_KEY: 'k' }, ['data:image/webp;base64,A', 'data:image/jpeg;base64,B', 'data:image/png;base64,C', 'data:image/avif;base64,D'], client);
    expect(sent).toBe(3);
    expect(r.source).toBe('live');
    expect(r.brief.pictures.map((p) => p.kind)).toEqual(['view', 'detail', 'plan']);
  });
  it('without a key: the usual shooting order', async () => {
    expect((await sortViews({}, ['a', 'b'])).brief.pictures.map((p) => p.angle)).toEqual(['front', 'right']);
    expect(fixtureViews(7).pictures.at(-1)?.angle).toBe('unknown');
    const broken = { sparkVisionMany: async () => { throw new Error('x'); } } as unknown as MetaClient;
    expect((await sortViews({ META_API_KEY: 'k' }, ['data:image/png;base64,A'], broken)).source).toBe('fixture');
  });
});
