import { describe, it, expect } from 'vitest';
import { parseSamBoxes } from './sam';
const PROBE = `<0f>0<|box;x1=679;y1=195;x2=1019;y2=742;w=1024;h=1024|><|mask;x=0;y=0;data=abc|><|box;x1=350;y1=232;x2=703;y2=848;w=1024;h=1024|><|mask;x=0;y=0;data=def|>`;
describe('parseSamBoxes (SAM 3.1 text output)', () => {
  it('extracts boxes normalised to 0-1000', () => {
    const boxes = parseSamBoxes(PROBE);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x1).toBeCloseTo(663, -1);
    expect(boxes[1].y2).toBeCloseTo(828, -1);
  });
  it('returns empty for no segments', () => { expect(parseSamBoxes('nothing')).toEqual([]); });
});

describe('parseSamMasks (SAM 3.1 box + one-bit mask)', () => {
  it('extracts the box and the mask crop size from the live text shape', async () => {
    const { parseSamMasks } = await import('./sam');
    const masks = parseSamMasks('<0f>0<|box;x1=728;y1=329;x2=1053;y2=531;w=1588;h=1588|><|mask;x=0;y=0;data=203,326,!!!!#iAsGM|>');
    expect(masks).toHaveLength(1);
    expect(masks[0].box).toMatchObject({ x1: 458, y1: 207, x2: 663, y2: 334 });
    expect(masks[0].mask).toMatchObject({ h: 203, w: 326 });
    expect(masks[0].areaPct).toBeGreaterThan(0);
  });
  it('returns empty for no segments', async () => {
    const { parseSamMasks } = await import('./sam');
    expect(parseSamMasks('nothing')).toEqual([]);
  });
});

describe('segmentRegions (S4 fan-out)', () => {
  it('fans out one SAM call per phrase and keeps box + mask size', async () => {
    const { segmentRegions } = await import('./sam');
    const client = { samText: async () => '<0f>0<|box;x1=728;y1=329;x2=1053;y2=531;w=1588;h=1588|><|mask;x=0;y=0;data=203,326,abc|>' };
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', [{ id: 'sun', label: 'Sun', samPrompt: 'round sun' }], client as any);
    expect(r.source).toBe('live');
    expect(r.regions[0]).toMatchObject({ label: 'Sun', keep: true, mask: { h: 203, w: 326 } });
    expect(r.regions[0].areaPct).toBeGreaterThan(0);
  });
  it('serves fixture regions without a key', async () => {
    const { segmentRegions } = await import('./sam');
    const r = await segmentRegions({}, '', [{ id: 'sky', label: 'Sky', samPrompt: 'sky', likelyBought: true }]);
    expect([r.source, r.regions[0].keep]).toEqual(['fixture', false]);
  });
});
