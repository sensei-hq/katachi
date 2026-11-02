import { describe, expect, it } from 'vitest';
import { toLoops } from '../../geo';
import { rectify, quadOf, homography } from './rectify';
import { craftOf, testCtx } from './fixtures';
import type { Pt } from '../../geo';

const card = (loops: Pt[][]) => craftOf({ items: [{ name: 'Bookmark', parts: [{ name: 'Bookmark', ops: [{ kind: 'cut', loops }] }] }] });
const angleAt = (a: Pt, b: Pt, c: Pt) => { const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; return (Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]))) * 180) / Math.PI; };

describe('rectify · perspective correction', () => {
  it('a homography maps four corners exactly', () => {
    const m = homography([[0, 0], [10, 1], [9, 20], [1, 19]], [[0, 0], [10, 0], [10, 20], [0, 20]])!;
    const w = (x: number, y: number) => { const d = m[6] * x + m[7] * y + 1; return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d]; };
    expect(w(9, 20)[0]).toBeCloseTo(10, 6); expect(w(9, 20)[1]).toBeCloseTo(20, 6);
  });
  it('a keystoned card (far end narrower) becomes a true rectangle; its hole moves with it', async () => {
    // 40 wide at the near (bottom) end, 32 at the far end, 160 tall, with a hole near the top
    const keystone: Pt[] = [[104, 0], [136, 0], [140, 160], [100, 160]];
    const r = await rectify.run(card([keystone, [[115, 20], [125, 20], [125, 30], [115, 30]]]), { targets: ['item0'], opts: { minFit: 0.94 } }, testCtx());
    expect(r.summary).toBe('Corrected the perspective of 1 item');
    const loops = toLoops(r.items[0].parts[0].ops[0].geometry);
    const q = quadOf(loops[0])!;
    for (let i = 0; i < 4; i++) expect(angleAt(q[(i + 3) % 4], q[i], q[(i + 1) % 4])).toBeCloseTo(90, 0);
    expect(loops).toHaveLength(2);
  });
  it('a drop-shaped earring is not four-cornered: left alone; a square card is already square', async () => {
    const drop: Pt[] = Array.from({ length: 36 }, (_, i) => { const a = (i / 36) * Math.PI * 2; return [50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a) * (Math.sin(a) > 0 ? 1.6 : 1)]; });
    expect((await rectify.run(card([drop]), { targets: ['item0'], opts: { minFit: 0.94 } }, testCtx())).items).toHaveLength(0);
    // the square one is noted as shot square (the size reference for its set), its geometry untouched
    const sq = await rectify.run(card([[[0, 0], [40, 0], [40, 160], [0, 160]]]), { targets: ['item0'], opts: { minFit: 0.94 } }, testCtx());
    expect(sq.summary).toBe('No perspective to correct');
    expect(sq.items[0].shot).toEqual({ skewDeg: 0 });
  });
});
