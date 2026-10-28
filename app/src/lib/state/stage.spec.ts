import { describe, expect, it } from 'vitest';
import { LayerFlowState } from './layer-flow.svelte';

const square: [number, number][] = [[100, 100], [400, 100], [400, 400], [100, 400]];

describe('stage visuals come from the captured photo and SAM masks, not the fixture illustration', () => {
  it('regions with traced paths become SVG overlays in 0-1000 image coordinates', () => {
    const f = new LayerFlowState();
    f.applyRegions([
      { id: 'sun', name: 'Sun', pct: 4, note: '', tone: 'accent', keep: true, paths: [square] },
      { id: 'sky', name: 'Sky', pct: 60, note: '', tone: 'warn', keep: false, paths: [square] }
    ] as never);
    const [sun, sky] = f.overlays;
    expect(sun.d).toBe('M100 100L400 100L400 400L100 400Z');
    expect([sun.on, sky.on]).toEqual([true, false]);
    expect(f.overlays).toHaveLength(2);
  });
  it('regions without paths produce no overlays (fixture fallback stays available)', () => {
    const f = new LayerFlowState();
    expect(f.overlays).toEqual([]);
    expect(f.hasPhotoStage).toBe(false);
  });
  it('the cutout keeps the subject mask paths for the outline view', () => {
    const f = new LayerFlowState();
    f.applyCutout({ outline: { shape: 'circle', sizeMm: 300 }, checks: [], paths: [square] });
    expect(f.subjectPaths).toEqual([square]);
    expect(f.hasPhotoStage).toBe(true);
  });
  it('traced sheets are stored per layer index for the Sheets step', () => {
    const f = new LayerFlowState();
    f.applySheets([{ name: 'Sun', svg: 'M30 30L120 30Z', pathCount: 1, cutLengthMm: 360, sizeMm: 300 }]);
    expect(f.sheetFor(1)?.svg).toContain('M30 30');
    expect(f.sheetFor(99)).toBeUndefined();
  });
});

describe('chat carries the real findings and applies plain commands', () => {
  const square: [number, number][] = [[10, 10], [90, 10], [90, 90], [10, 90]];
  it('suggestions and step notes come from the actual regions, layers and sheets', async () => {
    const { AppState } = await import('./app.svelte');
    const { MemoryStorage, ProjectStore } = await import('./project.svelte');
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    app.startCraft('flat');
    app.startFromCapture({ images: ['data:image/jpeg;base64,AA'], mode: 'single' });
    app.layers.applyRegions([
      { id: 'sun', name: 'Sun', pct: 4, note: '', tone: 'accent', keep: true, paths: [square] },
      { id: 'lake', name: 'Lake', pct: 30, note: '', tone: 'ok', keep: true, paths: [square] }
    ] as never);
    app.currentStep = 'segment';
    expect(app.suggestions.some((s) => s.includes('Sun'))).toBe(true);
    expect(app.noteFor('segment')).toContain('Sun');
    app.layers.applySheets([{ name: 'Sun', svg: 'M1 1Z', pathCount: 3, cutLengthMm: 420, sizeMm: 300 }]);
    expect(app.noteFor('output')).toContain('3 closed paths');
    expect(app.noteFor('assemble')).toContain('1.');
  });
  it('"drop the Sun" in chat actually drops the region; an unknown ask is noted honestly', async () => {
    const { AppState } = await import('./app.svelte');
    const { MemoryStorage, ProjectStore } = await import('./project.svelte');
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    app.startCraft('flat');
    app.startFromCapture({ images: ['data:image/jpeg;base64,AA'], mode: 'single' });
    app.layers.applyRegions([
      { id: 'sun', name: 'Sun', pct: 4, note: '', tone: 'accent', keep: true, paths: [square] },
      { id: 'lake', name: 'Lake', pct: 30, note: '', tone: 'ok', keep: true, paths: [square] }
    ] as never);
    app.refine('drop the Sun', '/make/segment');
    expect(app.layers.regions.find((r) => r.name === 'Sun')?.on).toBe(false);
    expect(app.flow.conversation.log.at(-1)?.text).toContain('Done');
    app.refine('make it sparkle', '/make/segment');
    expect(app.flow.conversation.log.at(-1)?.text).toContain('Noted');
  });
});
