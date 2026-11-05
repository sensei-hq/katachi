import { describe, expect, it } from 'vitest';
import { AppState } from './app.svelte';
import { MemoryStorage, ProjectStore } from './project.svelte';
import type { Layer } from '../content/layers';

// Stack edits said in the chat (by name or by number), the toolbar's Delete, and Undo for all of them.
function earrings() {
  const app = new AppState(new ProjectStore(new MemoryStorage()));
  app.startCraft('flat');
  const L = (name: string, itemName: string, role: 'cut' | 'engrave', visiblePct: number): Layer => ({ n: 0, name, shapes: ['sky'], colour: '#C89B6A', visiblePct, hiddenPct: 0, material: '3 mm ply', itemName, role });
  app.layers.applyLayers([
    L('Left earring · cut', 'Left earring', 'cut', 20), L('Left lattice · engraving', 'Left earring', 'engrave', 4), L('Left teardrop · engraving', 'Left earring', 'engrave', 0),
    L('Right earring · cut', 'Right earring', 'cut', 20), L('Right lattice · engraving', 'Right earring', 'engrave', 4), L('Right rim · engraving', 'Right earring', 'engrave', 3)
  ]);
  app.page = '/make/layers'; app.currentStep = 'layers';
  return app;
}
const names = (app: AppState) => app.layers.layers.map((l) => l.name);
const last = (app: AppState) => app.flow.conversation.log.at(-1)?.step?.title;

