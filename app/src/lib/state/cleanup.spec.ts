import { describe, expect, it } from 'vitest';
import { LayerFlowState } from './layer-flow.svelte';
import { MuseAgents } from './muse.svelte';

const square: [number, number][] = [[10, 10], [90, 10], [90, 90], [10, 90]];
describe('no placeholder layers or regions at start', () => {
  it('a fresh craft has empty stack, regions and checks until the models write results', () => {
    const f = new LayerFlowState();
    expect(f.layers).toEqual([]);
    expect(f.regions).toEqual([]);
    expect(f.cutoutChecks).toEqual([]);
    expect(f.subject).toBe('');
    expect(f.materialPct).toBe(0);
  });
  it('layers bind to their region by regionId, with hide/show state', () => {
    const f = new LayerFlowState();
    f.applyRegions([{ id: 'cat', name: 'Black cat', pct: 20, note: '', tone: 'ink', keep: true, paths: [square], colour: '#221A14' }] as never);
    f.applyLayers([{ n: 1, name: 'Black cat', shapes: ['pines'], colour: '#221A14', visiblePct: 20, hiddenPct: 0, material: 'Birch', regionId: 'cat' }] as never);
    expect(f.regionForLayer(f.layers[0])?.name).toBe('Black cat');
    expect(f.overlayForLayer(1)?.d).toContain('M10 10');
    f.toggleLayerVisible(1);
    expect(f.hiddenLayers).toEqual([1]);
    expect(f.isLayerVisible(1)).toBe(false);
  });
});
describe('multiple separate items (bookmarks) become one layer/sheet per item, not a stack', () => {
  it('planLayers builds layers from the item regions without calling /api/convert', async () => {
    const m = new MuseAgents();
    const regions = ['Elephant bookmark', 'Fox bookmark', 'Whale bookmark'].map((name, i) => ({ id: `b${i}`, name, pct: 10, note: '', tone: 'ink' as const, keep: true, paths: [square], colour: '#C89B6A', on: true }));
    const layers = await m.planLayers('c1', 'wood', { regions: regions as never, brief: { arrangement: 'multiple-items', class: 'pattern-shape' } as never });
    expect(layers.map((l) => [l.name, l.regionId, l.hiddenPct])).toEqual(regions.map((r, i) => [r.name, `b${i}`, 0]));
  });
});

describe('mixed items: a layered object among single objects', () => {
  it('stacked items contribute their internal layers, single items one cut', async () => {
    const m = new MuseAgents();
    const mk = (id: string, name: string, itemName: string) => ({ id, name, pct: 10, note: '', tone: 'ink' as const, keep: true, on: true, itemId: itemName, itemName, paths: [square] });
    const layers = await m.planLayers('c2', 'wood', { regions: [mk('b1', 'Plain bookmark', 'Plain bookmark'), mk('base', 'Cat base', 'Cat bookmark'), mk('flower', 'Flower', 'Cat bookmark')] as never, brief: { arrangement: 'multiple-items' } as never });
    expect(layers.map((l) => [l.name, l.itemName, l.hiddenPct])).toEqual([
      ['Plain bookmark', 'Plain bookmark', 0], ['Cat base', 'Cat bookmark', 40], ['Flower', 'Cat bookmark', 0]
    ]);
  });
  it('stitchViews job turns captured view boxes into panels, sheets and an ObjectSpec summary', async () => {
    const { MuseAgents: Agents } = await import('./muse.svelte');
    const m = new Agents();
    const r = await m.stitchViews('c3', { views: [{ view: 'front' }, { view: 'right' }, { view: 'top' }], sizeMm: 300, joinery: 'finger' });
    expect([r.spec.wMm, r.spec.dMm, r.spec.hMm]).toEqual([300, 171, 229]);
    expect(r.layers.map((l) => l.name)).toContain('Front');
    expect(r.sheets).toHaveLength(6);
    expect(m.tasks.at(-1)?.summary).toContain('12 joins');
  });
});

describe('region-first layer planning (convert lends titles, regions own the content)', () => {
  it('a convert title matched by stemmed words names the region layer; every layer keeps its mask region', async () => {
    const { vi } = await import('vitest');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ source: 'live', conversionClass: 'layered', pieces: [{ name: 'Red Leaf Filler', kind: 'layer', note: '' }, { name: 'White Floral Petals', kind: 'layer', note: '' }] }) })));
    try {
      const m = new MuseAgents();
      const regions = [
        { id: 'leaves', name: 'red leaves', pct: 3, note: '', tone: 'warn' as const, keep: true, on: true, paths: [square], colour: '#A33B2E' },
        { id: 'flowers', name: 'white flowers', pct: 5, note: '', tone: 'ok' as const, keep: true, on: true, paths: [square], colour: '#F2EAD8' }
      ];
      const layers = await m.planLayers('c9', 'paper', { imageDataUrl: 'data:image/jpeg;base64,AA', regions: regions as never });
      expect(layers.map((l) => [l.name, l.regionId, l.colour])).toEqual([['Red Leaf Filler', 'leaves', '#A33B2E'], ['White Floral Petals', 'flowers', '#F2EAD8']]);
    } finally { vi.unstubAllGlobals(); }
  });
});
