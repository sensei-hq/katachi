import { describe, expect, it } from 'vitest';
import { dominantColour, pointInPolygon } from './colour';

// 4x4 image: left half red-ish wood, right half blue; polygon covers left half (0-1000 coords scaled to px)
const px = new Uint8ClampedArray(4 * 4 * 4);
for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const i = (y * 4 + x) * 4; const c = x < 2 ? [180, 90, 40] : [20, 40, 200]; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; }
describe('dominantColour (prominent colour of a layer, sampled from the photo under its mask)', () => {
  it('averages only pixels inside the traced path', () => {
    const hex = dominantColour({ data: px, w: 4, h: 4 }, [[[0, 0], [500, 0], [500, 1000], [0, 1000]]]);
    expect(hex).toBe('#B45A28');
  });
  it('returns null when no pixel falls inside', () => {
    expect(dominantColour({ data: px, w: 4, h: 4 }, [[[900, 900], [950, 900], [950, 950], [900, 950]]])).toBeNull();
  });
  it('pointInPolygon handles inside/outside', () => {
    const poly: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(5, 5, poly)).toBe(true);
    expect(pointInPolygon(15, 5, poly)).toBe(false);
  });
});
