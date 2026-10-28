import { describe, expect, it, vi, afterEach } from 'vitest';
import { MuseAgents } from './muse.svelte';

afterEach(() => vi.unstubAllGlobals());
const stub = (handler: (url: string, body: any) => unknown) => vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => ({ ok: true, json: async () => handler(String(url), JSON.parse(init.body)) })));
const brief = { subject: 'circular layered wooden sunset', class: 'layered', likelyMaterial: 'wood', subjectPrompt: 'layered wooden wall art', regions: [{ id: 'sun', label: 'Sun', samPrompt: 'round sun', likelyBought: false, note: '' }], colourGroupsHint: 6, reference: null, topDownConfidence: 0.9, notes: '' };

describe('MuseAgents wired to the server routes (live shapes, labelled by source)', () => {
  it('describe -> cutout -> segment -> plan -> render carry live results into the live shapes', async () => {
    stub((url) => url.includes('/api/scene') ? { brief, source: 'live', trace: [{ costUsd: 0.01 }] }
      : url.includes('/api/segment') && !url.includes('regions') ? { boxes: [{ x1: 100, y1: 100, x2: 500, y2: 520 }], source: 'live', trace: [{ costUsd: 0.0025 }] }
      : url.includes('/api/convert') ? { conversionClass: 'layered', objective: 'Build the sunset', source: 'live', pieces: [{ name: 'Layer 1 (back)', kind: 'layer', note: 'sky' }, { name: 'Layer 2 (mid)', kind: 'layer', note: 'peaks' }, { name: 'Sun disc', kind: 'layer', note: 'sun' }] }
      : url.includes('/api/preview') ? { image: 'data:image/png;base64,AA', source: 'live', trace: [{ costUsd: 0.01 }] }
      : url.includes('/api/art') ? { images: ['data:image/png;base64,BB'], source: 'live', trace: [{ costUsd: 0.01 }] }
      : {});
    // segment route is told apart by its body, handled below via a second stub for regions
    const m = new MuseAgents();
    const seen = await m.describeCapture('c1', 'flat', 'data:image/jpeg;base64,AA');
    expect(seen.brief?.subject).toContain('wooden sunset');
    expect(m.tasks.at(-1)).toMatchObject({ status: 'done', costUsd: 0.01 });
    const cut = await m.cutout('c1', { imageDataUrl: 'data:image/jpeg;base64,AA', subjectPrompt: 'art' });
    expect(cut.outline.shape).toBe('circle');
    const layers = await m.planLayers('c1', 'paper', { imageDataUrl: 'data:image/jpeg;base64,AA' });
    expect(layers.map((l) => l.name)).toEqual(['Layer 1 (back)', 'Layer 2 (mid)', 'Sun disc'].map((n) => n.replace(/^Layer \d+ \((back|mid)\)\s*/i, '') || n));
    expect(layers).toHaveLength(3);
    const fin = await m.renderFinished('c1', 'data:image/jpeg;base64,AA');
    expect(fin.image).toContain('base64');
    const gaps = await m.imagineGaps('c1', 'data:image/jpeg;base64,AA');
    expect(gaps.filled).toBe(1);
    const sketch = await m.cleanSketch('c1', 'data:image/png;base64,AA');
    expect(sketch.images).toHaveLength(1);
  });

  it('segment maps SAM regions into the Region shape the pages read', async () => {
    stub(() => ({ regions: [{ id: 'sun', label: 'Sun', note: 'disc', areaPct: 4.2, keep: true }, { id: 'lake', label: 'Lake', note: '', areaPct: 20, keep: true }], source: 'live', trace: [{ costUsd: 0.005 }] }));
    const m = new MuseAgents();
    const found = await m.segment('c1', { imageDataUrl: 'data:image/webp;base64,AA', briefRegions: brief.regions });
    expect(found.map((r) => [r.name, r.pct, r.keep])).toEqual([['Sun', 4.2, true], ['Lake', 20, true]]);
    expect(m.tasks.at(-1)?.status).toBe('done');
  });

  it('brief() posts to /api/convert and returns its JSON (AppState never fetches)', async () => {
    stub(() => ({ objective: 'A layered lake panel', variations: [{ title: 'Night', change: 'moon' }] }));
    const m = new MuseAgents();
    const r = await m.brief({ imageDataUrl: 'data:image/jpeg;base64,AA', description: 'hallway piece', group: 'laser-cut' });
    expect(r.objective).toContain('lake');
  });

  it('falls back to fixtures (placeholder) when the route is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const m = new MuseAgents();
    const found = await m.segment('c1');
    expect(found.length).toBeGreaterThan(0);
    expect(m.tasks.at(-1)?.status).toBe('placeholder');
  });
});

describe('sheets.vectorise from SAM mask paths', () => {
  it('scales 0-1000 mask paths to mm and counts closed paths + cut length', async () => {
    const m = new MuseAgents();
    const square: [number, number][] = [[100, 100], [400, 100], [400, 400], [100, 400]];
    const r = await m.vectorise('c1', 2, { sizeMm: 300, regions: [{ id: 'sun', name: 'Sun', pct: 9, note: '', tone: 'accent', keep: true, paths: [square] }, { id: 'sky', name: 'Sky', pct: 20, note: '', tone: 'warn', keep: false, paths: [square] }] as never });
    expect(r.pathCount).toBe(1);
    expect(r.sheetsData[0].svg).toBe('M30 30L120 30L120 120L30 120Z');
    expect(r.sheetsData[0].cutLengthMm).toBe(360); // 300mm/1000 * 1200 units of perimeter
    expect(m.tasks.at(-1)).toMatchObject({ status: 'done', summary: expect.stringContaining('1 closed paths') });
  });
});
