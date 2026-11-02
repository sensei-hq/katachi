import { describe, it, expect } from 'vitest';
import { namesAStack, rasterisePaths, stackLayers, stackPlanFrom, type StackPlan } from './layering';

// a 120×120 picture: a gold border (6 px) round the piece; inside, black on the right with a thin white whisker,
// red on the left with a white petal framed by a gold ring
const W = 120, H = 120;
const RGB = { white: [241, 236, 228], black: [21, 21, 21], red: [181, 58, 44], gold: [209, 154, 69] } as const;
function picture() {
  const data = new Uint8ClampedArray(W * H * 4), subject = new Uint8Array(W * H);
  const put = (x: number, y: number, c: readonly number[]) => { const i = (y * W + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = x >= 10 && x < 110 && y >= 10 && y < 110;
    if (!inside) { put(x, y, [200, 190, 170]); continue; }
    subject[y * W + x] = 1;
    const border = x < 16 || x >= 104 || y < 16 || y >= 104;
    const petal = Math.hypot(x - 38, y - 60) < 9, ring = !petal && Math.hypot(x - 38, y - 60) < 13;
    const whisker = x >= 66 && x < 98 && y >= 58 && y < 60;
    put(x, y, border ? RGB.gold : petal ? RGB.white : ring ? RGB.gold : x < 60 ? RGB.red : whisker ? RGB.white : RGB.black);
  }
  return { img: { w: W, h: H, data }, subject };
}
const plan: StackPlan = { layers: [
  { name: 'White base', colour: 'white', solid: true }, { name: 'Black cat', colour: 'black' }, { name: 'Red leaves', colour: 'red' },
  { name: 'White flowers', colour: 'white' }, { name: 'Gold outline', colour: 'gold' }], outline: true };
const at = (paths: [number, number][][], x: number, y: number) => rasterisePaths(paths, W, H)[y * W + x] === 1;

describe('a stack the user describes', () => {
  const { img, subject } = picture();
  const L = stackLayers(img as never, subject, plan);

  it('builds the layers in the order and with the names asked for', () => {
    expect(L.map((l) => l.name)).toEqual(['White base', 'Black cat', 'Red leaves', 'White flowers', 'Gold outline']);
  });
  it('splits the one white by where it sits: the whisker is the base showing, the petal is the flowers layer', () => {
    expect(at(L[0].visiblePaths, 80, 58)).toBe(true);
    expect(at(L[3].visiblePaths, 80, 58)).toBe(false);
    expect(at(L[3].visiblePaths, 38, 60)).toBe(true);
    expect(at(L[0].visiblePaths, 38, 60)).toBe(false);
  });
  it('the base is one solid sheet; the black has a cut where the whisker shows through', () => {
    expect(L[0].sheetPaths.length).toBe(1);
    expect(at(L[0].sheetPaths, 80, 58)).toBe(true);
    expect(at(L[1].sheetPaths, 80, 58)).toBe(false);
    expect(at(L[1].sheetPaths, 90, 40)).toBe(true);
  });
  it('a layer reaches under everything in front of it', () => {
    expect(at(L[1].sheetPaths, 38, 60)).toBe(true);   // the black runs under the petal
    expect(at(L[2].sheetPaths, 38, 60)).toBe(true);   // so does the red
    expect(at(L[2].sheetPaths, 90, 40)).toBe(false);  // but the red is not under the black
  });
  it('every layer keeps the outer outline as a rim', () => {
    for (const l of L) { expect(at(l.sheetPaths, 12, 60)).toBe(true); expect(at(l.sheetPaths, 60, 107)).toBe(true); }
    const bare = stackLayers(img as never, subject, { ...plan, outline: false });
    expect(at(bare[3].sheetPaths, 90, 40)).toBe(false);
    expect(at(bare[3].sheetPaths, 12, 60)).toBe(true); // the gold border is in front of it anyway
  });
  it('refuses a plan it cannot read', () => {
    expect(stackLayers(img as never, subject, { layers: [{ name: 'Mystery', colour: 'sparkly' }, { name: 'Black', colour: 'black' }] })).toEqual([]);
  });
});

describe('reading the stack from the chat', () => {
  it('takes the planner’s layers, back to front, solid where said', () => {
    const p = stackPlanFrom({ layers: [{ name: 'white base', colour: 'white', solid: true }, { name: 'Black cat', colour: 'black' }, 'red', { name: 'Gold outline', color: 'gold' }], outline: true });
    expect(p?.layers.map((l) => [l.name, l.colour, l.solid])).toEqual([['White base', 'white', true], ['Black cat', 'black', false], ['Red', 'red', false], ['Gold outline', 'gold', false]]);
    expect(p?.outline).toBe(true);
  });
  it('turns down a layer with no colour it knows, and a single layer', () => {
    expect(stackPlanFrom({ layers: [{ name: 'base', colour: 'sparkly' }, { name: 'b', colour: 'black' }] })).toBeNull();
    expect(stackPlanFrom({ layers: [{ name: 'b', colour: 'black' }] })).toBeNull();
    expect(stackPlanFrom({})).toBeNull();
  });
  it('a count with colours named is a stack; a bare count is not', () => {
    expect(namesAStack('use 5 layers with a solid base of white, then black, red, white floral and gold')).toBe(true);
    expect(namesAStack('use 3 layers')).toBe(false);
    expect(namesAStack('make the black layer thicker')).toBe(false);
  });
});
