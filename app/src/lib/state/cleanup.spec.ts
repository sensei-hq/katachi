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
