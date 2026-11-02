import { changes, cleanLayerName, type Layer, devices, gapChoices, kinds, layerSets, regions, views, type DeviceId, type GapChoice, type GapRule, type Joinery, type Kind, type LayerSetId, type MakeAs, type RefineTool, type RegionId, type SegmentView, type ViewId } from '../content/layers';
import { pointsToPath } from '../domain/vector';
import { pointInPaths, unionPaths, type Box } from '../domain/layering';
import { layOut, sheetD, toMm, uprightTurn, type Pt } from '../domain/toolpath';


/** What the models found, in the shape the live calls return. Pages read these fields only; the fixtures are just
 * the starting values until MuseAgents (lib/state/muse.svelte.ts) writes a result over them. */
export interface Check { status: 'pass' | 'warn' | 'fail'; text: string }
export type Region = (typeof regions)[number] & { paths?: [number, number][][]; /** the whole sheet to cut (what shows + what hides under the layers in front) */ cutPaths?: [number, number][][]; hiddenPct?: number; ones?: number; box?: { x1: number; y1: number; x2: number; y2: number }; colour?: string; itemId?: string; itemName?: string; /** separate items: the cut outline or an engraving inside it */ role?: 'cut' | 'engrave'; /** fretwork: the see-through holes inside a cut item (cut out first; kept apart so reshaping the outline keeps them) */ holes?: [number, number][][] };
export interface SheetPaths { name: string; svg: string; pathCount: number; cutLengthMm: number; sizeMm?: number; /** the piece's bounds on the sheet, mm */ bbox?: { x: number; y: number; w: number; h: number }; /** the layer it is cut from */ layer?: number; /** engraved (Engrave + cut builds) or cut through */ op?: 'cut' | 'engrave' }
/**
 * How a layered piece is built (design/10 §Build):
 * - stacked: additive — every layer includes the ones in front of it, on a solid backing (the back layer is the
 *   whole outline in the back colour). Shadows in the photo usually mean this.
 * - inlay: distinct pieces that fit together like a puzzle on the backing (the back layer is still the outline).
 * - engrave: one board (wood) — the inner colours are engraved first, then the outline is cut.
 */
