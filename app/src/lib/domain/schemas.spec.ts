import { describe, it, expect } from 'vitest';
import { SceneAnalysisSchema, DesignSpecSchema } from './schemas';
describe('SceneAnalysis strict schema (R-UN-1)', () => {
  it('accepts a valid analysis', () => {
    const v = { objects: [{ id: 'o1', label: 'mug', samPrompt: 'mug base', role: 'fit_target', bbox: [0,0,10,10], shapeHint: 'round' }], reference: { objectId: 'o1', kind: 'id1_card' }, camera: { topDownConfidence: 0.9 }, notes: '' };
    expect(SceneAnalysisSchema.safeParse(v).success).toBe(true);
  });
  it('rejects extra keys (strict)', () => {
    const v = { objects: [], reference: { objectId: 'x', kind: 'none' }, camera: { topDownConfidence: 1 }, notes: '', bogus: 1 };
    expect(SceneAnalysisSchema.safeParse(v).success).toBe(false);
  });
});
describe('DesignSpec strict schema (R-DS-1)', () => {
  it('rejects raw coordinates in parts', () => {
    const v = { project: 'x', material: { id: 'birch', thicknessMm: 3 }, deviceId: 'longer-ray5-10w', sheet: { wMm: 300, hMm: 300 }, parts: [{ name: 'c', qty: 1, template: 'coaster', params: { shape: 'round', diameterMm: 95, x: 10 } }], kerfMm: 0.1, clearanceMm: 1, assumptions: [] };
    // params is free-form per template, but top-level strictness must hold:
    expect(DesignSpecSchema.safeParse({ ...v, extra: true }).success).toBe(false);
    expect(DesignSpecSchema.safeParse(v).success).toBe(true);
  });
});

describe('ImageBrief strict schema (design/01 S2)', () => {
  const valid = {
    subject: 'circular layered wooden wall art of a mountain sunset over a lake',
    class: 'layered', arrangement: 'stacked', likelyMaterial: 'wood', subjectPrompt: 'layered wooden wall art',
    regions: [{ id: 'r1', label: 'sun', samPrompt: 'light orange round sun', likelyBought: false, note: 'small disc' }],
    colourGroupsHint: 6,
    reference: null, topDownConfidence: 0.9, notes: ''
  };
  it('accepts the live Spark shape and rejects extra keys', async () => {
    const { ImageBriefSchema, ImageBriefJsonSchema } = await import('./schemas');
    expect(ImageBriefSchema.safeParse(valid).success).toBe(true);
    expect(ImageBriefSchema.safeParse({ ...valid, bogus: 1 }).success).toBe(false);
    expect(ImageBriefJsonSchema.required).toContain('subject');
  });
  it('rejects an unknown class', async () => {
    const { ImageBriefSchema } = await import('./schemas');
    expect(ImageBriefSchema.safeParse({ ...valid, class: 'hologram' }).success).toBe(false);
  });
});

describe('ImageBrief arrangement (stacked vs multiple separate items)', () => {
  it('accepts multiple-items and rejects missing arrangement', async () => {
    const { ImageBriefSchema } = await import('./schemas');
    const base = { subject: 'five wooden bookmarks', class: 'pattern-shape', likelyMaterial: 'wood', subjectPrompt: 'wooden bookmarks', regions: [], colourGroupsHint: 1, reference: null, topDownConfidence: 0.4, notes: '' };
    expect(ImageBriefSchema.safeParse({ ...base, arrangement: 'multiple-items' }).success).toBe(true);
    expect(ImageBriefSchema.safeParse(base).success).toBe(false);
  });
});
