import { describe, expect, it } from 'vitest';
import { assemblySteps } from './assembly';
import { layerSets } from '../content/layers';

describe('assembly instructions (R-UX-6)', () => {
  it('stacked: lay out, then one step per layer back → front with the spacer, then finish', () => {
    const set = layerSets.paper;
    const steps = assemblySteps({ kind: 'flat', layers: set.layers, set, joinery: 'finger' });
    expect(steps).toHaveLength(set.layers.length + 2);
    expect(steps[1]).toMatchObject({ layer: 1, title: 'Sheet 01 · Sky is the back' });
    expect(steps[2].detail).toContain('foam dots');
    expect(steps.at(-1)?.title).toBe('Press and finish');
  });

  it('wood stacks are glued flush and clamped', () => {
    const set = layerSets.wood;
    const steps = assemblySteps({ kind: 'flat', layers: set.layers, set, joinery: 'finger' });
    expect(steps[2].detail).toContain('Glued flush');
    expect(steps.at(-1)?.detail).toContain('Clamp');
  });

  it('joined: parts with the chosen joinery', () => {
    const steps = assemblySteps({ kind: '3d', layers: [], set: layerSets.wood, joinery: 'tabs' });
    expect(steps.map((s) => s.title)).toEqual(['Dry-fit every part', 'Front and back on the floor', 'Add the sides', 'Fit the roof', 'Clamp and let it set']);
    expect(steps[1].detail).toContain('tabs');
  });
});

describe('assembly for mixed items (design/08-A)', () => {
  it('groups steps per item: single cut for plain items, stack steps for layered ones', async () => {
    const { assemblySteps } = await import('./assembly');
    const mk = (n: number, name: string, itemName: string) => ({ n, name, itemName, shapes: ['sky' as const], colour: '#111111', visiblePct: 10, hiddenPct: 0, material: 'Birch' });
    const steps = assemblySteps({ kind: 'flat', multiple: true, joinery: 'finger', set: { label: 'Paper layers', spacer: 'glue', mmPerLayer: 2 }, layers: [mk(1, 'Plain bookmark', 'Plain bookmark'), mk(2, 'Cat base', 'Cat bookmark'), mk(3, 'Flower', 'Cat bookmark')] });
    const titles = steps.map((s) => s.title);
    expect(titles).toContain('Cut Plain bookmark');
    expect(titles).toContain('Stack Cat bookmark');
    expect(titles.at(-1)).toBe('Finish and attach');
  });
});
