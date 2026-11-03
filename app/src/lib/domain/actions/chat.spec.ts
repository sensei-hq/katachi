import { describe, expect, it } from 'vitest';
import { fastPath, optsIn, refsFromPlan, refsIn, toolList } from './chat';
import { registerAll } from './defs';
import { migrateV1 } from '../craft/migrate';

registerAll();
let k = 0;
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const names = ['Swirl drop left', 'Swirl drop right', 'Leaf'];
const doc = migrateV1({ id: 'e', name: 'E', createdAt: 1, updatedAt: 1, kind: 'flat' }, { aspect: 1, widthMm: 300,
  regionList: names.map((n, i) => ({ id: `r${i}`, name: n, paths: [rect(50 + i * 300, 100, 100, 150)] })),
  stack: names.map((n, i) => ({ n: i + 1, name: `${n} · cut`, colour: '#C89B6A', material: 'birch', visiblePct: i === 2 ? 0 : 3, hiddenPct: 0, regionId: `r${i}`, itemName: n, role: 'cut' as const })) }, () => `m${++k}`);

describe('the chat fast path', () => {
  it('“smooth all layers” and “remove the hooks” are one call on everything, no model', () => {
    for (const t of ['smooth all layers', 'smooth every layer', 'remove the hooks']) {
      const r = fastPath(t, doc);
      expect(r?.kind).toBe('calls');
      const c = r && r.kind === 'calls' ? r.calls : [];
      expect(c).toHaveLength(1);
      expect(c[0].action).toBe(t.startsWith('smooth') ? 'smooth' : 'unhook');
      if (t.startsWith('smooth')) expect(c[0].refs).toEqual([{ all: true }]);
    }
  });
  it('undo / redo / again need no model', () => {
    expect(fastPath('undo', doc)).toEqual({ kind: 'undo' });
    expect(fastPath('Undo that.', doc)).toEqual({ kind: 'undo' });
    expect(fastPath('redo', doc)).toEqual({ kind: 'redo' });
    expect(fastPath('do that again', doc)).toEqual({ kind: 'again' });
    expect(fastPath('same for the leaf', doc)).toEqual({ kind: 'again', refs: [{ name: 'Leaf' }] });
  });
  it('one plain action with its layers: by number, range, name, empty, this', () => {
    expect(fastPath('delete layer 3', doc)).toEqual({ kind: 'calls', calls: [{ action: 'delete', refs: [{ n: 3 }], opts: {} }] });
    expect(fastPath('merge layers 1-3', doc)).toMatchObject({ calls: [{ action: 'merge', refs: [{ n: 1 }, { n: 2 }, { n: 3 }] }] });
    expect(fastPath('merge the swirl drop left and the swirl drop right', doc)).toMatchObject({ calls: [{ action: 'merge', refs: [{ name: 'Swirl drop right' }, { name: 'Swirl drop left' }] }] });
    expect(fastPath('remove the 0% layers', doc)).toMatchObject({ calls: [{ action: 'delete', refs: [{ empty: true }] }] });
    expect(fastPath('delete this layer', doc)).toMatchObject({ calls: [{ action: 'delete', refs: [{ selected: true }] }] });
    expect(fastPath('straighten all the items', doc)).toMatchObject({ calls: [{ action: 'straighten', refs: [{ all: true }] }] });
    expect(fastPath('make the leaf 40 mm tall', doc)).toMatchObject({ calls: [{ action: 'resize', refs: [{ name: 'Leaf' }], opts: { hMm: 40 } }] });
  });
  it('never a destructive guess; corrections and compound requests go to the planner', () => {
    expect(fastPath('remove the wall from the gold layer', doc)).toBeNull();
    expect(fastPath('remove the red parts', doc)).toBeNull();
    expect(fastPath('merge them', doc)).toBeNull();
    expect(fastPath('merge layer 1 and 2 and then smooth it', doc)).toBeNull();
    expect(fastPath('what a lovely craft', doc)).toBeNull();
  });
  it('options from words; the registry as tools; planner refs', () => {
    expect(optsIn('smooth', 'smooth it a lot')).toEqual({ strength: 4 });
    expect(optsIn('smooth', 'smooth it slightly')).toEqual({ strength: 1 });
    expect(optsIn('resize', 'scale to 50%')).toEqual({ scale: 0.5 });
    expect(optsIn('resize', 'make it 4 cm wide')).toEqual({ wMm: 40 });
    expect(optsIn('flip', 'flip it upside down')).toEqual({ axis: 'y' });
    expect(optsIn('quantity', 'make 5 of these')).toEqual({ qty: 5 });
    expect(optsIn('reorder', 'send it to the back')).toEqual({ to: 'back' });
    expect(refsIn('layers 2, 3 and 5', doc)).toEqual([{ n: 2 }, { n: 3 }, { n: 5 }]);
    const tools = toolList();
    expect(tools.find((t) => t.id === 'reorder')!.options).toBe('to (front|back|forward|backward)');
    expect(tools.find((t) => t.id === 'resize')!.options).toContain('hMm 5–2000');
    expect(refsFromPlan([{ kind: 'n', value: '2' }, { kind: 'role', value: 'engrave' }, { kind: 'bogus', value: '' }, { kind: 'n', value: 'x' }])).toEqual([{ n: 2 }, { role: 'engrave' }]);
  });
});
