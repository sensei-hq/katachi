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

describe('assembly from the cut plan', () => {
  const set = { label: 'Wood', spacer: 'Glue', mmPerLayer: 3 };
  it('separate items name the sheet they are on', () => {
    const layers = [{ n: 1, name: 'Left · cut', itemName: 'Left', material: 'birch' }, { n: 2, name: 'Right · cut', itemName: 'Right', material: 'birch' }] as never;
    const steps = assemblySteps({ kind: 'flat', layers, set, joinery: 'butt', multiple: true, sheetsOf: () => [1] });
    expect(steps.map((s) => s.title)).toContain('Cut Left · sheet 01');
  });
  it('a kit read from its plan: one step per sheet, not a generic box', () => {
    const steps = assemblySteps({ kind: '3d', layers: [], set, joinery: 'tabs', kit: [{ name: 'A1', pieces: 20 }, { name: 'B1', pieces: 12 }] });
    expect(steps[0].detail).toContain('2 sheets, about 32 pieces');
    expect(steps.map((s) => s.title)).toContain('Sheet B1 · press out its pieces');
    expect(steps.some((s) => /roof/.test(s.title))).toBe(false);
  });
});

describe('assembly keeps the pairs found at Layers', () => {
  const L = (n: number, itemName: string) => ({ n, name: `${itemName} · cut`, shapes: ['sky' as const], colour: '#C8A57A', visiblePct: 4, hiddenPct: 0, material: '3 mm birch plywood', itemName, role: 'cut' as const });
  // layer order as found (reading order): the two of a pair are not next to each other
  const layers = [L(1, 'swirl left'), L(2, 'leaf left'), L(3, 'swirl right'), L(4, 'leaf right'), L(5, 'odd one')];
  const groups = [{ name: 'Pair 01', kind: 'pair' as const, items: ['swirl left', 'swirl right'] }, { name: 'Pair 02', kind: 'pair' as const, items: ['leaf left', 'leaf right'] }];
  const steps = assemblySteps({ kind: 'flat', layers, set: layerSets.wood, joinery: 'finger', multiple: true, groups });

  it('puts each pair’s two items one after the other, named by their pair, before the items on their own', () => {
    expect(steps.filter((s) => s.layer).map((s) => s.layer)).toEqual([1, 3, 2, 4, 5]);
    expect(steps[1]).toMatchObject({ group: 'Pair 01', title: 'Pair 01 · swirl left' });
    expect(steps[1].detail).toContain('with swirl right');
    expect(steps[2].detail).toMatch(/^The other of the pair with swirl left/);
    expect(steps[5].title).toBe('Cut odd one');
    expect(steps[0].detail).toContain('2 pairs');
  });
  it('without pairs, one step per item as before', () => {
    const plain = assemblySteps({ kind: 'flat', layers, set: layerSets.wood, joinery: 'finger', multiple: true });
    expect(plain.filter((s) => s.layer).map((s) => s.layer)).toEqual([1, 2, 3, 4, 5]);
    expect(plain.some((s) => s.group)).toBe(false);
  });
});
