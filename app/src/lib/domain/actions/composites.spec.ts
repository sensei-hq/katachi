import { describe, expect, it } from 'vitest';
import { fastPath } from './chat';
import { allComposites, compositeOf, expandCalls } from './composites';
import { registerAll } from './defs';
import { craftOf, sq } from './defs/fixtures';

registerAll();

const doc = () => craftOf({ items: [{ name: 'Panel', parts: [
  { name: 'Base', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(0, 0, 100)] }] },
  { name: 'Middle', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(0, 0, 60)] }] },
  { name: 'Top', colour: '#b03a2e', ops: [{ kind: 'cut', loops: [sq(0, 0, 40)] }] }
] }] });

describe('composite chains', () => {
  it('ships a built-in polish chain: shadows, tidy, pattern, smooth', () => {
    const ids = allComposites().map((c) => c.id);
    expect(ids).toContain('polish');
    expect(compositeOf('polish')!.calls.map((c) => c.action)).toEqual(['deshadow', 'tidy', 'repeat-pattern', 'smooth']);
  });
  it('expansion passes atomic calls through and expands chains', () => {
    expect(expandCalls([{ action: 'smooth', refs: [{ n: 1 }], opts: {} }])).toEqual([{ action: 'smooth', refs: [{ n: 1 }], opts: {} }]);
    const out = expandCalls([{ action: 'polish', refs: [], opts: {} }]);
    expect(out.map((c) => c.action)).toEqual(['deshadow', 'tidy', 'repeat-pattern', 'smooth']);
    expect(out[0].refs).toEqual([{ all: true }]);
  });
  it('named layers override every step’s targets', () => {
    const out = expandCalls([{ action: 'polish', refs: [{ n: 1 }, { n: 2 }], opts: {} }]);
    expect(out).toHaveLength(4);
    for (const c of out) expect(c.refs).toEqual([{ n: 1 }, { n: 2 }]);
  });
  it('unknown ids pass through untouched (the runner refuses them)', () => {
    expect(expandCalls([{ action: 'frobnicate', refs: [], opts: {} }])).toEqual([{ action: 'frobnicate', refs: [], opts: {} }]);
  });
  it('“polish the layers” runs the chain with no model', () => {
    const r = fastPath('polish the layers', doc());
    expect(r?.kind).toBe('calls');
    if (r?.kind === 'calls') expect(r.calls.map((c) => c.action)).toEqual(['deshadow', 'tidy', 'repeat-pattern', 'smooth']);
  });
  it('“polish layers 1 and 2” runs the chain on those layers', () => {
    const r = fastPath('polish layers 1 and 2', doc());
    expect(r?.kind).toBe('calls');
    if (r?.kind === 'calls') {
      expect(r.calls).toHaveLength(4);
      for (const c of r.calls) expect(c.refs).toEqual([{ n: 1 }, { n: 2 }]);
    }
  });
});
