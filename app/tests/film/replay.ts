import type { Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The films' fallback: the replay data from the e2e specs (same briefs, same outlines), used only when the
// models can't run live. Anything recorded this way is flagged "replayed" and never used on a cost card.
export const sample = (p: string) => readFileSync(new URL(`../../../samples/${p}`, import.meta.url));
export const quad = (w: number, h: number, pts: number[][]) => pts.map(([x, y]) => [Math.round((x / w) * 1000), Math.round((y / h) * 1000)] as [number, number]);
export const box = (w: number, h: number, x1: number, y1: number, x2: number, y2: number) => quad(w, h, [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]);

async function replayItems(page: Page, { subject, names, outlines, realSizeMm, areaPct }: { subject: string; names: string[]; outlines: [number, number][][]; realSizeMm: { w: number; h: number; basis: string }; areaPct: number }) {
  const brief = { subject, class: 'flat', arrangement: 'multiple-items', likelyMaterial: 'wood', subjectPrompt: subject,
    regions: names.map((label, i) => ({ id: `i${i + 1}`, label, samPrompt: label, likelyBought: false, note: '' })), items: names, colourGroupsHint: 1, reference: null, topDownConfidence: 0.9, notes: '', realSizeMm };
  await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [] } }));
  await page.route('**/api/segment', async (r: Route) => {
    const body = r.request().postDataJSON() ?? {};
    if (Array.isArray(body.regions)) return r.fulfill({ json: { regions: body.regions.map((x: { id: string; label: string }, i: number) => ({ ...x, areaPct, paths: [outlines[i]], keep: true, itemId: x.id, itemName: x.label })), source: 'live', trace: [] } });
    return r.fulfill({ json: { boxes: [{ x1: 30, y1: 30, x2: 970, y2: 970 }], masks: outlines.map((o) => ({ w: 320, h: 320, ones: 0, paths: [o] })), source: 'live', trace: [] } });
  });
  await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: subject, conversionClass: 'flat', pieces: [], variations: [], source: 'live', trace: [] } }));
  await page.route('**/api/layer-op', (r: Route) => r.fulfill({ json: { answer: { op: 'none', colour: '', other: '', reply: '' }, source: 'live', trace: [] } }));
}

const BOOKMARK_NAMES = ['Elephant bookmark', 'Fox bookmark', 'Whale bookmark', 'Butterfly bookmark', 'Phoenix bookmark'];
const BOOKMARK_OUTLINES = [[[42, 183], [155, 157], [296, 555], [165, 597]], [[190, 125], [300, 103], [385, 515], [275, 535]], [[348, 85], [468, 78], [490, 495], [385, 500], [380, 440], [425, 430], [415, 300], [364, 290]],
  [[500, 130], [625, 125], [580, 540], [425, 525]], [[645, 160], [770, 180], [690, 590], [525, 565]]].map((p) => quad(800, 640, p));

export const replayBookmarks = (page: Page) => replayItems(page, { subject: 'five laser-cut wooden bookmarks', names: BOOKMARK_NAMES, outlines: BOOKMARK_OUTLINES, realSizeMm: { w: 50, h: 180, basis: 'a typical bookmark' }, areaPct: 9 });

const EARRING_PLACED: [string, number[]][] = [['Lattice teardrop left', [36, 45, 132, 185]], ['Lattice teardrop right', [138, 45, 232, 185]], ['Open teardrop left', [385, 48, 482, 185]], ['Open teardrop right', [497, 48, 595, 185]],
  ['Swirl drop left', [265, 365, 360, 522]], ['Swirl drop right', [372, 365, 468, 522]], ['Mandala circle left', [487, 370, 620, 530]], ['Mandala circle right', [632, 370, 768, 530]]];

export const replayEarrings = (page: Page) => replayItems(page, { subject: 'laser-cut wooden earrings', names: EARRING_PLACED.map(([n]) => n), outlines: EARRING_PLACED.map(([, b]) => box(800, 729, b[0], b[1], b[2], b[3])), realSizeMm: { w: 40, h: 70, basis: 'a typical drop earring' }, areaPct: 2 });

export async function replayCastle(page: Page) {
  const pictures = [{ index: 1, kind: 'view', angle: 'front', note: '' }, { index: 2, kind: 'view', angle: 'three-quarter', note: '' }, { index: 3, kind: 'detail', angle: 'unknown', note: 'lit windows' },
    { index: 4, kind: 'view', angle: 'top', note: '' }, { index: 5, kind: 'plan', angle: 'unknown', note: 'parts layout, 11 sheets' }];
  await page.route('**/api/views', (r: Route) => r.fulfill({ json: { brief: { subject: 'a lit wooden castle kit', likelyMaterial: 'wood', realSizeMm: { w: 300, h: 320, d: 300, basis: 'a desk-sized kit' }, pictures }, source: 'live', trace: [] } }));
  await page.route('**/api/segment', (r: Route) => r.fulfill({ json: { boxes: [{ x1: 100, y1: 100, x2: 900, y2: 900 }], source: 'live', trace: [] } }));
}

const CAT = JSON.parse(readFileSync(new URL('../e2e/fixtures/cat-sam-silhouette.json', import.meta.url), 'utf8')) as { paths: [number, number][][]; areaPct: number };
const CAT_TITLES = ['Gold Backer Base', 'Black Cat Silhouette', 'Red Leaf Filler', 'White Floral Petals', 'Floral Center Detail', 'Cat Face Features'];

export async function replayCat(page: Page) {
  const brief = { subject: 'layered floral black cat wall art', class: 'layered', arrangement: 'stacked', likelyMaterial: 'paper', subjectPrompt: 'layered floral black cat wall art',
    regions: CAT_TITLES.map((label, i) => ({ id: `r${i + 1}`, label, samPrompt: label.toLowerCase(), likelyBought: false, note: '' })),
    items: [], colourGroupsHint: 6, reference: null, topDownConfidence: 0.8, notes: 'textured plaster wall behind, plant shadows' };
  await page.route('**/api/scene', (r: Route) => r.fulfill({ json: { brief, source: 'live', trace: [{ model: 'muse-spark-1.3', purpose: 'analyze_image', latencyMs: 900, costUsd: 0.01 }] } }));
  await page.route('**/api/segment', async (r: Route) => {
    const body = r.request().postDataJSON() ?? {};
    if (Array.isArray(body.regions)) return r.fulfill({ json: { regions: body.regions.map((x: { id: string; label: string }) => ({ ...x, box: { x1: 120, y1: 0, x2: 800, y2: 950 }, areaPct: CAT.areaPct, paths: CAT.paths, keep: true })), source: 'live', trace: [] } });
    return r.fulfill({ json: { boxes: [{ x1: 300, y1: 200, x2: 700, y2: 800 }], source: 'fixture', trace: [] } });
  });
  await page.route('**/api/convert', (r: Route) => r.fulfill({ json: { objective: 'Build a 6-layer dimensional paper wall art of a black cat', conversionClass: 'layered', pieces: CAT_TITLES.map((name) => ({ name, kind: 'layer', note: '' })), variations: [], source: 'live', trace: [] } }));
}
