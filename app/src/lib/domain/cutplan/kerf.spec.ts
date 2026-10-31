import { describe, expect, it } from 'vitest';
import { area, fromLoops, type Pt } from '../geo';
import { profileFor } from './profiles';
import { craftOf, rect } from './fixtures';
import { planCut } from './plan';
import { withKerf } from './kerf';

const cricut = () => profileFor('cricut', 'cardstock');
const bboxOf = (loops: Pt[][]): [number, number] => {
  const xs = loops.flat().map((p) => p[0]), ys = loops.flat().map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};
const fox = () => craftOf([{
  name: 'Fox', parts: [{ name: 'Fox', z: 0, ops: [
    { kind: 'engrave' as const, loops: [rect(2, 2, 6, 6)] },
    { kind: 'cut' as const, loops: [rect(0, 0, 20, 20), rect(5, 5, 10, 10)] },
  ] }],
}]);

describe('cutplan kerf', () => {
  it('a 20x20 square cuts at 20.2x20.2, its 10x10 hole at 9.8x9.8', () => {
    const [sheet] = planCut(fox(), cricut()).sheets;
    const kerfed = withKerf(sheet, 0.2);
    const cuts = kerfed.passes.filter((p) => p.kind === 'cut');
    expect(cuts.length).toBe(2);
    const [hole, outline] = cuts.map((p) => p.shapesMm);
    const [ow, oh] = bboxOf(outline);
    expect(ow).toBeCloseTo(20.2, 6);
    expect(oh).toBeCloseTo(20.2, 6);
    expect(area(fromLoops(outline))).toBeCloseTo(20.2 * 20.2, 0);
    const [hw, hh] = bboxOf(hole);
    expect(hw).toBeCloseTo(9.8, 6);
    expect(hh).toBeCloseTo(9.8, 6);
  });
  it('engraving is untouched', () => {
    const [sheet] = planCut(fox(), cricut()).sheets;
    const kerfed = withKerf(sheet, 0.2);
    expect(kerfed.passes.find((p) => p.kind === 'engrave')!.shapesMm).toEqual(sheet.passes.find((p) => p.kind === 'engrave')!.shapesMm);
  });
  it('a hole smaller than the kerf is dropped with a warning', () => {
    const craft = craftOf([{
      name: 'Fox', parts: [{ name: 'Fox', z: 0, ops: [
        { kind: 'cut' as const, loops: [rect(0, 0, 20, 20), rect(5, 5, 0.15, 0.15)] },
      ] }],
    }]);
    const [sheet] = planCut(craft, cricut()).sheets;
    const kerfed = withKerf(sheet, 0.2);
    expect(kerfed.passes.filter((p) => p.kind === 'cut').length).toBe(1);
    expect(kerfed.warnings).toEqual(["a 0.15 mm hole in Fox can't be cut with a 0.2 mm kerf"]);
  });
  it('kerf 0 changes nothing', () => {
    const [sheet] = planCut(fox(), cricut()).sheets;
    expect(withKerf(sheet, 0)).toEqual(sheet);
  });
});
