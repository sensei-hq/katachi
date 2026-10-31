import { describe, expect, it } from 'vitest';
import { UsageLedger, money, totalsOf } from './usage.svelte';

describe('usage ledger · every model call, kept per user', () => {
  it('adds calls, persists them, breaks them down by model per craft and for the user', () => {
    let saved = '';
    const l = new UsageLedger(() => saved || null, (s) => { saved = s; });
    expect(l.label()).toBe('$0.00 · 0 models');
    l.add({ craftId: 'a', model: 'SAM 3.1', action: 'cutout', costUsd: 0.0025, ms: 900, status: 'live' });
    l.add({ craftId: 'a', model: 'Muse Spark 1.3', action: 'brief', costUsd: 0.01, ms: 800, status: 'live' });
    l.add({ craftId: 'a', model: 'Muse Spark 1.3', action: 'note', costUsd: 0.005, ms: 10, status: 'placeholder' });
    l.add({ craftId: 'b', model: 'SAM 3.1', action: 'cutout', costUsd: 0.0025, ms: 700, status: 'live' });
    const a = l.totals('a');
    expect(a.calls).toBe(3);
    expect(a.costUsd).toBeCloseTo(0.0125); expect(a.estUsd).toBeCloseTo(0.005);
    expect(a.byModel.map((m) => [m.model, m.calls])).toEqual([['Muse Spark 1.3', 2], ['SAM 3.1', 1]]);
    expect(l.label('a')).toBe('$0.01 · 2 models');
    expect(l.totals().costUsd).toBeCloseTo(0.015);
    expect(new UsageLedger(() => saved).entries).toHaveLength(4);
    expect(l.forCraft(null)).toEqual([]);
  });
  it('money and a broken store', () => {
    expect([money(0), money(0.0042), money(1.234)]).toEqual(['$0.00', '$0.0042', '$1.23']);
    expect(new UsageLedger(() => '{bad').entries).toEqual([]);
    const l = new UsageLedger(() => null, () => { throw new Error('full'); });
    l.add({ craftId: null, model: 'Code', action: 'x', costUsd: 0, ms: 1, status: 'failed' });
    expect(totalsOf(l.entries).calls).toBe(1);
  });
});
