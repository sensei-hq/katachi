import { changes, copy, type Layer, devices, gapChoices, kinds, layerSets, regions, views, type DeviceId, type GapChoice, type GapRule, type Joinery, type Kind, type LayerSetId, type MakeAs, type RefineTool, type RegionId, type SegmentView, type ViewId } from '../content/layers';

const fresh = (s: LayerSetId): Layer[] => layerSets[s].layers.map((l) => ({ ...l, shapes: [...l.shapes] }));

/** What the models found, in the shape the live calls return. Pages read these fields only; the fixtures are just
 * the starting values until MuseAgents (lib/state/muse.svelte.ts) writes a result over them. */
export interface Check { status: 'pass' | 'warn' | 'fail'; text: string }
export type Region = (typeof regions)[number] & { paths?: [number, number][][]; ones?: number };
export interface SheetPaths { name: string; svg: string; pathCount: number; cutLengthMm: number }
export interface Part { name: string; size: string; needs: ViewId[]; any?: boolean; missing: string }
export interface Outline { shape: 'circle' | 'rect' | 'free'; sizeMm: number }
export const fixtureParts: Part[] = [
  { name: 'Front · back', size: '160 × 210 · hole Ø 34', needs: ['front', 'back'], missing: 'needs front and back' },
  { name: 'Sides ×2', size: '150 × 170 · 45°', needs: ['left', 'right'], any: true, missing: 'needs a side' },
  { name: 'Roof ×2', size: '170 × 120 · 45°', needs: ['top'], missing: 'pitch unknown' },
  { name: 'Floor', size: '150 × 150', needs: ['base'], missing: 'needs base' }
];

// Every choice in the image → layers flow (phone steps and studio). Pages read fields and call methods;
// components only get values. Stages mirror docs/design/01-image-pipeline.md (S1–S9).
export class LayerFlowState {
  // ── Model results (MuseAgents → apply*): what is in the picture, its outline, regions, parts, the assembly
  subject = $state('layered paper art in a round hoop');
  /** the Spark ImageBrief for the captured picture (design/01 S2), kept with the craft */
  imageBrief = $state<import('../domain/schemas').ImageBrief | null>(null);
  applyBrief(brief: import('../domain/schemas').ImageBrief) { this.imageBrief = brief; this.subject = brief.subject; }
  outline = $state<Outline>({ shape: 'circle', sizeMm: 300 });
  cutoutChecks = $state<Check[]>(copy.cutout.checks.map((c) => ({ ...c })) as Check[]);
  regionList = $state<Region[]>(regions.map((r) => ({ ...r })));
  parts = $state<Part[]>(fixtureParts.map((p) => ({ ...p, needs: [...p.needs] })));
  applySubject(subject: string) { this.subject = subject; }
  applyCutout(r: { outline: Outline; checks: Check[] }) { this.outline = r.outline; this.cutoutChecks = r.checks; }
  applyRegions(list: Region[]) { this.regionList = list; this.keep = Object.fromEntries(list.map((r) => [r.id, r.keep])) as Record<RegionId, boolean>; }
  applyLayers(layers: Layer[]) { this.stack = layers.map((l, i) => ({ ...l, n: i + 1 })); this.sel = Math.min(this.sel, this.stack.length) || 1; this.overrides = {}; }
  applyParts(parts: Part[]) { this.parts = parts; }
  /** traced cut paths per sheet (S7, from the SAM masks via domain/vector), kept with the craft */
  sheetPaths = $state<SheetPaths[]>([]);
  applySheets(sheets: SheetPaths[]) { this.sheetPaths = sheets; }
  /** parts with whether the captured views cover them (3D) */
  get partRows() { return this.parts.map((p) => ({ ...p, ok: p.any ? p.needs.some((v) => this.done.includes(v)) : p.needs.every((v) => this.done.includes(v)) })); }

  // S1 · source
  kind = $state<Kind>('flat');
  get currentKind() { return kinds.find((k) => k.id === this.kind) ?? kinds[0]; }
  setKind(k: Kind) { this.kind = k; }
  // D1 · the plan Katachi and you agreed at Import (objective + chosen variation)
  brief = $state('');
  setBrief(b: string) { this.brief = b; }
  // D1 · what to make it as (paper or wood picks the set)
  makeAs = $state<MakeAs>('auto');
  setMakeAs(m: MakeAs) { this.makeAs = m; if (m === 'paper' || m === 'wood') this.setSet(m); }

  // S3 · cutout
  cutoutView = $state<'original' | 'cutout'>('cutout');
  setCutoutView(v: 'original' | 'cutout') { this.cutoutView = v; }

