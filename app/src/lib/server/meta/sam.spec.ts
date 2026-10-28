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

describe('decodeSamMasks (full bit decode via @meta-sam/parser)', () => {
  // Recorded live SAM 3.1 response for "sun" on samples/layered/setting_sun_circle_scene.webp (2026-10-28).
  const SUN = "<|box;x1=728;y1=329;x2=1053;y2=531;w=1588;h=1588|><|mask;x=0;y=0;data=203,326,!!!!#kAq1j9u_Sx(hp_i:l?dD&f5.i@g`U2Asv7r897@+5GX`Iznq$:CRh7Xt_Dx*ve!C1[P/PsuIyHQc+UT03ZeJxmRmjV$Tc6ZNqm3F_w@UhJ%lOxL0M*4'A91G^reWlWm0rhKZK_?a^rS9X&B2.a$PS^!6J[0Q/-F9g!UCBBBTlxd[Qg:+CSu'ik`VE3a2!3e!!|>";
  it('decodes every bit: raster size, coverage and a traced path', async () => {
    const { decodeSamText } = await import('./sam');
    const found = decodeSamText(SUN);
    expect(found).toHaveLength(1);
    expect([found[0].maskW, found[0].maskH, found[0].raster.length]).toEqual([326, 203, 326 * 203]);
    expect(found[0].ones).toBe(40987);
    expect(found[0].areaPct).toBeGreaterThan(1);
    expect(found[0].areaPct).toBeLessThan(3);
    expect(found[0].paths.length).toBeGreaterThanOrEqual(1);
    expect(found[0].imgW).toBe(1588);
  });
  it('returns nothing for text without masks', async () => {
    const { decodeSamText } = await import('./sam');
    expect(decodeSamText('no masks here')).toEqual([]);
  });
});
