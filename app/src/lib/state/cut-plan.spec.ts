// The hand-off on Cut (design/15 §5): the craft laid out for the device, the layout said in the chat, the sheets as
// SVG / DXF downloads and one zip, and a maker's own SVG imported as exact pieces.
import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { AppState } from './app.svelte';
import { MemoryStorage, ProjectStore } from './project.svelte';
import { migrateV1 } from '../domain/craft/migrate';

const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
function earrings() {
  const app = new AppState(new ProjectStore(new MemoryStorage()));
  app.startCraft('flat');
  const p = app.project!;
  const names = ['Swirl drop left', 'Swirl drop right', 'Leaf'];
  const doc = migrateV1({ id: p.id, name: 'Earrings', createdAt: 1, updatedAt: 1, kind: 'flat' }, { aspect: 1, widthMm: 300,
    regionList: names.map((n, i) => ({ id: `r${i}`, name: n, paths: [rect(100 + i * 250, 100, 120, 200)], holes: [rect(130 + i * 250, 150, 40, 40)] })),
    stack: names.map((n, i) => ({ n: i + 1, name: `${n} · cut`, colour: '#C89B6A', material: 'birch', visiblePct: 3, hiddenPct: 0, regionId: `r${i}`, itemName: n, role: 'cut' as const })) }, (() => { let k = 0; return () => `x${++k}`; })());
  app.craft.load(doc);
  app.layers.setDevice('xtool');
  return app;
}
const last = (app: AppState) => app.flow.conversation.log.at(-1)?.step;

describe('the cut plan on Cut', () => {
  it('layouts fit the craft; choosing one is said in the chat with its sheet count', () => {
    const app = earrings();
    expect(app.cutLayouts.map((o) => o.label)).toEqual(['One per sheet', 'Pairs together', 'Fit to board']);
    expect(app.cutPlan!.sheets).toHaveLength(3);
    app.setCutLayout('nest');
    expect(app.layers.cutLayout).toBe('nest');
    expect(app.cutPlan!.sheets).toHaveLength(1);
    expect(last(app)?.title).toBe('Fit to board: 1 sheet on the 300 × 300 mm xTool S1 laser');
    app.setCutLayout('groups-together');
    expect(app.cutPlan!.sheets.length).toBe(2);
    // the plan is kept until something changes (fit to board takes a moment on a big kit)
    expect(app.cutPlan).toBe(app.cutPlan);
  });
  it('too big for the board: the warning is said; the queue takes the plan’s sheets', () => {
    const app = earrings();
    return Promise.resolve().then(async () => {
      await app.actions.perform('resize', [{ item: 'Leaf' }], { hMm: 400 });
      app.setCutLayout('nest');
      expect(last(app)?.detail).toMatch(/need attention: .*larger than the xTool S1/);
      app.queue.items = [];
      expect(app.queueSheets()).toBe(app.cutPlan!.sheets.length);
    });
  });
  it('downloads: one sheet as SVG or DXF, every sheet in one zip (said in the chat)', () => {
    const app = earrings();
    const svg = app.sheetDownload(2, 'svg')!, dxf = app.sheetDownload(2, 'dxf')!;
    expect(svg.name).toBe('02 Swirl drop right.svg');
    expect(svg.text).toMatch(/^<\?xml/);
    expect(svg.text).toContain('stroke="#FF0000"');
    expect(dxf.name).toBe('02 Swirl drop right.dxf');
    expect(dxf.text).toMatch(/^0\r?\nSECTION/);
    const z = app.sheetsZip()!;
    const files = unzipSync(z.bytes);
    expect(Object.keys(files).sort()).toEqual(['dxf/01 Swirl drop left.dxf', 'dxf/02 Swirl drop right.dxf', 'dxf/03 Leaf.dxf', 'svg/01 Swirl drop left.svg', 'svg/02 Swirl drop right.svg', 'svg/03 Leaf.svg']);
    expect(strFromU8(files['svg/03 Leaf.svg'])).toContain('<svg');
    expect(last(app)?.title).toBe('Downloaded 3 sheets as SVG and DXF');
  });
  it('a maker’s SVG: imported as exact pieces, straight to Cut, laid out as drawn — and never re-read from the photo state', async () => {
    const src = earrings();
    const svg = src.sheetDownload(1, 'svg')!.text;
    const app = new AppState(new ProjectStore(new MemoryStorage()));
    const to = await app.importKitFile({ name: 'my-earring.svg', text: async () => svg });
    expect(to).toBe('/make/output');
    expect(app.project!.name).toBe('my-earring');
    expect(app.canVisit('output')).toBe(true);
    expect(last(app)?.title).toMatch(/^Imported my-earring: 1 piece, exact from your file/);
    expect(app.cutLayouts.map((o) => o.label)).toContain('As drawn');
    expect(app.layers.cutLayout).toBe('one-item-per-sheet');
    const before = JSON.stringify(app.craft.doc.items);
    app.syncCraft();
    expect(JSON.stringify(app.craft.doc.items)).toBe(before);
    // the cut comes back the size it was drawn (a 120 × 200 photo-unit earring on a 300 mm photo: 36 × 60 mm)
    const sheet = app.cutPlan!.sheets[0], xs = sheet.passes.flatMap((p) => p.shapesMm.flat().map((q) => q[0]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(36, 0);
    // not a cut file: said plainly, nothing created
    const bad = new AppState(new ProjectStore(new MemoryStorage()));
    expect(await bad.importKitFile({ name: 'x.svg', text: async () => 'not xml' })).toBeNull();
    expect(bad.flow.conversation.log.at(-1)?.text).toMatch(/couldn’t read x.svg/);
  });
});