export type Build = 'stacked' | 'inlay' | 'engrave';
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
  subject = $state('');
  /** the Spark ImageBrief for the captured picture (design/01 S2), kept with the craft */
  imageBrief = $state<import('../domain/schemas').ImageBrief | null>(null);
  applyBrief(brief: import('../domain/schemas').ImageBrief) { this.imageBrief = brief; this.subject = brief.subject; }
  outline = $state<Outline>({ shape: 'circle', sizeMm: 300 });
  cutoutChecks = $state<Check[]>([]);
  regionList = $state<Region[]>([]);
  parts = $state<Part[]>(fixtureParts.map((p) => ({ ...p, needs: [...p.needs] })));
  applySubject(subject: string) { this.subject = subject; }
  /** the user asked for the backdrop (wall, shadows, props) to go: background removal runs strict */
  removeBackdrop = $state(false);
  /** the stack the user described ("a solid white base, then black…"): the layers are built to it, not guessed */
  layerPlan = $state<import('../domain/layering').StackPlan | null>(null);
  /** the SAM subject mask, traced to closed paths in 0-1000 image coordinates (Cutout view) */
  subjectPaths = $state<[number, number][][]>([]);
  applyCutout(r: { outline: Outline; checks: Check[]; paths?: [number, number][][] }) { this.outline = r.outline; this.cutoutChecks = r.checks; if (r.paths) this.subjectPaths = r.paths; }
  /** every region's traced mask as an SVG overlay for the photo stage (empty until SAM returns paths) */
  get overlays() {
    return this.regions.filter((r) => r.paths?.length).map((r) => ({ id: r.id, name: r.name, tone: r.tone, on: r.on, colour: r.colour, d: (r.paths ?? []).map(pointsToPath).join('') }));
  }
  get hasPhotoStage() { return this.overlays.length > 0 || this.subjectPaths.length > 0; }
  get subjectD() { return this.subjectPaths.map(pointsToPath).join(''); }
  sheetFor(n: number) { return this.sheetPaths.find((s) => s.layer === n) ?? (this.sheetPaths.some((s) => s.layer) ? undefined : this.sheetPaths[n - 1]); }
  applyRegions(list: Region[]) { this.regionList = list; this.keep = Object.fromEntries(list.map((r) => [r.id, r.keep])) as Record<RegionId, boolean>; }
  applyLayers(layers: Layer[]) { this.stack = layers.map((l, i) => ({ ...l, name: cleanLayerName(l.name), n: i + 1 })); this.sel = Math.min(this.sel, this.stack.length) || 1; this.overrides = {}; this.hiddenLayers = []; }
  applyParts(parts: Part[]) { this.parts = parts; }
  /** the stitched ObjectSpec for a 3D object (docs/design/08-B), kept with the craft */
  objectSpec = $state<import('../domain/stitch').ObjectSpec | null>(null);
  applySpec(spec: import('../domain/stitch').ObjectSpec) { this.objectSpec = spec; }
  /** a 3D kit's sheets as read from its cut-plan picture (approximate outlines, mm on each sheet) */
  plan = $state<import('../domain/layering').PlanSheet[]>([]);
  /** the plan's sheets become the craft's layers: per sheet the engraving (first) and the cut */
  applyPlan(sheets: import('../domain/layering').PlanSheet[], material = '3 mm ply') {
    this.plan = sheets;
    const layers: Layer[] = [];
    sheets.forEach((s, i) => {
      if (s.engrave.length) layers.push({ n: 0, name: `${s.name} · engrave`, shapes: ['sky'], colour: '#8A5A33', visiblePct: 100, hiddenPct: 0, material, itemName: s.name, role: 'engrave', planSheet: i });
      layers.push({ n: 0, name: `${s.name} · cut`, shapes: ['sky'], colour: '#C89B6A', visiblePct: 100, hiddenPct: 0, material, itemName: s.name, role: 'cut', planSheet: i });
    });
    this.applyLayers(layers);
    const d = (paths: [number, number][][]) => paths.map((p) => `M${p.map(([x, y]) => `${x} ${y}`).join('L')}Z`).join('');
    const len = (paths: [number, number][][]) => paths.reduce((a, p) => a + p.reduce((b, q, k) => b + Math.hypot(q[0] - p[(k + 1) % p.length][0], q[1] - p[(k + 1) % p.length][1]), 0), 0);
    this.applySheets(this.layers.map((l) => { const s = sheets[l.planSheet!], paths = l.role === 'engrave' ? s.engrave : s.cut;
      return { name: l.name, svg: d(paths), pathCount: paths.length, cutLengthMm: Math.round(len(paths)), sizeMm: Math.max(...s.sizeMm), layer: l.n, op: l.role }; }));
  }
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
  keep = $state({} as Record<RegionId, boolean>);
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
  stack = $state<Layer[]>([]);
  /** layers hidden from the stage by the eye toggle (Sheets still cut them) */
  hiddenLayers = $state<number[]>([]);
  toggleLayerVisible(n: number) { this.hiddenLayers = this.hiddenLayers.includes(n) ? this.hiddenLayers.filter((x) => x !== n) : [...this.hiddenLayers, n]; }
  isLayerVisible(n: number) { return !this.hiddenLayers.includes(n); }
  /** the blown-up exploded stack preview can be hidden */
  showStack = $state(false);
  toggleStack() { this.showStack = !this.showStack; }
  /** the work area shows every layer, only the selected one, or the stack exploded (isometric, back at the bottom) */
  view = $state<'all' | 'only' | 'exploded' | 'cut'>('all');
  setView(v: 'all' | 'only' | 'exploded' | 'cut') { this.view = v; }
  /** the SAM region a layer was built from (regionId binding, index only as a legacy fallback) */
  regionForLayer(layer: Layer | undefined) {
    if (!layer) return undefined;
    return this.regions.find((r) => r.id === layer.regionId) ?? this.regions[layer.n - 1];
  }
  overlayForLayer(n: number) {
    const layer = this.layers[n - 1]; const region = this.regionForLayer(layer);
    if (!region?.paths?.length) return undefined;
    return { id: region.id, name: region.name, tone: region.tone, on: region.on, colour: region.colour ?? layer?.colour, d: region.paths.map(pointsToPath).join('') };
  }
  // ── How it is built: stacked (additive), inlay (distinct pieces) or engrave + cut (one board)
  build = $state<Build>('stacked');
  setBuild(b: Build) { this.build = b; this.sheetPaths = []; this.job = { sheet: 1, phase: 'feed', progress: 0 }; }
  /** what happens to a layer's sheet: the inner colours of an Engrave + cut board are engraved, everything else is cut */
  opFor(n: number): 'cut' | 'engrave' { const l = this.layers[n - 1]; return l?.role ?? (this.build === 'engrave' && n > 1 ? 'engrave' : 'cut'); }
  /** a layer's sheet: stacked = what shows + what sits under the layers in front; the back layer is always the
   *  whole outline (the backing); inlay and engrave = just what shows */
  sheetPointsFor(n: number): [number, number][][] {
    const pl = this.layers[n - 1]?.planSheet, ps = pl !== undefined ? this.plan[pl] : undefined;
    if (ps) { const [sw, sh] = ps.sizeMm; return (this.layers[n - 1].role === 'engrave' ? ps.engrave : ps.cut).map((p) => p.map(([x, y]) => [Math.round((x / sw) * 1000), Math.round((y / sh) * 1000)] as [number, number])); }
    const r = this.regionForLayer(this.layers[n - 1]);
    if (!r) return [];
    const whole = r.cutPaths?.length ? r.cutPaths : r.paths ?? [];
    const l = this.layers[n - 1];
    if (l?.role) return l.role === 'cut' ? [...whole, ...(r.holes ?? [])] : r.paths ?? [];
    return this.build === 'stacked' || n === 1 ? whole : r.paths ?? [];
  }
  /**
   * What a layer becomes on the machine, in mm. One piece (stacked art): its sheet at the craft's real size, in the
   * photo's place. Separate items (bookmarks): each item on its own sheet, turned upright (its long axis vertical),
   * its engraving turned with it; `turn` is how far it was turned.
   */
  pieceFor(n: number): { shapes: Pt[][]; sheetMm: [number, number]; d: string; turn: number } {
    const l = this.layers[n - 1];
    const planned = l?.planSheet !== undefined ? this.plan[l.planSheet] : undefined;
    if (planned) { const shapes = (l.role === 'engrave' ? planned.engrave : planned.cut) as Pt[][]; return { shapes, sheetMm: planned.sizeMm, d: sheetD(shapes, planned.sizeMm), turn: 0 }; }
    const own = toMm(this.sheetPointsFor(n), this.widthMm, this.aspect);
    if (!l?.itemName || !this.layers.some((x) => x.itemName && x.itemName !== l.itemName)) {
      const size: [number, number] = [Math.round(this.widthMm), Math.round(this.widthMm / (this.aspect || 1))];
      return { shapes: own, sheetMm: size, d: sheetD(own, size), turn: 0 };
    }
    const ref = this.layers.find((x) => x.itemName === l.itemName && x.role === 'cut') ?? l;
    const refShapes = ref.n === n ? own : toMm(this.sheetPointsFor(ref.n), this.widthMm, this.aspect);
    if (!refShapes.length || !own.length) return { shapes: own, sheetMm: [10, 10], d: '', turn: 0 };
    const { turn, centre } = uprightTurn(refShapes);
    const frame = layOut(refShapes, turn, centre);
    const out = ref.n === n ? frame : layOut(own, turn, centre, frame.frame);
    return { shapes: out.shapes, sheetMm: frame.size, d: sheetD(out.shapes, frame.size), turn };
  }
  /** separate items are laid out each on its own sheet, straightened */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- counted once, not reactive state
  get separateItems() { return new Set(this.layers.map((l) => l.itemName).filter(Boolean)).size > 1; }
  /** the sheet a layer is cut (or engraved) from, as one SVG path */
  cutPathFor(n: number): string { return this.sheetPointsFor(n).map(pointsToPath).join(''); }
  /** the virtual run of one pass: the board's colour, its cut outline, the engraving on it, and which pass this is */
  previewFor(n: number): { colour: string; cut: string; engrave: string; mode: 'cut' | 'engrave' } {
    const l = this.layers[n - 1];
    if (!l) return { colour: '#888888', cut: '', engrave: '', mode: 'cut' };
    const d = (m: number) => this.regionForLayer(this.layers[m - 1])?.paths?.map(pointsToPath).join('') ?? '';
    const mode = this.opFor(n);
    if (l.role) {
      // a separate item: its cut layer is the board; its engraving layer is engraved into it first
      const same = this.layers.filter((x) => x.itemName === l.itemName);
      const board = same.find((x) => x.role === 'cut') ?? l, mark = same.find((x) => x.role === 'engrave');
      return { colour: board.colour, cut: this.cutPathFor(board.n), engrave: mark ? d(mark.n) : '', mode };
    }
    if (this.build === 'engrave') {
      // one board: every inner layer is engraved into the backing, then its outline is cut
      const engraved = this.layers.filter((x) => x.n > 1 && (mode === 'cut' || x.n <= n)).map((x) => d(x.n)).join('');
      return { colour: this.layers[0].colour, cut: this.cutPathFor(1), engrave: engraved, mode };
    }
    return { colour: l.colour, cut: this.cutPathFor(n), engrave: '', mode: 'cut' };
  }
  /** the order the device works through the layers: engraving first, then the cut (Engrave + cut); else back to front */
  get passOrder(): number[] {
    const ns = this.layers.map((l) => l.n);
    if (this.layers.some((l) => l.role)) return [...ns.filter((n) => this.opFor(n) === 'engrave'), ...ns.filter((n) => this.opFor(n) === 'cut')];
    return this.build === 'engrave' ? [...ns.slice(1), ...ns.slice(0, 1)] : ns;
  }
  // ── Real size: a photo has no scale. Spark estimates the piece's real size; code maps the photo to mm with it.
  /** the photo's width / height (paths are 0-1000 on each axis, so mm needs the photo's shape) */
  aspect = $state(1);
  /** how wide the whole photo is in mm (calibrated from the estimate; the user scales it, aspect kept) */
  widthMm = $state(300);
  /** what the estimate was based on ("a typical bookmark") */
  sizeBasis = $state('');
  private boundsOf(paths: [number, number][][]) {
    const pts = paths.flat(); if (!pts.length) return null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  }
  /** 0-1000 photo units → mm on each axis */
  get mmPerUnit() { return { x: this.widthMm / 1000, y: this.widthMm / this.aspect / 1000 }; }
  private sizeOf(paths: [number, number][][]) {
    const b = this.boundsOf(paths); if (!b) return null;
    return { wMm: Math.round((b.x2 - b.x1) * this.mmPerUnit.x), hMm: Math.round((b.y2 - b.y1) * this.mmPerUnit.y) };
  }
  /** an item's size on the material (its layers' outlines) */
  itemSize(name: string): { wMm: number; hMm: number } | null {
    // separate items are measured as cut: straightened, on their own sheet (less the sheet's 5 mm margin)
    const cut = this.separateItems ? this.layers.find((l) => l.itemName === name && l.role !== 'engrave') : undefined;
    if (cut) { const [w, h] = this.pieceFor(cut.n).sheetMm; if (w > 10 && h > 10) return { wMm: Math.round(w - 10), hMm: Math.round(h - 10) }; }
    return this.sizeOf(this.layers.filter((l) => (l.itemName ?? this.subject) === name).flatMap((l) => this.regionForLayer(l)?.paths ?? []));
  }
  /** the whole piece's size (the background-removed outline, else every layer) */
  get pieceSize() { return this.sizeOf(this.subjectPaths.length ? this.subjectPaths : this.layers.flatMap((l) => this.regionForLayer(l)?.paths ?? [])); }
  /** fit the photo to a real size: the piece (or, for separate items, the typical item) is `w × h` mm */
  calibrate(real: { w: number; h: number; basis?: string }, paths: [number, number][][], aspect = this.aspect) {
    this.aspect = aspect > 0 ? aspect : 1;
    const b = this.boundsOf(paths); if (!b) return;
    const fw = (b.x2 - b.x1) / 1000, fh = (b.y2 - b.y1) / 1000 / this.aspect; // fractions of the photo's width
    const width = real.w >= real.h ? (fw > 0 ? real.w / fw : 0) : (fh > 0 ? real.h / fh : 0);
    if (width > 0) this.widthMm = Math.round(width);
    if (real.basis !== undefined) this.sizeBasis = real.basis;
  }
  /** scale the piece to `mm` wide (or tall), keeping its proportions */
  scaleTo(mm: number, side: 'w' | 'h' = 'w') {
    const now = this.pieceSize; if (!now || mm <= 0) return;
    const cur = side === 'w' ? now.wMm : now.hMm; if (!cur) return;
    this.widthMm = Math.max(10, Math.round((this.widthMm * mm) / cur));
    this.sheetPaths = [];
  }
  get data() { return layerSets[this.set]; }
  get layers() { return this.stack; }
  get structural() { return this.data.structural; }
  get selected(): Layer { return this.layers[Math.min(this.sel, this.layers.length) - 1] ?? { n: 0, name: 'No layers yet', shapes: [], colour: '#888888', visiblePct: 0, hiddenPct: 0, material: '' }; }
  get depthMm() { return (this.selected.n * this.data.mmPerLayer).toFixed(1); }
  setSet(s: LayerSetId) { this.set = s; this.overrides = {}; }
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
  mergeDown(n: number) { if (this.canMergeDown(n)) this.mergeLayers(n, n + 1); }
  /** two layers become one, where the front one of them sits; their masks are joined (split brings them back) */
  canMerge(a: number, b: number) { return a !== b && a >= 1 && b >= 1 && a <= this.stack.length && b <= this.stack.length; }
  mergeLayers(a: number, b: number) {
    if (!this.canMerge(a, b)) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const back = this.stack[lo - 1], front = this.stack[hi - 1];
    const ra = this.regionForLayer(back), rb = this.regionForLayer(front);
    const round = (x: number) => Math.round(x * 10) / 10;
    let regionId: string | undefined;
    if (ra?.paths?.length && rb?.paths?.length) {
      regionId = `m-${ra.id}-${rb.id}`;
      const merged = { ...rb, id: regionId as RegionId, name: `${ra.name} + ${rb.name}`, pct: round(ra.pct + rb.pct), paths: unionPaths(ra.paths, rb.paths, 480),
        cutPaths: unionPaths(ra.cutPaths ?? ra.paths, rb.cutPaths ?? rb.paths, 480), hiddenPct: Math.min(ra.hiddenPct ?? 0, rb.hiddenPct ?? 0), keep: true };
      this.regionList = [...this.regionList.filter((r) => r.id !== regionId), merged];
      this.keep = { ...this.keep, [regionId]: true } as Record<RegionId, boolean>;
    }
    const layer: Layer = { n: hi, name: `${back.name} + ${front.name}`, shapes: [...back.shapes, ...front.shapes], colour: front.colour, material: front.material,
      visiblePct: round(back.visiblePct + front.visiblePct), hiddenPct: round(Math.min(back.hiddenPct, front.hiddenPct)), parts: [...(back.parts ?? [back]), ...(front.parts ?? [front])],
      ...(regionId ? { regionId } : {}),
      // one item's parts stay that item's; parts of different items become one sheet laid out as in the photo
      ...(front.itemName && back.itemName === front.itemName ? { itemName: front.itemName } : {}),
      ...(front.role && back.role === front.role ? { role: front.role } : {}) };
    const next = this.stack.filter((l) => l.n !== lo && l.n !== hi);
    next.splice(hi - 2, 0, layer);
    this.stack = next.map((l, i) => ({ ...l, n: i + 1 }));
    this.sel = hi - 1; this.overrides = {}; this.hiddenLayers = [];
  }
  // ── Undo: every edit to the stack or a layer's mask is checkpointed first (kept with the session, last 30)
  history = $state<{ label: string; at: Record<string, unknown> }[]>([]);
  private static readonly UNDOABLE = ['stack', 'regionList', 'keep', 'sheetPaths', 'overrides', 'hiddenLayers', 'sel', 'plan', 'view'] as const;
  /** remember the craft as it is now, before `label` changes it */
  /** how the cut plan lays parts on sheets (design/15 §5): one per sheet, pairs together, fit to board, as the kit draws it */
  cutLayout = $state<import('../domain/cutplan/types').CutProfile['layout']>('one-part-per-sheet');
  /** told about every edit just before it lands (the app records it in the craft's history) */
  onEdit: ((label: string) => void) | null = null;
  checkpoint(label: string) {
    this.onEdit?.(label);
    const at = Object.fromEntries(LayerFlowState.UNDOABLE.map((k) => [k, $state.snapshot(this[k])]));
    this.history = [...this.history.slice(-29), { label, at }];
  }
  get canUndo() { return this.history.length > 0; }
  /** put back what the last edit changed; returns what was undone */
  undo(): string | null {
    const last = this.history.at(-1);
    if (!last) return null;
    this.history = this.history.slice(0, -1);
    const self = this as unknown as Record<string, unknown>;
    for (const k of LayerFlowState.UNDOABLE) if (k in last.at) self[k] = last.at[k];
    return last.label;
  }
  /** several layers become one (merged into the frontmost of them), optionally renamed */
  mergeMany(ns: number[], name?: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a one-off de-duplication, not reactive state
    const list = [...new Set(ns)].filter((n) => this.stack[n - 1]).sort((a, b) => a - b);
    if (list.length < 2) return 0;
    // merge from the front: each merge leaves the result where the front one was, one place further back
    let into = list[list.length - 1];
    for (let i = list.length - 2; i >= 0; i--) { this.mergeLayers(list[i], into); into -= 1; }
    if (name) this.stack = this.stack.map((l) => (l.n === into ? { ...l, name } : l));
    this.sel = into; this.sheetPaths = [];
    return list.length;
  }
  /** take layers out of the craft (their masks stay with the photo; nothing else moves) */
  removeLayers(ns: number[]) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a one-off lookup, not reactive state
    const drop = new Set(ns);
    if (!drop.size) return 0;
    const before = this.stack.length;
    this.stack = this.stack.filter((l) => !drop.has(l.n)).map((l, i) => ({ ...l, n: i + 1 }));
    this.sel = Math.min(this.sel, this.stack.length) || 1; this.overrides = {}; this.hiddenLayers = []; this.sheetPaths = [];
    return before - this.stack.length;
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

  // Layers work area · the tools (what a drag on the photo does) and the selected area
  tool = $state<'pick' | 'area' | 'move' | 'line' | 'circle'>('pick');
  setTool(t: 'pick' | 'area' | 'move' | 'line' | 'circle') { this.tool = t; if (t !== 'area') this.area = null; }
  /** drawn shapes add to the layer, or cut out of it */
  drawMode = $state<'add' | 'erase'>('add');
  setDrawMode(m: 'add' | 'erase') { this.drawMode = m; }
  /** line width for the line tool, in 0-1000 image units */
  strokeWidth = $state(12);
  setStrokeWidth(w: number) { this.strokeWidth = Math.max(2, Math.min(60, Math.round(w))); }
  /** the area picked with the area tool (smooth / reduce jitter apply inside it) */
  area = $state<Box | null>(null);
  setArea(b: Box | null) { this.area = b && Math.abs(b.x2 - b.x1) > 4 && Math.abs(b.y2 - b.y1) > 4 ? { x1: Math.min(b.x1, b.x2), y1: Math.min(b.y1, b.y2), x2: Math.max(b.x1, b.x2), y2: Math.max(b.y1, b.y2) } : null; }
  /** the front-most visible layer under a point of the photo (pick tool) */
  layerAt(x: number, y: number): number | null {
    for (const l of [...this.layers].reverse()) { if (!this.isLayerVisible(l.n)) continue; const r = this.regionForLayer(l); if (r?.paths?.length && pointInPaths(r.paths, x, y)) return l.n; }
    return null;
  }
  /** the craft's items with their layers: separate items (bookmarks) each own theirs; one stacked piece owns them all */
  get items(): { name: string; layers: Layer[] }[] {
    const named = this.layers.filter((l) => l.itemName);
    if (!named.length) return this.layers.length ? [{ name: this.subject || 'Your picture', layers: this.layers }] : [];
    const groups: { name: string; layers: Layer[] }[] = [];
    for (const l of this.layers) { const k = l.itemName ?? this.subject; const g = groups.find((x) => x.name === k); if (g) g.layers.push(l); else groups.push({ name: k, layers: [l] }); }
    return groups;
  }

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
  get materialPct() { return this.gapCards.length ? Math.round(this.gapCards.reduce((a, l) => a + (l.solid ? 100 : l.visiblePct + 4), 0) / this.gapCards.length) : 0; }
  setGapRule(r: GapRule) { this.gapRule = r; this.overrides = {}; }
  toggleSolid(n: number) { const card = this.gapCards.find((c) => c.n === n); if (card) this.overrides = { ...this.overrides, [n]: !card.solid }; }

  // S5b · the views of a 3D object: any number of pictures, sorted by Muse (which side each shows)
  done = $state<ViewId[]>(['front', 'right', 'back']);
  pictures = $state<import('../domain/views').PictureRole[]>([]);
  /** Muse's sort of the pictures: the sides it saw become the views (a ¾ view stands in for a side not seen) */
  applyPictures(list: import('../domain/views').PictureRole[]) {
    this.pictures = list;
    const sides = ['front', 'right', 'back', 'left', 'top', 'base'] as const;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, not reactive state
    const seen = new Set<ViewId>(list.filter((p) => p.kind === 'view' && (sides as readonly string[]).includes(p.angle)).map((p) => p.angle as ViewId));
    for (const p of list) if (p.kind === 'view' && p.angle === 'three-quarter') { const free = (['front', 'right', 'left', 'back'] as ViewId[]).find((a) => !seen.has(a)); if (free) seen.add(free); }
    this.done = sides.filter((s) => seen.has(s)) as ViewId[];
  }
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
  /** what kind of machine cuts it: a blade cutter (paper, card, vinyl) or a laser (wood, acrylic) */
  get machine(): 'paper' | 'laser' { return this.device === 'xtool' || this.device === 'glowforge' ? 'laser' : 'paper'; }
  setDevice(d: DeviceId) { this.device = d; this.job = { sheet: 1, phase: 'feed', progress: 0 }; }

  // output · cutters take one sheet at a time: feed the sheet's material, send, watch it cut, verify, next
  job = $state<{ sheet: number; phase: 'feed' | 'cutting' | 'verify' | 'done'; progress: number }>({ sheet: 1, phase: 'feed', progress: 0 });
  get jobLayer(): Layer { const n = this.passOrder[Math.min(this.job.sheet, this.layers.length) - 1]; return this.layers[(n ?? 1) - 1] ?? this.selected; }
  get feedText() { return `Feed ${this.jobLayer.material}`; }
  sheetStatus(n: number): 'cut' | 'current' | 'waiting' {
    const at = this.passOrder.indexOf(n) + 1 || n;
    if (this.job.phase === 'done' || at < this.job.sheet) return 'cut';
    return at === this.job.sheet ? 'current' : 'waiting';
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
  private static readonly SAVED = ['cutLayout', 'removeBackdrop', 'layerPlan', 'subject', 'imageBrief', 'outline', 'cutoutChecks', 'regionList', 'parts', 'notes', 'assembleAt', 'assembled', 'kind', 'brief', 'makeAs', 'cutoutView', 'keep', 'segmentView', 'refineTool', 'set', 'stack', 'sel', 'gapChoice', 'applyAll', 'gapRule', 'overrides', 'done', 'joinery', 'skipped', 'device', 'showSolid', 'showHidden', 'job', 'sheetPaths', 'subjectPaths', 'hiddenLayers', 'showStack', 'view', 'build', 'aspect', 'widthMm', 'sizeBasis', 'pictures', 'objectSpec', 'plan'] as const;
  /** a fresh flow's choices (New starts from these) */
  static defaults() { return new LayerFlowState().snapshot(); }
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(LayerFlowState.SAVED.map((k) => [k, $state.snapshot(this[k])]));
  }
  restore(saved: Record<string, unknown>) {
    const self = this as unknown as Record<string, unknown>;
    for (const k of LayerFlowState.SAVED) if (k in saved) self[k] = saved[k];
    this.history = [];
    // crafts saved before names were cleaned: drop a model's own "Layer 4 -" numbering
    if (this.stack.some((l) => cleanLayerName(l.name) !== l.name)) this.stack = this.stack.map((l) => ({ ...l, name: cleanLayerName(l.name) }));
  }
}
