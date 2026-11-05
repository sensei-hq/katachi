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

describe('segmentRegions · multiple items with per-item layers (design/08-A)', () => {
  it('matches SAM instances left-to-right and segments a stacked item’s insides scoped to its box', async () => {
    const { segmentRegions } = await import('./sam');
    const sunPayload = "203,326,!!!!#kAq1j9u_Sx(hp_i:l?dD&f5.i@g`U2Asv7r897@+5GX`Iznq$:CRh7Xt_Dx*ve!C1[P/PsuIyHQc+UT03ZeJxmRmjV$Tc6ZNqm3F_w@UhJ%lOxL0M*4'A91G^reWlWm0rhKZK_?a^rS9X&B2.a$PS^!6J[0Q/-F9g!UCBBBTlxd[Qg:+CSu'ik`VE3a2!3e!!";
    // generic prompt -> two instances; internal phrase -> one scoped mask; anything else -> nothing
    const client = { samText: async (_img: string, prompt: string) => {
      if (prompt === 'two bookmarks') return `<|box;x1=100;y1=100;x2=300;y2=700;w=1000;h=1000|><|mask;x=0;y=0;data=${sunPayload}|><|box;x1=500;y1=100;x2=700;y2=700;w=1000;h=1000|><|mask;x=0;y=0;data=${sunPayload}|>`;
      if (prompt === 'cat silhouette') return `<|box;x1=520;y1=200;x2=620;y2=400;w=1000;h=1000|><|mask;x=0;y=0;data=${sunPayload}|>`;
      return 'nothing';
    } };
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/jpeg;base64,AA', [], client as never, {
      subjectPrompt: 'two bookmarks',
      items: [
        { id: 'b1', label: 'Plain bookmark', samPrompt: 'plain bookmark', arrangement: 'single-item', regions: [] },
        { id: 'b2', label: 'Cat bookmark', samPrompt: 'cat bookmark', arrangement: 'stacked', regions: [{ id: 'cat', label: 'Cat', samPrompt: 'cat silhouette' }] }
      ]
    });
    expect(r.regions.map((x) => [x.label, x.itemName])).toEqual([['Plain bookmark', 'Plain bookmark'], ['Cat', 'Cat bookmark']]);
    expect(r.regions[0].box?.x1).toBe(100);
  });
});

describe('segmentRegions · many items (live earrings: Spark saw 28, nothing came back)', () => {
  const one = (x: number) => `<|box;x1=${x};y1=100;x2=${x + 50};y2=200;w=1000;h=1000|><|mask;x=0;y=0;data=2,2,!!!!|>`;
  it('stays within the call budget and a failing call is an empty answer, not the end of the request', async () => {
    const { segmentRegions, SAM_BUDGET } = await import('./sam');
    let n = 0;
    const client = { samText: async (_: string, phrase: string) => { n++; if (phrase.includes('7')) throw new Error('429'); return phrase.startsWith('earring') ? one(n * 10) : ''; } };
    const regions = Array.from({ length: 28 }, (_, i) => ({ id: `r${i}`, label: `earring ${i}`, samPrompt: `earring ${i}` }));
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', regions, client as never);
    expect(n).toBeLessThanOrEqual(SAM_BUDGET);
    expect(r.source).toBe('live');
    expect(r.regions.filter((x) => x.box).length).toBeGreaterThan(10);
  });
  it('multiple items: shorter generic phrases are tried when the subject phrase finds fewer than two', async () => {
    const { segmentRegions } = await import('./sam');
    const said: string[] = [];
    const client = { samText: async (_: string, phrase: string) => { said.push(phrase); return phrase === 'earrings' ? one(100) + one(300) + one(500) : ''; } };
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', [{ id: 'a', label: 'Swirl left', samPrompt: 'swirl' }, { id: 'b', label: 'Swirl right', samPrompt: 'swirl' }], client as never, { multiple: true, subjectPrompt: 'eight laser-cut wooden earrings' });
    expect(said.slice(0, 3)).toEqual(['eight laser-cut wooden earrings', 'wooden earrings', 'earrings']);
    const xs = r.regions.map((x) => x.box?.x1 ?? -1);
    expect(xs[0]).toBeGreaterThanOrEqual(0);
    expect(xs[1]).toBeGreaterThan(xs[0]);
  });
});