  // S4 · which regions become parts
  keep = $state(Object.fromEntries(regions.map((r) => [r.id, r.keep])) as Record<RegionId, boolean>);
  get regions() { return this.regionList.map((r) => ({ ...r, on: this.keep[r.id] })); }
  get kept() { return this.regions.filter((r) => r.on); }
  get keptPct() { return Math.round(this.kept.reduce((a, r) => a + r.pct, 0)); }
  toggleRegion(id: RegionId) { this.keep[id] = !this.keep[id]; }
  // D2 · what the segment canvas shows and how a click refines it
  segmentView = $state<SegmentView>('masks');
  refineTool = $state<RefineTool>('pick');
  setSegmentView(v: SegmentView) { this.segmentView = v; }
  setRefineTool(t: RefineTool) { this.refineTool = t; }

  // S5a · colour-graded layers
  set = $state<LayerSetId>('paper');
  sel = $state(4);
  /** the editable stack, back → front (starts from the medium's colour groups) */
  stack = $state<Layer[]>(fresh('paper'));
  get data() { return layerSets[this.set]; }
  get layers() { return this.stack; }
  get structural() { return this.data.structural; }
  get selected() { return this.layers[Math.min(this.sel, this.layers.length) - 1]; }
  get depthMm() { return (this.selected.n * this.data.mmPerLayer).toFixed(1); }
  setSet(s: LayerSetId) { this.set = s; this.stack = fresh(s); this.sel = 4; this.overrides = {}; }
  // the stack's own edits: duplicate, merge down, split (by islands; split by tone needs the real masks)
  private replace(from: number, count: number, put: Layer[], select: number) {
    const next = [...this.stack];
    next.splice(from, count, ...put);
    this.stack = next.map((l, i) => ({ ...l, n: i + 1 }));
    this.sel = select; this.overrides = {};
  }
  duplicate(n: number) {
    const { parts: _p, ...l } = this.stack[n - 1];
    void _p;
    this.replace(n, 0, [{ ...l, name: `${l.name} copy` }], n + 1);
  }
  canMergeDown(n: number) { return n >= 1 && n < this.stack.length; }
  mergeDown(n: number) {
    if (!this.canMergeDown(n)) return;
    const [a, b] = this.stack.slice(n - 1, n + 1);
    const round = (x: number) => Math.round(x * 10) / 10;
    this.replace(n - 1, 2, [{ n, name: `${a.name} + ${b.name}`, shapes: [...a.shapes, ...b.shapes], colour: b.colour, material: b.material,
      visiblePct: round(a.visiblePct + b.visiblePct), hiddenPct: round(Math.min(a.hiddenPct, b.hiddenPct)), parts: [...(a.parts ?? [a]), ...(b.parts ?? [b])] }], n);
  }
  canSplit(n: number) { const l = this.stack[n - 1]; return Boolean(l) && ((l.parts?.length ?? 0) > 1 || l.shapes.length > 1); }
  split(n: number) {
    if (!this.canSplit(n)) return;
    const l = this.stack[n - 1];
    const pieces = l.parts ?? l.shapes.map((shape, i) => ({ ...l, name: `${l.name} · ${i + 1}`, shapes: [shape], parts: undefined }));
    this.replace(n - 1, 1, pieces, n);
  }
  // what the selected layer shows: the part you see (solid) and the part hidden behind the layers above (hatched)
  showSolid = $state(true);
  showHidden = $state(true);
  toggleSolidView() { this.showSolid = !this.showSolid; }
  toggleHiddenView() { this.showHidden = !this.showHidden; }
  selectLayer(n: number) { this.sel = n; }
  // work area · manual edits to one sheet (the vector edits arrive with the live pipeline)
  renameLayer(n: number, name: string) { const t = name.trim(); if (t) this.stack = this.stack.map((l) => (l.n === n ? { ...l, name: t } : l)); }
  setLayerMaterial(n: number, material: string) { const t = material.trim(); if (t) this.stack = this.stack.map((l) => (l.n === n ? { ...l, material: t } : l)); }
  nextLayer() { this.sel = (this.selected.n % this.layers.length) + 1; }

  // S6 · gaps for one layer (phone)
  gapChoice = $state<GapChoice>('extend');
  applyAll = $state(true);
  get currentGap() { return gapChoices.find((g) => g.id === this.gapChoice) ?? gapChoices[0]; }
  setGapChoice(g: GapChoice) { this.gapChoice = g; }
  toggleApplyAll() { this.applyAll = !this.applyAll; }

  // S6 · gaps for the whole stack (studio review)
  gapRule = $state<GapRule>('smart');
  overrides = $state<Record<number, boolean>>({});
  get gapCards() {
    return this.layers.map((l) => {
      const byRule = this.gapRule === 'extend' ? true : this.gapRule === 'leave' ? false : this.structural.includes(l.n);
      return { ...l, solid: l.n in this.overrides ? this.overrides[l.n] : byRule };
    });
  }
  get materialPct() { return Math.round(this.gapCards.reduce((a, l) => a + (l.solid ? 100 : l.visiblePct + 4), 0) / this.gapCards.length); }
  setGapRule(r: GapRule) { this.gapRule = r; this.overrides = {}; }
  toggleSolid(n: number) { const card = this.gapCards.find((c) => c.n === n); if (card) this.overrides = { ...this.overrides, [n]: !card.solid }; }

