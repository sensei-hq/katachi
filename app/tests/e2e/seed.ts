import type { Page } from '@playwright/test';

// The example craft's saved choices: a fresh craft starts with NO layers/regions (they come from the
// model jobs), so a seeded "saved project" must carry the results it saved, like a real reopen.
const STACK = [
  { n: 1, name: 'Sky', regionId: 'sky', shapes: ['sky'], colour: '#F2B880', visiblePct: 22, hiddenPct: 78, material: 'Apricot cardstock' },
  { n: 2, name: 'Sun', regionId: 'sun', shapes: ['sun'], colour: '#F7DFA8', visiblePct: 2.4, hiddenPct: 0.6, material: 'Butter cardstock' },
  { n: 3, name: 'Far peaks', regionId: 'mountains', shapes: ['far'], colour: '#9AA9B8', visiblePct: 14.6, hiddenPct: 61.2, material: 'Slate blue' },
  { n: 4, name: 'Snow ridge', regionId: 'mountains', shapes: ['ridge'], colour: '#E6E2D8', visiblePct: 9.8, hiddenPct: 52.4, material: 'Cream cardstock' },
  { n: 5, name: 'Hills', regionId: 'trees', shapes: ['hills'], colour: '#7C8C5E', visiblePct: 21.5, hiddenPct: 30.1, material: 'Sage' },
  { n: 6, name: 'Front pines', regionId: 'trees', shapes: ['pines'], colour: '#2F3F2E', visiblePct: 29.7, hiddenPct: 0, material: 'Black-green' }
];
const REGIONS = [
  { id: 'frame', name: 'Frame ring', box: { x1: 100, y1: 100, x2: 900, y2: 900 }, pct: 12.6, note: 'Embroidery hoop · looks bought', tone: 'muted', keep: false },
  { id: 'sky', name: 'Sky', box: { x1: 150, y1: 150, x2: 850, y2: 850 }, pct: 21.4, note: 'Flat apricot · back layer', tone: 'warn', keep: true },
  { id: 'sun', name: 'Sun', pct: 2.4, note: 'Small disc · could raise on a spacer', tone: 'accent', keep: true },
  { id: 'mountains', name: 'Mountains', pct: 24.4, note: 'Peaks and a snow ridge · 2 tones', tone: 'ok', keep: true },
  { id: 'trees', name: 'Hills and pines', pct: 39.2, note: '2 depths of green', tone: 'ink', keep: true }
];

/** Seed a saved, current project in browser storage before the app boots (the flow pages need one). */
export async function seedProject(page: Page, { reached = 5, kind = 'flat', name = 'Mountain sunset' }: { reached?: number; kind?: 'flat' | '3d' | 'ref'; name?: string } = {}) {
  const now = Date.now();
  const choices = { subject: 'layered paper art in a round hoop', regionList: REGIONS, keep: { frame: false, sky: true, sun: true, mountains: true, trees: true }, stack: STACK, sel: 4 };
  const record = { id: 'seed', name, createdAt: now, updatedAt: now, reached, kind, path: '/make/layers', image: '', choices };
  await page.addInitScript(([r]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('katachi.projects', JSON.stringify([r]));
    localStorage.setItem('katachi.current', 'seed');
  }, [record] as const);
}
