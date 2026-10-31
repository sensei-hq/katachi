import { describe, expect, it, vi } from 'vitest';
import { QueueState, type NewQueueItem } from './queue.svelte';

const sq = (s: number): [number, number][] => [[0, 0], [s, 0], [s, s], [0, s]];
const sheet = (layer: number, craftId = 'a', op: 'cut' | 'engrave' = 'cut'): NewQueueItem => ({ craftId, craftName: 'Cat', layer, name: `L${layer}`, material: 'Gold card', op, colour: '#D19A45', machine: 'paper', cut: 'M0 0Z', shapes: [sq(100), sq(10)], sheetMm: [300, 300] });
describe('the cut queue · one sheet at a time, a person in the loop', () => {
  it('adds sheets once (the badge counts them), runs the program, clears the waste, moves on; kept per user', () => {
    let saved = '';
    const q = new QueueState(() => saved || null, (s) => { saved = s; });
    expect(q.add([sheet(1), sheet(2)])).toBe(2);
    expect(q.add([sheet(2), sheet(1, 'b'), { ...sheet(9), shapes: [] }])).toBe(1);
    expect(q.added).toBe(3); q.seen(); expect(q.added).toBe(0);
    const c = q.current!;
    expect(q.toolpathOf(c).shapes).toBe(2);
    expect(q.programOf(c).lines[0]).toContain('blade cutter moves');
    q.start({ tickMs: 1e9 });
    expect(q.current?.phase).toBe('running');
    q.start(); expect(q.current?.phase).toBe('paused');
    q.start({ tickMs: 1e9 }); expect(q.current?.phase).toBe('running');
    q.setSpeed(6);
    for (let i = 0; i < 100 && q.current?.phase === 'running'; i++) q.tick(1000);
    expect(q.current?.phase).toBe('weeding');
    q.tick(1000); expect(q.current?.phase).toBe('cut');
    q.next();
    expect(q.current?.layer).toBe(2);
    expect(q.cutLayers('a')).toEqual([1]);
    q.toFront(q.items.at(-1)!.id);
    expect(q.current?.craftId).toBe('b');
    q.start({ tickMs: 1e9 });
    const again = new QueueState(() => saved);
    expect(again.current?.phase).toBe('waiting');   // a reload mid-run starts the sheet again
    q.tick(0); q.start(); q.again(); expect(q.current?.phase).toBe('waiting');
    q.clearDone(); expect(q.done).toHaveLength(0);
    q.remove(q.items[0].id); expect(q.items).toHaveLength(1);
    expect(new QueueState(() => '{x').items).toEqual([]);
  });
  it('an engraving pass has no waste to clear; the run advances on its own', async () => {
    vi.useFakeTimers();
    const q = new QueueState();
    q.add([sheet(1, 'a', 'engrave')]);
    expect(q.programOf(q.current!).lines[0]).toContain('blade');
    q.setSpeed(6); q.start({ tickMs: 100 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(q.current?.phase).toBe('cut');
    vi.useRealTimers();
  });
});
