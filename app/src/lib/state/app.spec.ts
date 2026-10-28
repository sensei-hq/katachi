import { describe, expect, it } from 'vitest';
import { AppState } from './app.svelte';

describe('AppState (one per app, shared by every section)', () => {
  it('owns one flow, and the trace the cost pill reads is that flow’s trace', () => {
    const app = new AppState();
    expect(app.trace).toBe(app.flow.trace);
    app.trace.add({ model: 'muse-spark-1.3', purpose: 'analyze_scene', latencyMs: 10, costUsd: 0.02 });
    expect(app.costPill).toBe('$0.02 · 1 models');
  });

  it('keeps section state alive across navigation (same instances)', () => {
    const app = new AppState();
    const { layers, watch, batch, capture } = app;
    expect([app.layers, app.watch, app.batch, app.capture]).toEqual([layers, watch, batch, capture]);
  });

  it('opens and closes the Katachi chat panel', () => {
    const app = new AppState();
    expect(app.chatOpen).toBe(true);
    app.toggleChat();
    expect(app.chatOpen).toBe(false);
  });

  it('holds the current screen title and subtitle for the shell header', () => {
    const app = new AppState();
    app.setScreen('Burn Watch', 'recorded clip · 0:58');
    expect(app.screen).toEqual({ title: 'Burn Watch', subtitle: 'recorded clip · 0:58' });
  });

  it('outside the craft flow (work area), a composer message goes to the conversation and the analysis', async () => {
    globalThis.fetch = (async () => ({ json: async () => ({ trace: [], measure: null }) })) as unknown as typeof fetch;
    const app = new AppState();
    expect(await app.ask('make four coasters 3 mm birch', '/canvas')).toBeNull();
    expect(app.flow.conversation.slots).toMatchObject({ qty: 4, thicknessMm: 3, material: 'birch' });
  });

  it('keeps every bot interaction in one chat log (Rokkit ChatMessage shape), with optional actions', () => {
    const app = new AppState();
    expect(app.messages).toEqual([{ id: 'm0', role: 'assistant', text: 'Hi Dev — what are we making today?' }]);
    app.flow.conversation.ingestTranscript('make four coasters');
    app.flow.conversation.say('Build plan ready.', [{ label: 'Open the plan', href: '/plan' }]);
    expect(app.messages).toEqual([
      { id: 'm0', role: 'assistant', text: 'Hi Dev — what are we making today?' },
      { id: 'm1', role: 'user', text: 'make four coasters' },
      { id: 'm2', role: 'assistant', text: 'Build plan ready.', data: { actions: [{ label: 'Open the plan', href: '/plan' }] } }
    ]);
  });

  it('shows one right panel at a time in the studio: properties or the Katachi chat', () => {
    const app = new AppState();
    expect([app.chatOpen, app.propsOpen]).toEqual([true, false]);
    app.toggleProps();
    expect([app.chatOpen, app.propsOpen]).toEqual([false, true]);
    app.toggleChat();
    expect([app.chatOpen, app.propsOpen]).toEqual([true, false]);
  });

  it('sets the theme density for the whole app (settings)', async () => {
    const { vibe } = await import('@rokkit/states');
    const app = new AppState();
    app.setDensity('compact');
    expect(vibe.density).toBe('compact');
    app.setDensity('comfortable');
    expect(vibe.density).toBe('comfortable');
  });

  it('opens and closes the assistant sheet on phones', () => {
    const app = new AppState();
    expect(app.sheetOpen).toBe(false);
    app.toggleSheet();
    expect(app.sheetOpen).toBe(true);
  });

  it('a page’s context sits above the chat in the assistant column (no tabs) and clears when the page leaves', () => {
    const app = new AppState();
    expect(app.info).toBeNull();
    const body = (() => {}) as never;
    app.setInfo('Layer', body);
    expect(app.info?.title).toBe('Layer');
    expect('panelTab' in app).toBe(false);
    app.clearInfo();
    expect(app.info).toBeNull();
  });

  it('guides each layers step once in the chat, with Previous / Next and the step’s suggestions', () => {
    const app = new AppState();
    app.guideStep('segment');
    app.guideStep('segment');
    const steps = app.messages.filter((m) => m.data?.actions?.some((a) => a.label.startsWith('Next')));
    expect(steps).toHaveLength(1);
    expect(steps[0].data?.actions).toEqual([
      { label: 'Previous · Cutout', href: '/make/cutout' },
      { label: 'Next · Layers', href: '/make/layers' }
    ]);
    expect(app.suggestions.length).toBeGreaterThan(0);
  });

  it('a leaving page only clears the info it set (the next page sets its own first)', () => {
    const app = new AppState();
    const cutout = (() => {}) as never, objects = (() => {}) as never;
    app.setInfo('Checks', cutout);
    app.setInfo('Regions', objects);
    app.clearInfo(cutout);
    expect(app.info?.title).toBe('Regions');
    app.clearInfo(objects);
    expect(app.info).toBeNull();
  });

  it('a project starts empty, is named by its first step, and gates the steps you have not reached', async () => {
    const { MemoryStorage, ProjectStore } = await import('./project.svelte');
    const store = new ProjectStore(new MemoryStorage());
    const app = new AppState(store);
    expect(app.project).toBeNull();
    expect(app.canVisit('import')).toBe(false);
    app.newProject();
    expect(app.project?.name).toBe('');
    app.startFromCapture({ fileName: 'alpine-forest.png', images: ['data:image/png;base64,AAAA'], mode: 'single' });
    expect(app.project).toMatchObject({ name: 'Alpine forest', kind: 'flat', reached: 0 });
    expect(app.title).toBe('Alpine forest');
    expect([app.canVisit('import'), app.canVisit('cutout'), app.canVisit('layers')]).toEqual([true, true, false]);
    app.visit('cutout'); app.visit('segment');
    expect([app.canVisit('layers'), app.canVisit('gaps')]).toEqual([true, false]);
    expect(store.list().map((p) => p.name)).toEqual(['Alpine forest']);
  });

  it('six sides start a 3D project at the six-view step', async () => {
    const { MemoryStorage, ProjectStore } = await import('./project.svelte');
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    app.newProject();
    app.startFromCapture({ images: ['a', 'b', 'c', 'd', 'e', 'f'], mode: 'multi', at: new Date(2026, 9, 28, 9, 30) });
    expect(app.project).toMatchObject({ kind: '3d', name: 'Photo · 28 Oct, 09:30', path: '/make/views' });
    expect(app.canVisit('views')).toBe(true);
  });

  it('saves on change and reopens a project where it was left', async () => {
    const { MemoryStorage, ProjectStore } = await import('./project.svelte');
    const store = new ProjectStore(new MemoryStorage());
    const a = new AppState(store);
    a.newProject();
    a.startFromCapture({ fileName: 'lake.jpg', images: ['x'], mode: 'single' });
    a.visit('cutout'); a.visit('segment'); a.visit('layers');
    a.layers.applyLayers([{ n: 1, name: 'Back', shapes: ['sky'], colour: '#111111', visiblePct: 50, hiddenPct: 50, material: 'Card' }, { n: 2, name: 'Front', shapes: ['sun'], colour: '#222222', visiblePct: 50, hiddenPct: 0, material: 'Card' }]);
    a.layers.selectLayer(2);
    a.save();
    const b = new AppState(store);
    expect(b.project?.name).toBe('Lake');
    expect([b.layers.selected.n, b.project?.path]).toEqual([2, '/make/layers']);
    b.newProject();
    expect(b.project?.name).toBe('');
    b.open(store.list().find((p) => p.name === 'Lake')!.id);
    expect(b.project?.path).toBe('/make/layers');
  });

  it('Import: Katachi turns what you want into a plan — objective, then variations to pick in the chat (was Convert)', async () => {
    const { MemoryStorage, ProjectStore } = await import('./project.svelte');
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    app.newProject();
    app.startFromCapture({ fileName: 'lake.jpg', images: ['data:image/png;base64,AAAA'], mode: 'single' });
    let sent: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ objective: 'A layered lake panel', variations: [{ title: 'Night sky', change: 'moon for sun' }, { title: 'Autumn', change: 'warm trees' }] }) };
    }) as never;
    await app.askForBrief('a piece for the hallway');
    expect(sent).toMatchObject({ imageDataUrl: 'data:image/png;base64,AAAA', description: 'a piece for the hallway', group: 'laser-cut' });
    const last = app.messages.at(-1)!;
    expect(last.text).toContain('A layered lake panel');
    expect(last.data?.actions?.map((a) => a.label)).toEqual(['Night sky', 'Autumn']);
    app.chooseVariation(1);
    expect(app.layers.brief).toBe('Autumn — warm trees');
    expect(app.layers.snapshot().brief).toBe('Autumn — warm trees');
  });
});
