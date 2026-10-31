import { describe, expect, it } from 'vitest';
import { stitchViews, type ViewSilhouette } from './stitch';

const view = (v: ViewSilhouette['view'], w: number, h: number): ViewSilhouette => ({ view: v, box: { x1: 100, y1: 100, x2: 100 + w, y2: 100 + h }, areaPct: 40 });
describe('stitchViews (six views -> one object -> panels + join table)', () => {
  it('reconstructs W×D×H from shared edges and cuts six panels', () => {
    const spec = stitchViews([view('front', 400, 300), view('back', 400, 300), view('right', 200, 300), view('left', 200, 300), view('top', 400, 200), view('base', 400, 200)], { sizeMm: 300, thicknessMm: 6, joinery: 'finger' });
    expect([spec.wMm, spec.dMm, spec.hMm]).toEqual([300, 150, 225]);
    expect(spec.panels.map((p) => p.name)).toEqual(['Front', 'Back', 'Left', 'Right', 'Top', 'Base']);
    expect(spec.panels.find((p) => p.name === 'Front')).toMatchObject({ wMm: 300, hMm: 225 });
    expect(spec.panels.find((p) => p.name === 'Left')).toMatchObject({ wMm: 138, hMm: 225 }); // depth less 2×thickness
    expect(spec.symmetry).toContain('Left ≈ Right');
    expect(spec.joins.length).toBe(12);
    expect(spec.warnings).toEqual([]);
  });
  it('guesses a missing side from its opposite and warns', () => {
    const spec = stitchViews([view('front', 400, 300), view('right', 200, 300), view('top', 400, 200)], { sizeMm: 300, thicknessMm: 6, joinery: 'tabs' });
    expect(spec.panels).toHaveLength(6);
    expect(spec.warnings.some((w) => w.includes('Left'))).toBe(true);
  });
  it('warns when front and side heights disagree and keeps the front', () => {
    const spec = stitchViews([view('front', 400, 300), view('right', 200, 200)], { sizeMm: 300, thicknessMm: 6, joinery: 'butt' });
    expect(spec.hMm).toBe(225);
    expect(spec.warnings.some((w) => w.toLowerCase().includes('height'))).toBe(true);
  });
  it('every joined edge appears in the table with the chosen joinery', () => {
    const spec = stitchViews([view('front', 400, 300), view('right', 200, 300), view('top', 400, 200)], { sizeMm: 300, thicknessMm: 6, joinery: 'tabs' });
    expect(spec.joins.every((j) => j.kind === 'tabs' && j.angleDeg === 90)).toBe(true);
    expect(spec.joins.find((j) => j.a === 'Base' && j.b === 'Front')).toBeTruthy();
  });
});