  // S5b · six views
  done = $state<ViewId[]>(['front', 'right', 'back']);
  get views() { return views.map((v) => ({ ...v, ok: this.done.includes(v.id) })); }
  get nextView() { return views.find((v) => !this.done.includes(v.id)); }
  get sidesKnown() { return this.done.includes('left') || this.done.includes('right'); }
  shoot() { if (this.nextView) this.done = [...this.done, this.nextView.id]; }
  joinery = $state<Joinery>('finger');
  setJoinery(j: Joinery) { this.joinery = j; }
  toggleView(id: ViewId) { this.done = this.done.includes(id) ? this.done.filter((d) => d !== id) : [...this.done, id]; }

  // reference + changes
  skipped = $state<number[]>([]);
  get changes() { return changes.map((c) => ({ ...c, on: !this.skipped.includes(c.n) })); }
  get activeChanges() { return this.changes.filter((c) => c.on).length; }
  toggleChange(n: number) { this.skipped = this.skipped.includes(n) ? this.skipped.filter((s) => s !== n) : [...this.skipped, n]; }

  // output · device adapter (docs/design/03)
  device = $state<DeviceId>('cricut');
  get currentDevice() { return devices.find((d) => d.id === this.device) ?? devices[0]; }
  setDevice(d: DeviceId) { this.device = d; this.job = { sheet: 1, phase: 'feed', progress: 0 }; }

  // output · cutters take one sheet at a time: feed the sheet's material, send, watch it cut, verify, next
  job = $state<{ sheet: number; phase: 'feed' | 'cutting' | 'verify' | 'done'; progress: number }>({ sheet: 1, phase: 'feed', progress: 0 });
  get jobLayer() { return this.layers[Math.min(this.job.sheet, this.layers.length) - 1]; }
  get feedText() { return `Feed ${this.jobLayer.material}`; }
  sheetStatus(n: number): 'cut' | 'current' | 'waiting' {
    if (this.job.phase === 'done' || n < this.job.sheet) return 'cut';
    return n === this.job.sheet ? 'current' : 'waiting';
  }
  /** Send the sheet: the device reports progress while it cuts (simulated here until the device adapters stream it). */
  beginCut({ simulate = false } = {}) {
    if (this.job.phase !== 'feed') return;
    this.job = { ...this.job, phase: 'cutting', progress: 0 };
    if (!simulate) return;
    const t = setInterval(() => { this.advanceCut(8); if (this.job.phase !== 'cutting') clearInterval(t); }, 200);
  }
  advanceCut(pct: number) {
    if (this.job.phase !== 'cutting') return;
    const progress = Math.min(100, this.job.progress + pct);
    this.job = { ...this.job, progress, phase: progress >= 100 ? 'verify' : 'cutting' };
  }
  recut() { this.job = { ...this.job, phase: 'feed', progress: 0 }; }
  confirmCut() {
    if (this.job.phase !== 'verify') return;
    this.job = this.job.sheet >= this.layers.length ? { ...this.job, phase: 'done' } : { sheet: this.job.sheet + 1, phase: 'feed', progress: 0 };
  }

  // refinements said in the chat on a step, kept with the craft (applied by Spark in the integrated build)
  notes = $state<{ step: string; layer?: string; text: string }[]>([]);
  addNote(n: { step: string; layer?: string; text: string }) { this.notes = [...this.notes, n]; }
  // assemble · which instruction is open and which are ticked off
  assembleAt = $state(0);
  assembled = $state<number[]>([]);
  openAssembleStep(i: number) { this.assembleAt = i; }
  toggleAssembled(i: number) { this.assembled = this.assembled.includes(i) ? this.assembled.filter((x) => x !== i) : [...this.assembled, i]; }

  // project save / reopen: every choice above, as plain data
  private static readonly SAVED = ['subject', 'imageBrief', 'outline', 'cutoutChecks', 'regionList', 'parts', 'notes', 'assembleAt', 'assembled', 'kind', 'brief', 'makeAs', 'cutoutView', 'keep', 'segmentView', 'refineTool', 'set', 'stack', 'sel', 'gapChoice', 'applyAll', 'gapRule', 'overrides', 'done', 'joinery', 'skipped', 'device', 'showSolid', 'showHidden', 'job', 'sheetPaths'] as const;
  /** a fresh flow's choices (New starts from these) */
  static defaults() { return new LayerFlowState().snapshot(); }
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(LayerFlowState.SAVED.map((k) => [k, $state.snapshot(this[k])]));
  }
  restore(saved: Record<string, unknown>) {
    const self = this as unknown as Record<string, unknown>;
    for (const k of LayerFlowState.SAVED) if (k in saved) self[k] = saved[k];
  }
}
