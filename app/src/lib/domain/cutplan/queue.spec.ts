import { describe, expect, it } from 'vitest';
import { profileFor } from './profiles';
import { craftOf, rect } from './fixtures';
import { planCut } from './plan';
import { toQueueInput } from './queue';

const catLike = () => craftOf([{
  name: 'Cat', parts: [
    { name: 'Back', z: 0, ops: [{ kind: 'cut', loops: [rect(0, 0, 20, 20)] }] },
    { name: 'Body', z: 1, ops: [{ kind: 'cut', loops: [rect(0, 0, 20, 20)] }] },
  ],
}]);

describe('cutplan queue', () => {
  it('toQueueInput matches today\'s shapes for a cut craft', () => {
    const craft = catLike(), profile = profileFor('cricut', 'cardstock');
    const plan = planCut(craft, profile);
    const q = toQueueInput(plan.sheets[0], craft, profile);
    expect(q.craftId).toBe('craft');
    expect(q.craftName).toBe('Test craft');
    expect(q.layer).toBe(1);
    expect(q.name).toBe('Back');
    expect(q.material).toBe('cardstock');
    expect(q.op).toBe('cut');
    expect(q.machine).toBe('paper');
    expect(q.cut.startsWith('M')).toBe(true);
    expect(q.sheetMm).toEqual(plan.sheets[0].sizeMm);
    for (const [x, y] of q.shapes.flat()) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(q.sheetMm[0]);
      expect(y).toBeLessThanOrEqual(q.sheetMm[1]);
    }
    expect(q.shapes).toEqual(plan.sheets[0].passes.flatMap((p) => p.shapesMm));
  });
  it("op is 'engrave' only when every pass is engrave/score; blade→paper, laser→laser", () => {
    const craft = craftOf([
      { name: 'Mark', parts: [{ name: 'E', z: 0, ops: [{ kind: 'engrave', loops: [rect(0, 0, 5, 5)] }] }] },
      { name: 'Line', parts: [{ name: 'S', z: 0, ops: [{ kind: 'score', loops: [rect(0, 0, 5, 5)] }] }] },
      { name: 'Mix', parts: [{ name: 'M', z: 0, ops: [{ kind: 'engrave', loops: [rect(0, 0, 5, 5)] }, { kind: 'cut', loops: [rect(0, 0, 10, 10)] }] }] },
    ]);
    const blade = profileFor('cricut', 'cardstock'), laser = profileFor('xtool', 'birch');
    const sheets = planCut(craft, blade).sheets;
    expect(toQueueInput(sheets[0], craft, blade).op).toBe('engrave');
    expect(toQueueInput(sheets[1], craft, blade).op).toBe('engrave');
    expect(toQueueInput(sheets[2], craft, blade).op).toBe('cut');
    expect(toQueueInput(sheets[2], craft, laser).machine).toBe('laser');
  });
});
