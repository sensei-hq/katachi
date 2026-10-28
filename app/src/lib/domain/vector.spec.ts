import { describe, expect, it } from 'vitest';
import { traceMask, pathsToSvg, scalePaths, type Mask } from './vector';

const disc = (w = 60, h = 60, r = 20): Mask => {
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = x - w / 2, dy = y - h / 2; if (dx * dx + dy * dy < r * r) bits[y * w + x] = 1; }
  return { w, h, bits };
};

describe('traceMask (S7 vectorise: raster -> closed paths)', () => {
  it('traces a disc to one closed path with about the right area and bounds', () => {
    const { paths } = traceMask(disc());
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
    expect(paths[0].points.length).toBeGreaterThan(8);
    expect(paths[0].area).toBeGreaterThan(1000); // pi*20^2 = 1256
    expect(paths[0].area).toBeLessThan(1500);
  });
  it('filters specks under turdSize and keeps holes as their own path', () => {
    const m = disc();
    m.bits[0] = 1; m.bits[1] = 1; // 2px speck
    for (let y = 26; y < 34; y++) for (let x = 26; x < 34; x++) m.bits[y * m.w + x] = 0; // hole
    const { paths } = traceMask(m, { turdSize: 4 });
    expect(paths.length).toBe(2);
  });
  it('scales px paths to mm and emits closed SVG', () => {
    const { paths } = traceMask(disc());
    const mm = scalePaths(paths, 0.5); // 60px -> 30mm wide
    const d = pathsToSvg(mm);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const xs = mm[0].points.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(31);
  });
  it('empty mask traces to nothing', () => {
    expect(traceMask({ w: 4, h: 4, bits: new Uint8Array(16) }).paths).toEqual([]);
  });
});
