import { describe, expect, it } from 'vitest';
import { headAt, program, programText, toMm, toolpath, type Pt } from './toolpath';

const square = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
describe('the cutting program', () => {
  it('cuts holes first and the outline last, nearest shape next, with travel moves between', () => {
    const tp = toolpath([square(0, 0, 100), square(60, 60, 10), square(10, 10, 10)]);
    expect(tp.shapes).toBe(3);
    const travels = tp.segs.filter((s) => s.kind === 'travel').map((s) => s.to);
    expect(travels[0]).toEqual([10, 10]);           // the nearer hole first
    expect(travels[1]).toEqual([60, 60]);
    expect(travels[2]).toEqual([100, 100]);        // the outline last, started at its corner nearest the tool
    expect(tp.cutMm).toBeCloseTo(400 + 40 + 40);
    expect(tp.total).toBeCloseTo(tp.cutMm + tp.travelMm);
    expect(toolpath([]).segs).toEqual([]);
  });
  it('knows where the tool is at any point of the run', () => {
    const tp = toolpath([square(0, 0, 10)]);
    expect(headAt(tp, 0).pt).toEqual([0, 0]);
    expect(headAt(tp, 5).pt).toEqual([5, 0]);
    expect(headAt(tp, 15).pt).toEqual([10, 5]);
    expect(headAt(toolpath([]), 3).seg).toBe(-1);
  });
  it('writes G-code for a laser and blade moves for a paper cutter, one line per move', () => {
    const tp = toolpath([square(0, 0, 10)]);
    const g = program(tp, 'laser', { name: 'Gold backer' });
    expect(g.lines.slice(0, 4)).toEqual(['; Katachi · Gold backer · cut · GRBL', 'G21 ; millimetres', 'G90 ; absolute', 'M4 S0 ; laser on, power follows speed']);
    expect(g.lines[g.lineOf[0]]).toBe('G0 X0.00 Y0.00');
    expect(g.lines[g.lineOf[1]]).toBe('G1 X10.00 Y0.00 F600 S900');
    expect(g.lines.at(-2)).toBe('M5 ; laser off');
    expect(program(tp, 'laser', { op: 'engrave' }).lines[g.lineOf[1]]).toContain('F3000 S250');
    const p = programText(tp, 'paper', { passes: 2 });
    expect(p).toContain('DOWN  CUT  10.00, 0.00'); expect(p).toContain('2 passes'); expect(p.endsWith('END\n')).toBe(true);
  });
  it('maps traced photo units to mm with the photo’s shape', () => {
    expect(toMm([[[0, 0], [1000, 0], [1000, 1000]]], 300, 2)).toEqual([[[0, 0], [300, 0], [300, 150]]]);
    expect(toMm([[[0, 0], [1, 1]]], 300)).toEqual([]);
  });
});

describe('separate items: each on its own sheet, straightened', async () => {
  const { longAxis, uprightTurn, layOut, sheetD } = await import('./toolpath');
  // a 20 × 100 bookmark tilted 20° from upright
  const tilt = (deg: number): Pt[] => { const r = (deg * Math.PI) / 180; return ([[-10, -50], [10, -50], [10, 50], [-10, 50]] as Pt[]).map(([x, y]) => [200 + x * Math.cos(r) - y * Math.sin(r), 100 + x * Math.sin(r) + y * Math.cos(r)]); };
  it('finds the long axis and the turn that stands it upright', () => {
    expect(Math.abs(longAxis([tilt(0)]).angle)).toBeCloseTo(90, 0);
    const { turn } = uprightTurn([tilt(20)]);
    expect(turn).toBeCloseTo(-20, 0);
    expect(uprightTurn([tilt(0.5)]).turn).toBe(0);
    expect(longAxis([]).angle).toBe(90);
  });
  it('lays it out upright at the sheet corner; the same turn and frame apply to its engraving', () => {
    const b = [tilt(20)], { turn, centre } = uprightTurn(b);
    const out = layOut(b, turn, centre);
    expect(out.size[0]).toBeGreaterThanOrEqual(29); expect(out.size[0]).toBeLessThanOrEqual(31);
    expect(out.size[1]).toBeGreaterThanOrEqual(109); expect(out.size[1]).toBeLessThanOrEqual(111);
    const inner = layOut([[[200, 100], [201, 100], [201, 101]]], turn, centre, out.frame);
    expect(inner.shapes[0][0][0]).toBeGreaterThan(5);
    expect(sheetD([[[0, 0], [10, 0], [10, 20]]], [10, 20])).toBe('M0 0L1000 0L1000 1000Z');
  });
  it('notices an outline with a bite taken out of it (a neighbour lay over it)', async () => {
    const { hiddenShare, hullOf } = await import('./toolpath');
    expect(hiddenShare([[[0, 0], [10, 0], [10, 10], [0, 10]]])).toBe(0);
    expect(hiddenShare([[[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]]])).toBe(0.14);
    expect(hiddenShare([])).toBe(0);
    expect(hullOf([[0, 0], [1, 1]])).toHaveLength(2);
  });
});
