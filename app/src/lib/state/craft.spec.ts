import { describe, expect, it } from 'vitest';
import { AppState } from './app.svelte';
import { MemoryStorage, ProjectStore } from './project.svelte';

const fresh = () => { const store = new ProjectStore(new MemoryStorage()); return { store, app: new AppState(store) }; };

describe('the craft journey in AppState (docs/design/07)', () => {
  it('a starting point opens Capture set up for it (3D: six sides on the camera; sketch: the pad)', () => {
    const { app } = fresh();
    expect(app.startCraft('3d')).toBe('/capture');
    expect([app.project?.kind, app.capture.mode, app.capture.source]).toEqual(['3d', 'multi', 'camera']);
    app.startCraft('sketch');
    expect([app.project?.kind, app.capture.mode, app.capture.source]).toEqual(['flat', 'single', 'sketch']);
    expect(app.flow.conversation.log.at(-1)?.text).toContain('Sketch it right here');
  });

  it('what you say or type picks the start and lands in the chat once', () => {
    const { app } = fresh();
    app.startCraft('a birdhouse like the one in the garden');
    expect(app.project?.kind).toBe('3d');
    expect(app.flow.conversation.log.filter((e) => e.role === 'user')).toHaveLength(1);
  });

  it('ask: on Home it starts a craft (returns where to go); on a craft step it is a note for the step and layer', async () => {
    const { app } = fresh();
    expect(await app.ask('a layered mountain picture', '/workshop')).toBe('/capture');
    app.startFromCapture({ images: ['x'], mode: 'single' });
    const { layerSets } = await import('../content/layers');
    app.layers.applyLayers(layerSets.paper.layers.map((l) => ({ ...l, shapes: [...l.shapes] })));
    app.layers.selectLayer(5);
    expect(await app.ask('split the hills in two', '/make/layers')).toBeNull();
    expect(app.layers.notes).toEqual([{ step: 'Layers', layer: 'Layer 5 · Hills', text: 'split the hills in two' }]);
    await app.ask('shadow on the left edge', '/make/cutout');
    expect(app.layers.notes.at(-1)).toEqual({ step: 'Shape', text: 'shadow on the left edge' });
    expect(app.flow.conversation.log.at(-1)?.text).toContain('Noted for Shape');
  });

  it('a remix lands on its changes; the journey progress follows the path', () => {
    const { app } = fresh();
    app.startCraft('ref');
    app.startFromCapture({ images: ['x'], mode: 'single' });
    expect(app.project?.path).toBe('/make/reference');
    expect(app.progressOf(app.project!).label).toBe('Step 2 of 5 · Shape');
  });

  it('Save craft marks it finished with its instructions and notes, and it reopens on Assemble', () => {
    const { app, store } = fresh();
    app.startCraft('flat');
    app.startFromCapture({ fileName: 'lake.png', images: ['x'], mode: 'single' });
    for (const s of ['cutout', 'segment', 'layers', 'gaps', 'output', 'assemble'] as const) app.visit(s);
    expect(app.assembly.length).toBe(app.layers.layers.length + 2);
    app.finishCraft();
    const saved = store.load(app.project!.id)!;
    expect([saved.status, saved.path]).toEqual(['finished', '/make/assemble']);
    expect(app.progressOf(saved)).toMatchObject({ finished: true, label: 'Finished' });
    const again = new AppState(store);
    expect(again.project?.status).toBe('finished');
  });

  it('the gallery: delete a craft; the example fills an empty gallery once', () => {
    const { app } = fresh();
    app.openExample();
    app.openExample();
    expect(app.projects.filter((p) => p.example)).toHaveLength(1);
    expect(app.projects[0]).toMatchObject({ status: 'finished', path: '/make/assemble' });
    app.removeCraft(app.projects[0].id);
    expect([app.projects.length, app.project]).toEqual([0, null]);
  });

  it('the default device is remembered and new crafts send there', () => {
    const { app, store } = fresh();
    app.setDefaultDevice('xtool');
    expect(new AppState(store).defaultDevice).toBe('xtool');
    app.startCraft('flat');
    expect(app.layers.device).toBe('xtool');
  });
});

describe('Burn Watch per cut (like Sheets)', () => {
  it('sending the next sheet starts the cut and watches it; results stay per cut', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (u: string) => { calls.push(u); return { json: async () => ({ events: [{ atSec: 42, kind: 'flare', note: 'Flare on the sky sheet' }], clipSec: 58 }) }; }) as unknown as typeof fetch;
    const { app } = fresh();
    app.startCraft('flat');
    app.startFromCapture({ images: ['x'], mode: 'single' });
    app.sendSheet();
    await new Promise((r) => setTimeout(r, 0));
    expect([app.layers.job.phase, app.watch.sheet, app.watch.alertsOn(1), app.watch.alertsOn(2)]).toEqual(['cutting', 1, 1, null]);
    app.watch.acknowledge();
    expect(app.watch.alertsOn(1)).toBe(0);
    expect(calls).toEqual(['/api/watch']);
  });

  it('the work area renames a sheet and changes its material', async () => {
    const { app } = fresh();
    const { layerSets } = await import('../content/layers');
    app.layers.applyLayers(layerSets.paper.layers.map((l) => ({ ...l, shapes: [...l.shapes] })));
    app.layers.renameLayer(2, '  Moon ');
    app.layers.setLayerMaterial(2, 'Silver cardstock');
    app.layers.renameLayer(2, '   ');
    expect(app.layers.layers[1]).toMatchObject({ name: 'Moon', material: 'Silver cardstock' });
  });
});
