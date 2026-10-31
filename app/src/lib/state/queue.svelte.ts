// The cut queue (design/11–12): sheets from any craft, cut one at a time with a person in the loop — load the
// sheet, press Start, watch the tool follow the cutting program, the waste falls away, the piece goes to Assemble.
// Kept for this user in localStorage. Until a machine is connected the run is simulated from the same program
// (domain/toolpath) the machine would get.
import { program, toolpath, type Machine, type Pt, type Toolpath } from '../domain/toolpath';

export type QueuePhase = 'waiting' | 'running' | 'paused' | 'weeding' | 'cut' | 'done';
export interface QueueItem {
  id: string; craftId: string; craftName: string; layer: number; name: string; material: string;
  op: 'cut' | 'engrave'; colour: string; machine: Machine;
  /** the sheet as an SVG path (0-1000 photo units) for thumbnails */
  cut: string;
  /** the shapes the tool follows, in mm on the sheet */
  shapes: Pt[][];
  /** the sheet's size in mm (the photo's width × height at the craft's real size) */
  sheetMm: [number, number];
  phase: QueuePhase; progress: number; weed: number; addedAt: number;
}
export type NewQueueItem = Omit<QueueItem, 'id' | 'phase' | 'progress' | 'weed' | 'addedAt'>;
const KEEP = 60;
/** how long the simulated run takes at 1× (a real cut takes minutes; this shows the path) */
export const RUN_SECONDS = 14;

export class QueueState {
  items = $state<QueueItem[]>([]);
  /** run speed: 1×, 2× or 6× */
  speed = $state(1);
  /** sheets added since the rail last showed them (the badge pulses) */
  added = $state(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a cache of computed programs, not reactive state
  private paths = new Map<string, Toolpath>();
  constructor(private read: () => string | null = () => null, private write: (s: string) => void = () => {}) { this.reload(); }
  reload() {
    try {
      const raw = this.read(); const list = raw ? (JSON.parse(raw) as QueueItem[]) : [];
      // a reload mid-run goes back to "load the sheet" (it may have moved); a finished cut stays cut
      this.items = Array.isArray(list) ? list.filter((x) => Array.isArray(x.shapes)).map((x) => (x.phase === 'running' || x.phase === 'paused' || x.phase === 'weeding' ? { ...x, phase: 'waiting' as const, progress: 0, weed: 0 } : x)) : [];
    } catch { this.items = []; }
  }
  private save() { try { this.write(JSON.stringify(this.items)); } catch { /* storage full: kept for this session */ } }
  /** add sheets (skips one already waiting for the same craft and layer); returns how many were added */
  add(list: NewQueueItem[]): number {
    const fresh = list.filter((x) => x.shapes.length && !this.items.some((i) => i.craftId === x.craftId && i.layer === x.layer && i.phase !== 'done'));
    this.items = [...this.items, ...fresh.map((x, k) => ({ ...x, id: `${x.craftId}:${x.layer}:${Date.now()}:${k}`, phase: 'waiting' as const, progress: 0, weed: 0, addedAt: Date.now() }))].slice(-KEEP);
    this.added += fresh.length;
    this.save();
    return fresh.length;
  }
  seen() { this.added = 0; }
  /** the sheet on the bed: the first one not done */
  get current(): QueueItem | null { return this.items.find((i) => i.phase !== 'done') ?? null; }
  get waiting() { return this.items.filter((i) => i.phase !== 'done'); }
  get done() { return this.items.filter((i) => i.phase === 'done'); }
  /** the cutting program for a sheet (cached) */
  toolpathOf(it: QueueItem): Toolpath {
    let tp = this.paths.get(it.id);
    if (!tp) { tp = toolpath(it.shapes); this.paths.set(it.id, tp); }
    return tp;
  }
  programOf(it: QueueItem) { return program(this.toolpathOf(it), it.machine, { op: it.op, name: it.name }); }
  private patch(id: string, p: Partial<QueueItem>, persist = true) { this.items = this.items.map((i) => (i.id === id ? { ...i, ...p } : i)); if (persist) this.save(); }
  /** Start (the sheet is loaded), Pause, Resume */
  start({ tickMs = 33 } = {}) {
    const c = this.current; if (!c) return;
    if (c.phase === 'waiting') this.patch(c.id, { phase: 'running', progress: 0, weed: 0 });
    else if (c.phase === 'paused') this.patch(c.id, { phase: 'running' });
    else if (c.phase === 'running') { this.patch(c.id, { phase: 'paused' }); return; }
    else return;
    this.run(tickMs);
  }
  private run(tickMs: number) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(tickMs), tickMs);
  }
  /** one step of the simulated run: the tool moves along the program, then the waste is cleared */
  tick(ms: number) {
    const c = this.current;
    if (!c || (c.phase !== 'running' && c.phase !== 'weeding')) { if (this.timer) clearInterval(this.timer); this.timer = null; return; }
    if (c.phase === 'running') {
      const progress = Math.min(1, c.progress + (ms / 1000 / RUN_SECONDS) * this.speed);
      this.patch(c.id, progress >= 1 ? { progress: 1, phase: c.op === 'engrave' ? 'cut' : 'weeding' } : { progress }, progress >= 1);
    } else {
      const weed = Math.min(1, c.weed + ms / 900);
      this.patch(c.id, weed >= 1 ? { weed: 1, phase: 'cut' } : { weed }, weed >= 1);
    }
  }
  /** the piece is off the machine: on to the next sheet */
  next() { const c = this.current; if (c?.phase === 'cut') this.patch(c.id, { phase: 'done' }); }
  /** run it again */
  again() { const c = this.current; if (c && c.phase !== 'running') this.patch(c.id, { phase: 'waiting', progress: 0, weed: 0 }); }
  setSpeed(s: number) { this.speed = s; }
  remove(id: string) { this.items = this.items.filter((i) => i.id !== id); this.save(); }
  /** move a waiting sheet to the front */
  toFront(id: string) { const it = this.items.find((i) => i.id === id); const c = this.current; if (!it || it.phase !== 'waiting' || (c && c.phase !== 'waiting')) return; this.items = [...this.done, it, ...this.items.filter((i) => i.id !== id && i.phase !== 'done')]; this.save(); }
  clearDone() { this.items = this.items.filter((i) => i.phase !== 'done'); this.save(); }
  /** the cut pieces of a craft, by layer (Assemble marks the ones not cut yet) */
  cutLayers(craftId: string) { return this.items.filter((i) => i.craftId === craftId && i.phase === 'done').map((i) => i.layer); }
}
