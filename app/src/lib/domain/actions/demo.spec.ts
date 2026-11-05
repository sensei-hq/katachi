import { describe, expect, it } from 'vitest';
import { allActions } from './registry';
import { registerAll } from './defs';
import { demoAction } from './demo';

registerAll();

// Every gallery card shows a live before/after: the action really runs on the demo craft (the model action
// runs on synthetic pixels).
describe('gallery demos', () => {
  it('every action visibly changes the demo craft', async () => {
    for (const a of allActions()) {
      const d = await demoAction(a.id);
      expect(d.before.length, `${a.id} before`).toBeGreaterThan(0);
      expect(d.changed, `${a.id}: ${d.summary}`).not.toBe('none');
    }
  }, 60000);
  it('straighten turns, resize re-sizes: the card says how much', async () => {
    const s = await demoAction('straighten');
    expect(s.badges.some((b) => b.includes('°'))).toBe(true);
    const r = await demoAction('resize');
    expect(r.dims && r.dims.before !== r.dims.after).toBe(true);
  });
  it('demos are deterministic', async () => {
    const a = JSON.stringify(await demoAction('tidy'));
    const b = JSON.stringify(await demoAction('tidy'));
    expect(a).toBe(b);
  });
});
