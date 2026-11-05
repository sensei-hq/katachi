import { describe, expect, it } from 'vitest';
import { allActions } from './registry';
import { ACTION_GROUPS } from './types';
import { allComposites } from './composites';
import { registerAll } from './defs';

registerAll();

// The gallery contract: every action sits on a shelf, shows honest example asks, and no ask ever fast-paths
// to the wrong action (an ask either matches its own says or matches nothing and goes to the planner).
describe('the gallery contract', () => {
  it('every action has a valid group and at least one ask', () => {
    const groups = new Set(ACTION_GROUPS.map((g) => g.id));
    expect(allActions().length).toBeGreaterThan(20);
    for (const a of allActions()) {
      expect(groups.has(a.group), `${a.id} group`).toBe(true);
      expect(a.ask.length, `${a.id} ask`).toBeGreaterThan(0);
    }
  });
  it('no ask phrase matches another action’s fast path', () => {
    for (const a of allActions()) {
      for (const phrase of a.ask) {
        const matched = allActions().filter((o) => o.says?.some((re) => re.test(phrase))).map((o) => o.id);
        expect(matched.length <= 1 && (matched.length === 0 || matched[0] === a.id), `"${phrase}" → ${matched.join(',') || 'planner'}`).toBe(true);
      }
    }
  });
  it('no chain ask collides with an action’s fast path', () => {
    for (const c of allComposites()) {
      for (const phrase of c.ask ?? []) {
        const matched = allActions().filter((o) => o.says?.some((re) => re.test(phrase))).map((o) => o.id);
        expect(matched, `"${phrase}"`).toHaveLength(0);
      }
    }
  });
});