describe('layer edits from the chat, with undo', () => {
  it('“remove the 0% layers” deletes the layers nothing of shows; “undo” brings them back', async () => {
    const app = earrings();
    expect(app.suggestions).toContain('Remove the empty layers');
    await app.ask('remove the 0% shows layers', '/make/layers');
    expect(last(app)).toBe('Deleted 1 empty layer');
    expect(names(app)).not.toContain('Left teardrop · engraving');
    await app.ask('undo', '/make/layers');
    expect(last(app)).toMatch(/^Undone: remove the 0% shows layers/);
    expect(names(app)).toHaveLength(6);
    await app.ask('undo', '/make/layers');
    expect(last(app)).toBe('Nothing to undo');
  });
  it('layers by number: merge layers 2 and 3, delete layer 6, merge layers 1-3; each undoable', async () => {
    const app = earrings(), f = app.layers;
    await app.ask('merge layers 2 and 3', '/make/layers');
    expect(f.layers).toHaveLength(5);
    expect(names(app)[1]).toBe('Left lattice · engraving + Left teardrop · engraving');
    expect(f.layers[1].role).toBe('engrave');
    await app.ask('delete layer 5', '/make/layers');
    expect(names(app)).not.toContain('Right rim · engraving');
    await app.ask('merge layers 1-3', '/make/layers');
    expect(f.layers).toHaveLength(2);
    await app.ask('undo', '/make/layers'); await app.ask('undo', '/make/layers'); await app.ask('undo', '/make/layers');
    expect(f.layers).toHaveLength(6);
  });
  it('“merge all the engravings into one layer”: one engraving per separate item, each still on its own sheet', async () => {
    const app = earrings(), f = app.layers;
    expect(app.suggestions).toContain('Merge all the engravings into one layer');
    await app.ask('merge all the engravings into one layer', '/make/layers');
    expect(last(app)).toBe('Merged 4 layers: one engraving per item');
    expect(f.items.map((i) => [i.name, i.layers.map((l) => l.role)])).toEqual([['Left earring', ['cut', 'engrave']], ['Right earring', ['cut', 'engrave']]]);
    expect(names(app)).toContain('Right earring · engraving');
    await app.ask('undo', '/make/layers');
    expect(f.layers).toHaveLength(6);
  });
  it('by name: a whole name wins over shared words; a word inside a name is not a command (“Swirl drop left”)', async () => {
    const app = earrings(), f = app.layers;
    f.applyLayers([...f.layers, { n: 0, name: 'Swirl drop left · cut', shapes: ['sky'], colour: '#C89B6A', visiblePct: 10, hiddenPct: 0, material: '3 mm ply', itemName: 'Swirl drop left', role: 'cut' }, { n: 0, name: 'Swirl drop right · cut', shapes: ['sky'], colour: '#C89B6A', visiblePct: 10, hiddenPct: 0, material: '3 mm ply', itemName: 'Swirl drop right', role: 'cut' }]);
    expect(app.namedLayers('merge the swirl drop left and the swirl drop right').map((l) => l.name)).toEqual(['Swirl drop left · cut', 'Swirl drop right · cut']);
    await app.ask('merge the swirl drop left and the swirl drop right', '/make/layers');
    expect(names(app)).toContain('Swirl drop left · cut + Swirl drop right · cut');
    expect(f.layers).toHaveLength(7);
    await app.ask('delete the swirl drop left and the swirl drop right layer', '/make/layers');
    expect(f.layers).toHaveLength(6);
    await app.ask('undo', '/make/layers'); await app.ask('undo', '/make/layers');
    expect(f.layers).toHaveLength(8);
  });
  it('the layer’s Delete action is said in the chat and undoable', async () => {
    const app = earrings(), f = app.layers;
    f.selectLayer(4);
    await app.layerAction(4, { kind: 'remove' });
    expect(last(app)).toBe('Deleted Right earring · cut');
    expect(f.canUndo).toBe(true);
    expect(app.undoLast()).toBe(true);
    expect(names(app)[3]).toBe('Right earring · cut');
  });
  it('a hidden item is suggested once even when two of its layers are bitten (turtle: duplicate keys crashed the chat)', () => {
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    app.startCraft('flat');
    const bite: [number, number][] = [[0, 0], [100, 0], [100, 100], [60, 100], [60, 30], [40, 30], [40, 100], [0, 100]];
    const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const L = (name: string, itemName: string): Layer => ({ n: 0, name, shapes: ['sky'], colour: '#C89B6A', visiblePct: 20, hiddenPct: 0, material: '3 mm ply', itemName, role: 'cut' });
    app.layers.applyLayers([L('Dolphin top · cut', 'Dolphin'), L('Dolphin base · cut', 'Dolphin'), L('Turtle · cut', 'Turtle')]);
    app.layers.applyRegions([
      { id: 'r1', name: 'Dolphin top', pct: 20, note: '', tone: 'ink', keep: true, paths: [bite] },
      { id: 'r2', name: 'Dolphin base', pct: 20, note: '', tone: 'ink', keep: true, paths: [bite] },
      { id: 'r3', name: 'Turtle', pct: 20, note: '', tone: 'ink', keep: true, paths: [square] }
    ] as never);
    app.page = '/make/layers'; app.currentStep = 'layers';
    expect(app.hiddenItems()).toEqual(['Dolphin']);
    const labels = app.suggestions.map((s) => (typeof s === 'string' ? s : s.label));
    expect(labels.filter((l) => l.startsWith('Complete the hidden edges'))).toEqual(['Complete the hidden edges of the Dolphin']);
    expect(new Set(labels.map((l) => l.toLowerCase())).size).toBe(labels.length);
  });
  it('same-named kept regions suggest dropping once (the chat keys suggestions by label)', () => {
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    app.startCraft('flat');
    app.layers.applyRegions([
      { id: 'r1', name: 'Blob', pct: 20, note: '', tone: 'ink', keep: true },
      { id: 'r2', name: 'Blob', pct: 15, note: '', tone: 'ink', keep: true }
    ] as never);
    app.page = '/make/layers'; app.currentStep = 'segment';
    const labels = app.suggestions.map((s) => (typeof s === 'string' ? s : s.label));
    expect(labels.filter((l) => l.startsWith('Drop the'))).toEqual(['Drop the Blob']);
  });
});
