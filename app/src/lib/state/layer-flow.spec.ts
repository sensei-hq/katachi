import { describe, expect, it } from 'vitest';
import { LayerFlowState } from './layer-flow.svelte';
import { kinds, layerSets, regions as fixtureRegions, steps } from '../content/layers';

// A fresh flow starts empty (no placeholder layers); these tests seed the fixture results explicitly,
// the way MuseAgents.apply* would after a live call.
const seeded = () => {
  const f = new LayerFlowState();
  f.applyRegions(fixtureRegions.map((r) => ({ ...r })) as never);
  f.applyLayers(layerSets.paper.layers.map((l) => ({ ...l, shapes: [...l.shapes] })));
  return f;
};

describe('LayerFlowState · image → layers (docs/design/01 S1–S9)', () => {
  it('walks seven routes (assemble last); the kind picker routes flat art to the cutout, 3D to six views, reference to changes', () => {
    expect(steps.map((s) => s.id)).toEqual(['import', 'cutout', 'segment', 'layers', 'gaps', 'output', 'assemble']);
    expect(Object.fromEntries(kinds.map((k) => [k.id, k.next]))).toEqual({ flat: '/make/cutout', '3d': '/make/views', ref: '/make/reference' });
    const f = new LayerFlowState();
    expect(f.kind).toBe('flat');
    f.setKind('3d');
    expect(f.currentKind.next).toBe('/make/views');
  });

  it('D1: "make it as" paper or wood picks the layer set', () => {
    const f = new LayerFlowState();
    expect(f.makeAs).toBe('auto');
    f.setMakeAs('wood');
    expect([f.makeAs, f.set]).toEqual(['wood', 'wood']);
    f.setMakeAs('acrylic');
    expect([f.makeAs, f.set]).toEqual(['acrylic', 'wood']);
    f.setMakeAs('paper');
    expect(f.set).toBe('paper');
  });

  it('D2: segment view (masks · cutout · original) and refine tool', () => {
    const f = new LayerFlowState();
    expect([f.segmentView, f.refineTool]).toEqual(['masks', 'pick']);
    f.setSegmentView('original');
    f.setRefineTool('box');
    expect([f.segmentView, f.refineTool]).toEqual(['original', 'box']);
  });

  it('M05: "next layer" walks the stack and wraps to the back', () => {
    const f = seeded();
    f.selectLayer(f.layers.length);
    f.nextLayer();
    expect(f.selected.n).toBe(1);
    f.nextLayer();
    expect(f.selected.n).toBe(2);
  });

  it('D5: joinery for the six-view parts defaults to finger joints', () => {
    const f = new LayerFlowState();
    expect(f.joinery).toBe('finger');
    f.setJoinery('tabs');
    expect(f.joinery).toBe('tabs');
  });

  it('a snapshot of every choice restores into a fresh flow (projects save and reopen)', () => {
    const f = seeded();
    f.setKind('3d'); f.setMakeAs('wood'); f.toggleRegion('sun'); f.selectLayer(2); f.setGapRule('leave'); f.toggleSolid(1); f.setDevice('xtool'); f.setJoinery('tabs');
    const g = new LayerFlowState();
    g.restore(JSON.parse(JSON.stringify(f.snapshot())));
    expect(g.snapshot()).toEqual(f.snapshot());
    expect([g.kind, g.set, g.selected.n, g.gapRule, g.currentDevice.id]).toEqual(['3d', 'wood', 2, 'leave', 'xtool']);
    expect(g.regions.find((r) => r.id === 'sun')?.on).toBe(false);
  });

  it('layers: duplicate puts a copy in front of the layer and selects it; numbers follow the stack', () => {
    const f = seeded();
    const before = f.layers.length;
    f.duplicate(2);
    expect(f.layers).toHaveLength(before + 1);
    expect(f.layers.map((l) => l.n)).toEqual(Array.from({ length: before + 1 }, (_, i) => i + 1));
    expect(f.layers[2]).toMatchObject({ n: 3, name: 'Sun copy', shapes: ['sun'] });
    expect(f.selected.name).toBe('Sun copy');
  });

  it('layers: merge down joins a layer with the one in front; split (by islands) restores the parts', () => {
    const f = seeded();
    const [sky, sun] = f.layers;
    expect(f.canMergeDown(f.layers.length)).toBe(false);
    f.mergeDown(1);
    expect(f.layers[0]).toMatchObject({ n: 1, name: 'Sky + Sun', shapes: ['sky', 'sun'], colour: sun.colour });
    expect(f.selected.n).toBe(1);
    expect(f.canSplit(1)).toBe(true);
    expect(f.canSplit(2)).toBe(false);
    f.split(1);
    expect(f.layers.slice(0, 2).map((l) => [l.n, l.name, l.shapes])).toEqual([[1, sky.name, sky.shapes], [2, sun.name, sun.shapes]]);
  });

  it('layers: the selected layer can show its solid part, its hidden part, or both', () => {
    const f = new LayerFlowState();
    expect([f.showSolid, f.showHidden]).toEqual([true, true]);
    f.toggleHiddenView();
    f.toggleSolidView();
    expect([f.showSolid, f.showHidden]).toEqual([false, false]);
  });

  it('output: one sheet at a time — feed, send, cutting, verify, next; cut again repeats the sheet', () => {
    const f = seeded();
    const n = f.layers.length;
    expect(f.job).toMatchObject({ sheet: 1, phase: 'feed', progress: 0 });
    expect(f.feedText).toBe(`Feed ${f.layers[0].material}`);
    f.beginCut();
    expect(f.job.phase).toBe('cutting');
    f.advanceCut(60); f.advanceCut(60);
    expect(f.job).toMatchObject({ phase: 'verify', progress: 100 });
    f.recut();
    expect(f.job).toMatchObject({ sheet: 1, phase: 'feed', progress: 0 });
    f.beginCut(); f.advanceCut(100); f.confirmCut();
    expect(f.job).toMatchObject({ sheet: 2, phase: 'feed' });
    expect(f.sheetStatus(1)).toBe('cut');
    expect(f.sheetStatus(2)).toBe('current');
    for (let i = 2; i <= n; i++) { f.beginCut(); f.advanceCut(100); f.confirmCut(); }
    expect(f.job.phase).toBe('done');
    f.setDevice('xtool');
    expect(f.job).toMatchObject({ sheet: 1, phase: 'feed' });
  });

  it('S4: keeps regions by default except the bought frame; toggling updates the kept share', () => {
    const f = seeded();
    expect(f.regions.find((r) => r.id === 'frame')?.on).toBe(false);
    const before = f.keptPct;
    f.toggleRegion('sun');
    expect(f.keptPct).toBeLessThan(before);
    f.toggleRegion('frame');
    expect(f.kept.map((r) => r.id)).toContain('frame');
  });

  it('S5a: the medium picks the material data; the stack itself comes from the plan, depth follows the selected layer', () => {
    const f = seeded();
    expect(f.layers).toHaveLength(layerSets.paper.layers.length);
    f.selectLayer(3);
    expect(f.selected.n).toBe(3);
    expect(f.depthMm).toBe((3 * layerSets.paper.mmPerLayer).toFixed(1));
    f.setSet('wood');
    expect(f.data.mmPerLayer).toBe(3);
    expect(f.layers).toHaveLength(layerSets.paper.layers.length);
  });

  it('S6: the gap rule fills structural layers under "smart"; per-layer overrides win; material % follows', () => {
    const f = seeded();
    f.setGapRule('extend');
    expect(f.gapCards.every((c) => c.solid)).toBe(true);
    const full = f.materialPct;
    f.setGapRule('leave');
    expect(f.gapCards.every((c) => !c.solid)).toBe(true);
    expect(f.materialPct).toBeLessThan(full);
    f.setGapRule('smart');
    expect(f.gapCards.filter((c) => c.solid).map((c) => c.n)).toEqual(f.structural);
    f.toggleSolid(2);
    expect(f.gapCards.find((c) => c.n === 2)?.solid).toBe(true);
    f.setGapRule('smart');
    expect(f.gapCards.find((c) => c.n === 2)?.solid).toBe(false);
  });

  it('S6 (phone): one gap choice, optionally for every layer', () => {
    const f = new LayerFlowState();
    expect(f.gapChoice).toBe('extend');
    f.setGapChoice('imagine');
    expect(f.currentGap.label).toBe('Let Katachi imagine it');
    expect(f.applyAll).toBe(true);
    f.toggleApplyAll();
    expect(f.applyAll).toBe(false);
  });

  it('S5b: six views — shoot fills the next missing view', () => {
    const f = new LayerFlowState();
    expect(f.views.filter((v) => v.ok).map((v) => v.id)).toEqual(['front', 'right', 'back']);
    expect(f.nextView?.id).toBe('left');
    f.shoot();
    expect(f.nextView?.id).toBe('top');
    f.toggleView('front');
    expect(f.views.find((v) => v.id === 'front')?.ok).toBe(false);
  });

  it('reference + changes: each change can be skipped', () => {
    const f = new LayerFlowState();
    expect(f.activeChanges).toBe(3);
    f.toggleChange(2);
    expect(f.activeChanges).toBe(2);
  });

  it('output: the device choice drives format, time and the call to action', () => {
    const f = new LayerFlowState();
    expect(f.currentDevice.id).toBe('cricut');
    f.setDevice('xtool');
    expect(f.currentDevice.cta).toBe('Cut');
  });
});