describe('segmentRegions · overlapping items (fanned bookmarks)', () => {
  // a real one-bit mask (the sun's, from the decode test) placed at each box
  const SUN_MASK = "<|mask;x=0;y=0;data=203,326,!!!!#kAq1j9u_Sx(hp_i:l?dD&f5.i@g`U2Asv7r897@+5GX`Iznq$:CRh7Xt_Dx*ve!C1[P/PsuIyHQc+UT03ZeJxmRmjV$Tc6ZNqm3F_w@UhJ%lOxL0M*4'A91G^reWlWm0rhKZK_?a^rS9X&B2.a$PS^!6J[0Q/-F9g!UCBBBTlxd[Qg:+CSu'ik`VE3a2!3e!!|>";
  // one item's mask: the same bits on a 2000 px image (a quarter of the area); the merged one on a 1000 px image
  const m = (x1: number, x2: number) => (x2 - x1 > 500 ? `<|box;x1=${x1};y1=100;x2=${x2};y2=900;w=1000;h=1000|>${SUN_MASK}` : `<|box;x1=${x1 * 2};y1=200;x2=${x2 * 2};y2=1800;w=2000;h=2000|>${SUN_MASK}`);
  it('a mask covering several items is not handed to each of them; each gets its own', async () => {
    const { segmentRegions } = await import('./sam');
    const names = ['Elephant', 'Fox', 'Whale'];
    // the generic phrase: one mask over all three; each own phrase: the merged mask first, then its own
    const own: Record<string, string> = { Elephant: m(0, 900) + m(0, 300), Fox: m(0, 900) + m(0, 300) + m(300, 600), Whale: m(600, 900) };
    const client = { samText: async (_: string, phrase: string) => (phrase === 'bookmarks' ? m(0, 900) : own[phrase] ?? '') };
    const items = names.map((n) => ({ id: n, label: n, samPrompt: n, arrangement: 'single-item' as const, regions: [] }));
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', [], client as never, { subjectPrompt: 'bookmarks', items });
    const boxes = r.regions.map((x) => x.box ? [x.box.x1, x.box.x2] : null);
    expect(new Set(boxes.map((b) => JSON.stringify(b))).size).toBe(3);
    expect(boxes.every((b) => b && b[1] - b[0] < 500)).toBe(true);
  });
});

describe('segmentRegions · a tray of earrings on bought hooks', () => {
  const SUN = "203,326,!!!!#kAq1j9u_Sx(hp_i:l?dD&f5.i@g`U2Asv7r897@+5GX`Iznq$:CRh7Xt_Dx*ve!C1[P/PsuIyHQc+UT03ZeJxmRmjV$Tc6ZNqm3F_w@UhJ%lOxL0M*4'A91G^reWlWm0rhKZK_?a^rS9X&B2.a$PS^!6J[0Q/-F9g!UCBBBTlxd[Qg:+CSu'ik`VE3a2!3e!!";
  const at = (x: number, y: number) => `<|box;x1=${x * 4};y1=${y * 4};x2=${x * 4 + 160};y2=${y * 4 + 360};w=4000;h=4000|><|mask;x=0;y=0;data=${SUN}|>`;
  const tray = (n: number) => Array.from({ length: n }, (_, i) => at(20 + (i % 7) * 130, 50 + Math.floor(i / 7) * 230)).join('');
  const items = Array.from({ length: 28 }, (_, i) => ({ id: `e${i + 1}`, label: `earring ${i + 1}`, samPrompt: `earring ${i + 1}`, arrangement: 'stacked' as const,
    regions: [{ id: `e${i + 1}-p`, label: 'wood pendant', samPrompt: 'wooden pendant' }, { id: `e${i + 1}-h`, label: 'fish hook', samPrompt: 'metal ear hook', likelyBought: true }] }));
  it('one call for the whole tray: the bought hooks need no SAM call and one part left is the item itself', async () => {
    const { segmentRegions } = await import('./sam');
    let n = 0;
    const client = { samText: async () => { n++; return tray(28); } };
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', [], client as never, { subjectPrompt: 'wooden earrings', items });
    expect(n).toBe(1);
    expect(r.regions).toHaveLength(28);
    expect(r.regions.every((x) => x.paths?.length && x.keep)).toBe(true);
  });
  it('a few short (26 of 28): only a handful of own-phrase calls, the rest take the free instances', async () => {
    const { segmentRegions } = await import('./sam');
    let n = 0;
    const client = { samText: async () => { n++; return tray(26); } };
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', [], client as never, { subjectPrompt: 'wooden earrings', items });
    expect(n).toBeLessThanOrEqual(5);
    expect(r.regions.filter((x) => x.paths?.length).length).toBe(26);
  });
});

