import { describe, it, expect } from 'vitest';
import { difference, fromLoops, toLoops, type Geometry } from '../../geo';
import { migrateV1 } from '../../craft/migrate';
import { straighten, interpolate } from './analysis';
const W = 1588, H = 1271;
const at = (pts: number[][]): [number, number][] => pts.map(([x, y]) => [Math.round((x / W) * 10000) / 10, Math.round((y / H) * 10000) / 10]);
const card: Record<string, [number, number][]> = {
  Elephant: at([[88, 362], [300, 310], [590, 1138], [352, 1192]]),
  Fox: at([[376, 252], [578, 205], [766, 1008], [592, 1062]]),
  Whale: at([[690, 172], [928, 150], [945, 985], [768, 995]]),
  Butterfly: at([[1000, 232], [1246, 250], [1092, 1074], [838, 1028]]),
  Phoenix: at([[1262, 342], [1530, 384], [1296, 1176], [1034, 1110]]),
  // the elephant's white tassel hangs across its left edge
  tassel: at([[10, 430], [150, 425], [168, 810], [5, 812]]),
  // and the phoenix's copper tassel across its right edge
  tassel2: at([[1455, 400], [1575, 405], [1588, 790], [1440, 792]]),
  // and the fox's gold tassel across its top left edge
  tassel3: at([[345, 290], [425, 290], [430, 520], [340, 520]])
};
/** what lies on top of each bookmark */
const over: Record<string, string[]> = { Whale: ['Fox', 'Butterfly', 'Elephant', 'Phoenix'], Fox: ['Elephant', 'tassel3'], Butterfly: ['Phoenix'], Elephant: ['tassel'], Phoenix: ['tassel2'] };
const names = ['Elephant', 'Fox', 'Whale', 'Butterfly', 'Phoenix'];
const g = (k: string): Geometry => fromLoops([card[k]]);
/** the mask SAM gives: the card less everything on top of it (the biggest piece that shows) */
function shows(k: string): [number, number][] {
  let v = g(k);
  for (const o of over[k]) v = difference(v, g(o));
  const loops = toLoops(v).sort((a, b) => area(b) - area(a));
  return loops[0].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]);
}
const area = (l: [number, number][]) => Math.abs(l.reduce((a, [x, y], i) => { const [u, v] = l[(i + 1) % l.length]; return a + x * v - u * y; }, 0)) / 2;


// The five fanned bookmarks as the e2e replays them (tests/e2e/bookmarks-rebuild.spec.ts): each mask is what shows.
describe('interpolate · a fanned family of bookmarks', () => {
it('every bitten bookmark is filled: tassel notches from the hull, the strips under a neighbour from the card’s other side', async () => {
  const masks = names.map(shows);
  const doc0 = migrateV1({ id: 'c', name: 'b', createdAt: 1, updatedAt: 1, kind: 'flat' }, { subject: 'bookmarks', aspect: W / H, widthMm: 300,
    regionList: names.map((n, i) => ({ id: `r${i}`, name: n, paths: [masks[i]] })), stack: names.map((n, i) => ({ n: i + 1, name: `${n} · cut`, colour: '#c', material: 'b', visiblePct: 9, hiddenPct: 0, regionId: `r${i}`, itemName: n, role: 'cut' as const })) }, (() => { let k = 0; return () => `x${++k}`; })());
  const ids = doc0.items.map((i) => i.id);
  const s1 = await straighten.run(doc0, { targets: ids, opts: { snapDeg: 0.5 } }, {} as never);
  const doc1 = { ...doc0, items: doc0.items.map((it) => s1.items.find((x) => x.id === it.id) ?? it) };
  const r = await interpolate.run(doc1, { targets: ids, opts: { maxAddPct: 40, onlyHidden: true } }, {} as never);
  expect(names.map((n, i) => area(masks[i]) < area(card[n]) * 0.99)).toEqual([true, true, true, true, true]);
  expect(r.summary).toBe('Filled in the hidden edges of Elephant, Fox, Whale, Butterfly, Phoenix');
  // the whale and the butterfly lost a strip down their right side (the butterfly and the phoenix lie on them)
  expect(r.detail).toMatch(/Whale \(\+[\d.]+%, right side from its other side\)/);
  expect(r.detail).toMatch(/Butterfly \(\+[\d.]+%, right side from its other side\)/);
});
});
