import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { likeness, pairByShape, silhouette } from './pairs';

// the 24 earrings SAM outlines on the real tray (tests/e2e/fixtures), in reading order: partners sit side by side
const masks = JSON.parse(readFileSync(join(process.cwd(), 'tests/e2e/fixtures/earrings-masks.json'), 'utf8')) as [number, number][][];
const box = (l: [number, number][]) => { const xs = l.map((p) => p[0]), ys = l.map((p) => p[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] as [number, number]; };
const tray = masks.map((outline, i) => ({ id: `e${i + 1}`, outline, sizeMm: box(outline) }));

describe('pairs by shape', () => {
  it('a shape matches itself and its mirror twin; a different shape does not', () => {
    const drop: [number, number][] = [[0, 0], [6, 0], [22, 18], [9, 30], [-2, 12]]; // lopsided: leans right
    const twin = drop.map(([x, y]) => [-x, y] as [number, number]);
    const round: [number, number][] = Array.from({ length: 24 }, (_, k) => [Math.cos((k / 24) * 2 * Math.PI) * 10, Math.sin((k / 24) * 2 * Math.PI) * 10]);
    expect(likeness(silhouette(drop), silhouette(drop)).score).toBe(1);
    expect(likeness(silhouette(drop), silhouette(twin))).toMatchObject({ mirrored: true });
    expect(likeness(silhouette(drop), silhouette(twin)).score).toBeGreaterThan(0.85); // grid edges round a little differently on each side
    expect(likeness(silhouette(drop), silhouette(round)).score).toBeLessThan(0.82);
  });

  it('pairs the real tray: twelve pairs, each two neighbours on the tray, whatever order they are listed in', () => {
    const pairs = pairByShape(tray);
    console.log('PAIRS', pairs.map((p) => `${p.a}+${p.b} ${p.score}${p.mirrored ? ' mirrored' : ''}`).join(' · '));
    expect(pairs).toHaveLength(12);
    const ix = (id: string) => Number(id.slice(1)) - 1;
    for (const p of pairs) expect([ix(p.a), ix(p.b)].sort((a, b) => a - b)).toEqual([2 * Math.floor(Math.min(ix(p.a), ix(p.b)) / 2), 2 * Math.floor(Math.min(ix(p.a), ix(p.b)) / 2) + 1]);
    // listed in a shuffled order (Spark doesn't always read row by row): the same pairs come back
    const shuffled = [...tray].reverse().sort((a, b) => (Number(a.id.slice(1)) % 5) - (Number(b.id.slice(1)) % 5));
    const again = pairByShape(shuffled).map((p) => [p.a, p.b].sort().join('+')).sort();
    expect(again).toEqual(pairs.map((p) => [p.a, p.b].sort().join('+')).sort());
  });

  it('an odd one out stays unpaired', () => {
    const pairs = pairByShape(tray.slice(0, 5));
    expect(pairs).toHaveLength(2);
    expect(pairs.flatMap((p) => [p.a, p.b])).not.toContain('e5');
  });
});