describe('segmentRegions · short pool (live earrings: generic phrase missed 7 of 28)', () => {
  const SUN = "203,326,!!!!#kAq1j9u_Sx(hp_i:l?dD&f5.i@g`U2Asv7r897@+5GX`Iznq$:CRh7Xt_Dx*ve!C1[P/PsuIyHQc+UT03ZeJxmRmjV$Tc6ZNqm3F_w@UhJ%lOxL0M*4'A91G^reWlWm0rhKZK_?a^rS9X&B2.a$PS^!6J[0Q/-F9g!UCBBBTlxd[Qg:+CSu'ik`VE3a2!3e!!";
  const at = (x: number) => `<|box;x1=${x};y1=100;x2=${x + 40};y2=200;w=1000;h=1000|><|mask;x=0;y=0;data=${SUN}|>`;
  const items = (n: number, samPrompt: (i: number) => string) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, label: `earring ${i}`, samPrompt: samPrompt(i), arrangement: 'single-item' as const, regions: [] }));
  it('shorter generic phrases refill the pool before any item asks in its own words', async () => {
    const { segmentRegions } = await import('./sam');
    const said: string[] = [];
    const client = { samText: async (_: string, phrase: string) => { said.push(phrase); return phrase === 'four wooden earrings on fabric' ? at(0) + at(100) : phrase === 'wooden earrings' ? at(200) + at(300) : ''; } };
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', [], client as never, { subjectPrompt: 'four wooden earrings on fabric', items: items(4, (i) => `earring ${i}`) });
    expect(said).toContain('wooden earrings');
    expect(r.regions.filter((x) => x.box).length).toBe(4);
  });
  it('every bare item asks in its own words (no 4-ask cliff past 12 items), taking one mask from the set-sized answer', async () => {
    const { segmentRegions } = await import('./sam');
    let n = 0;
    // the generic phrase finds 2 of 13; each own phrase answers with the set again plus one new mask
    const client = { samText: async (_: string, phrase: string) => { n++; if (phrase === 'beads') return at(0) + at(100); const i = Number(phrase.split(' ')[1]); return Number.isNaN(i) ? '' : at(0) + at(100) + at(200 + i * 60); } };
    const r = await segmentRegions({ META_API_KEY: 'k' }, 'data:image/webp;base64,AA', [], client as never, { subjectPrompt: 'beads', items: items(13, (i) => `bead ${i}`) });
    expect(r.regions.filter((x) => x.box).length).toBe(13);
    expect(n).toBe(12);
  });
});

describe('readingOrder (how SAM masks meet Spark’s item list)', () => {
  it('rows top to bottom, each left to right — not by x alone, which put row 1 and row 4 of a column side by side', async () => {
    const { readingOrder } = await import('./sam');
    const b = (x: number, y: number, tag: string) => ({ tag, box: { x1: x, y1: y, x2: x + 60, y2: y + 150 } });
    const ms = [b(30, 620, 'r4c1'), b(40, 20, 'r1c1'), b(200, 30, 'r1c2'), b(190, 610, 'r4c2'), b(35, 220, 'r2c1'), b(210, 225, 'r2c2')];
    expect(readingOrder(ms).map((m) => m.tag)).toEqual(['r1c1', 'r1c2', 'r2c1', 'r2c2', 'r4c1', 'r4c2']);
    // fanned in one row: left to right
    expect(readingOrder([b(500, 100, 'c'), b(20, 140, 'a'), b(260, 80, 'b')]).map((m) => m.tag)).toEqual(['a', 'b', 'c']);
  });
});
