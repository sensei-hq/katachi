import { describe, expect, it } from 'vitest';
import { annotate } from './annotate';
import { craftOf, sq } from '../actions/defs/fixtures';

const one = () => craftOf({ items: [{ name: 'Panel', parts: [{ name: 'Base', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(0, 0, 100)] }] }] }] });

describe('annotate', () => {
  it('an empty craft has no checks', () => {
    expect(annotate(craftOf({ items: [] }))).toEqual([]);
  });
  it('a clean craft passes its checks', () => {
    const rows = annotate(one());
    expect(rows[0]).toEqual({ text: '1 item · 1 layer', status: 'info' });
    expect(rows.filter((r) => r.status === 'warn')).toHaveLength(0);
    expect(rows.some((r) => r.text === 'Every layer has an outline')).toBe(true);
    expect(rows.some((r) => r.text === 'Everything fits the 300 × 300 mm board')).toBe(true);
  });
  it('flags an empty layer, a duplicate name, an oversize and a tiny part', () => {
    const doc = craftOf({ items: [{ name: 'Panel', parts: [
      { name: 'Base', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(0, 0, 100)] }] },
      { name: 'Base', colour: '#1e8449', ops: [{ kind: 'cut', loops: [sq(0, 0, 10)] }] },
      { name: 'Ghost', colour: '#ffffff', ops: [] },
      { name: 'Backer', colour: '#c8b28a', ops: [{ kind: 'cut', loops: [sq(0, 0, 1300)] }] },
      { name: 'Dot', colour: '#c8b28a', ops: [{ kind: 'cut', loops: [sq(0, 0, 4)] }] }
    ] }] });
    const rows = annotate(doc);
    const warns = rows.filter((r) => r.status === 'warn').map((r) => r.text);
    expect(warns.some((t) => t.includes('Ghost') && t.includes('no outline'))).toBe(true);
    expect(warns.some((t) => t.includes('Base') && t.includes('twice'))).toBe(true);
    expect(warns.some((t) => t.includes('Backer') && t.includes('300 × 300'))).toBe(true);
    expect(warns.some((t) => t.includes('Dot') && t.includes('small'))).toBe(true);
  });
});
