import { vibe } from '@rokkit/states';
import { FlowState } from './flow.svelte';
import type { ChatAction, ModelCall, Quote, StepEntry } from './conversation.svelte';
import type { Snippet } from 'svelte';
import { devices, guide, steps, type DeviceId, type StepId } from '../content/layers';
import { journey, journeyIndexOf, journeyStepFor, starts, type Start, type StartId } from '../content/journey';
import { assemblySteps, type AssemblyStep } from '../domain/assembly';
import { agentJobs, jobsOnVisit } from '../content/agents';
import { MuseAgents } from './muse.svelte';
import { getCraftData, getMedia, putCraftData, putMedia, removeCraftData, removeMedia } from './media-store';

/** results too large for the localStorage craft list: kept per craft in IndexedDB */
const HEAVY = ['regionList', 'subjectPaths', 'sheetPaths', 'objectSpec', 'plan'] as const;
import { downscale } from './photo';
import { namesAStack, parseLayerOp, stackPlanFrom, translatePaths, type Box, type DrawnShape, type LayerOp } from '../domain/layering';
import { pointsToPath } from '../domain/vector';
import { hiddenShare } from '../domain/toolpath';
import { CraftState, emptyCraft } from './craft/craft.svelte';
import { setsOf } from '../domain/actions/defs/samesize';
import { ActionState, type Narrator, type Outcome } from './craft/actions.svelte';
import { migrateV1, type V1Snapshot } from '../domain/craft/migrate';
import { craftToFlow } from '../domain/craft/bridge';
import { rowsOf, type CraftDoc } from '../domain/craft';
import { fastPath, refsFromPlan, toolList, type Said } from '../domain/actions/chat';
import type { ActionCtx, ActionId } from '../domain/actions/types';
import { planCut } from '../domain/cutplan/plan';
import { profileFor } from '../domain/cutplan/profiles';
import { toQueueInput } from '../domain/cutplan/queue';
import type { CutPlan, CutProfile } from '../domain/cutplan/types';
import { planZip, sheetFile } from '../domain/files/bundle';
import { svgToCraft } from '../domain/files/svg';
import { loadPixels } from './photo';

/** what the layer toolbar asks for; every one is said in the chat first, then applied */
export type LayerAction =
  | { kind: 'hide' } | { kind: 'show' } | { kind: 'only' } | { kind: 'duplicate' } | { kind: 'merge' } | { kind: 'mergeWith'; other: number } | { kind: 'split' }
  | { kind: 'tune'; detail: number; weight: number } | { kind: 'shape'; shape: DrawnShape; mode: 'add' | 'erase' }
  | { kind: 'smoothArea'; box: Box; strength: number } | { kind: 'move'; dx: number; dy: number } | { kind: 'remove' };

/** the words that mean an action (merge, delete, flip…): what is worth asking the planner about */
const ACTION_WORDS = /\b(merge|delete|remove|combine|join|duplicate|copy|copies|straighten|rotate|turn|flip|mirror|resize|enhance|sharpen|fill in|interpolate|group|pair|rename|recolou?r|engrave instead|again|same for|bring|send|undo|redo|smooth(en)?|simplify|split|weld|bridge|offset|align|distribute|hole)\b/i;
/** more than one action in one ask ("merge layers 1 and 2 and then smooth it"): Spark plans it as one undo */
const manyActions = (text: string) => /\b(and then|then|after that|afterwards)\b/i.test(text) || new Set((text.match(new RegExp(ACTION_WORDS.source, 'gi')) ?? []).map((v) => v.toLowerCase())).size >= 2;
/** "remove the background", "get rid of the textured wall", "no shadows"… — the user wants the backdrop gone */
export const BACKDROP_ASK = /\b(remove|drop|delete|erase|clear|get rid of|cut out|without|no|lose)\b[^.]*\b(background|backdrop|wall|shadows?|plants?|shelf|surroundings)\b|\b(background|backdrop|wall)\b[^.]*\b(removed|gone|out|needs to go|should go)\b/i;

type FlowPage = StepId | 'views' | 'reference';

/** How a layered piece is built, as said in the chat */
const BUILD_TEXT = {
  stacked: { said: 'Build it as stacked layers', title: 'Stacked layers on a solid backing', detail: 'Each layer includes the ones in front of it; the back layer is the whole outline in the back colour.' },
  inlay: { said: 'Build it as separate pieces', title: 'Separate pieces on a backing', detail: 'Each colour is its own piece and they fit together like a puzzle on the back layer (the whole outline).' },
  engrave: { said: 'Engrave the colours, then cut the outline', title: 'Engrave + cut on one board', detail: 'The inner layers are engraved first, then the outline is cut — one sheet of wood.' }
} as const;
/** the build a photo suggests: shadows or a layered look mean stacked; a flat wood piece is engraved and cut */
export function buildFor(brief: import('../domain/schemas').ImageBrief | null): import('./layer-flow.svelte').Build {
  if (!brief) return 'stacked';
  if (brief.class === 'layered' || /shadow|depth|raised|stack/i.test(brief.notes ?? '')) return 'stacked';
  if (brief.likelyMaterial === 'wood') return 'engrave';
  return 'inlay';
}
const flowPath = (id: FlowPage) => `/make/${id}`;
const browserStore = () => new ProjectStore(typeof globalThis.localStorage?.getItem === 'function' ? globalThis.localStorage : undefined);

const WORKSHOP_CHIPS = ['A layered mountain picture', 'A birdhouse from six photos', 'Remix it with a moon'];
const DEVICE_KEY = 'katachi.device';
const USAGE_KEY = 'katachi.usage';
const QUEUE_KEY = 'katachi.queue';
import { WatchState } from './watch.svelte';
import { UsageLedger } from './usage.svelte';
import { QueueState } from './queue.svelte';
import { BatchState } from './batch.svelte';
import { CaptureState, thumbnail } from './capture.svelte';
import { SessionState } from './session.svelte';
import { LayerFlowState } from './layer-flow.svelte';
import { ProjectStore, projectName, type ProjectRecord } from './project.svelte';
import { EditorState } from './editor.svelte';

// One per app, created by routes/+layout.svelte and read by every page through useApp(),
// so section state (and the session's cost trace) survives navigation.
export class AppState {
  session = new SessionState();
  flow = new FlowState();
  watch = new WatchState();
  batch = new BatchState();
  capture = $state(new CaptureState());
  layers = new LayerFlowState();
  editor = new EditorState();
  /** every model call for this user, kept in localStorage (cost per craft, breakdown by model) */
  usage!: UsageLedger;
  /** the cut queue: sheets from any craft, cut one at a time with a person feeding each sheet */
  queue!: QueueState;
  /** every Meta model / agent job of the craft journey runs through here (placeholders until wired) */
  muse = new MuseAgents();
  chatOpen = $state(true);
  propsOpen = $state(false);
  screen = $state({ title: 'Workshop', subtitle: '' });

  // ── Projects: New → capture → the make flow → cuts. Named by the first step, saved as you go, reopened from Open.
  project = $state<ProjectRecord | null>(null);
  projects = $state<ProjectRecord[]>([]);
  constructor(private store: ProjectStore = browserStore()) {
    this.projects = store.list();
    this.usage = new UsageLedger(() => store.getSetting(USAGE_KEY), (v) => store.setSetting(USAGE_KEY, v));
    this.queue = new QueueState(() => store.getSetting(QUEUE_KEY), (v) => store.setSetting(QUEUE_KEY, v));
    // every call is kept for this user (cost + breakdown by model survive reloads) and shown in the chat
    this.flow.trace.onAdd = (e) => {
      this.usage.add({ craftId: this.project?.id ?? null, model: e.model, action: e.purpose.replace(/_/g, ' '), costUsd: e.costUsd, ms: e.latencyMs, status: 'live' });
      this.flow.conversation.logCall({ model: e.model, action: e.purpose.replace(/_/g, ' '), costUsd: e.costUsd, ms: e.latencyMs, status: 'live' });
    };
    // every edit lands in the craft's one history (design/14): native actions record themselves; the older edits
    // (mask corrections, splits, moves) are recorded right after they land
    this.actions = new ActionState(this.craft, () => this.actionCtx(), this.narrator());
    this.layers.onEdit = (label) => { if (this.engineOn) queueMicrotask(() => this.syncCraft(label)); };
    this.muse.onFinish = (t) => {
      const call = { model: t.model ?? agentJobs[t.job].model, action: t.summary, costUsd: t.costUsd ?? 0, ms: t.ms ?? 0, status: (t.status === 'failed' ? 'failed' : t.status === 'done' ? 'live' : 'placeholder') as 'live' | 'placeholder' | 'failed' };
      this.usage.add({ craftId: t.craftId, ...call });
      if (t.craftId === this.project?.id) this.flow.conversation.logCall(call, t.job);
    };
    const d = store.getSetting(DEVICE_KEY) as DeviceId | null;
    if (d) this.defaultDevice = d;
    const id = store.current();
    const saved = id ? store.load(id) : null;
    if (saved) this.apply(saved);
  }
  // ── The craft (design/15) and its actions (design/14). Until every screen reads the craft (task L3), the craft is
  // kept in step with LayerFlowState both ways: read from it after analysis, written back after every action.
  readonly craft = new CraftState();
  private savedRev = -1;
  private lastCraftDoc: CraftDoc | null = null;
  readonly actions!: ActionState;
  private narrated = 0;
  /** the engine runs edits for one-piece art and separate items (kits keep the older path until L3) */
  get engineOn() { return this.craft.doc.items.length > 0 && this.craft.doc.kind !== '3d' && !this.layers.plan.length; }
  private actionCtx(): ActionCtx {
    return { newId: () => `a${Date.now().toString(36)}${(this.narrated++).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      pixels: (_source, max) => loadPixels(this.photo, max ?? 1600),
      muse: { segmentCrop: (img, prompt) => this.muse.segmentCrop(img, prompt) } };
  }
  private narrator(): Narrator {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered
    const c = () => this.flow.conversation, keys = new Map<string, string>();
    const k = (key: string) => keys.get(key) ?? (() => { const u = `${this.project?.id ?? 'craft'}:${key}:${c().log.length}:${this.narrated++}`; keys.set(key, u); return u; })();
    return {
      // one step per request: a group's later actions update its step, never open new ones
      think: (key, title) => { const u = keys.get(key) ?? `${this.project?.id ?? 'craft'}:${key}:${c().log.length}:${this.narrated++}`; keys.set(key, u); c().think(u, title); c().work(u); },
      done: (key, title, detail) => { c().done(k(key), title, detail ? { detail } : {}); keys.delete(key); },
      fail: (key, title, detail) => { c().fail(k(key), title, detail ?? ''); keys.delete(key); }
    };
  }
  /** read the craft from what the screens hold now; `label` records the change as one undoable step */
  syncCraft(label?: string, { fresh = false } = {}) {
    const p = this.project;
    if (!p) return;
    // an imported file is exact: the craft is its own source, never re-read from the photo-based state
    if (this.craft.doc.id === p.id && this.craft.doc.sources.some((s) => s.id === 'svg-import')) return;
    // only what the craft is read from (a whole snapshot copies every traced path, sheet and cutout too)
    const f = this.layers;
    const snap = { subject: f.subject, build: f.build, aspect: f.aspect, widthMm: f.widthMm, sizeBasis: f.sizeBasis, stack: $state.snapshot(f.stack), regionList: $state.snapshot(f.regionList), plan: $state.snapshot(f.plan) } as unknown as V1Snapshot;
    const next: CraftDoc = migrateV1({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, kind: p.kind }, snap, () => `s${(this.narrated++).toString(36)}`);
    const cur = this.craft.doc.id === p.id && !fresh ? this.craft.toJSON() : null;
    // what only the craft knows (a turn, a flip, how many, the model's call) stays when the screens' state is re-read
    if (cur) for (const it of next.items) { const was = cur.items.find((x) => x.id === it.id); if (was) { it.frame = { ...it.frame, fromSource: { ...it.frame.fromSource, rotateDeg: was.frame.fromSource.rotateDeg }, ...(was.frame.flipX ? { flipX: true } : {}), ...(was.frame.flipY ? { flipY: true } : {}) }; if (was.qty) it.qty = was.qty; if (was.needsEnhance) it.needsEnhance = was.needsEnhance; if (was.shot) it.shot = was.shot; } }
    if (cur && label) { this.actions.adopt({ ...next, groups: cur.groups.length ? cur.groups : next.groups }, label); return; }
    this.craft.load({ ...next, history: cur?.history ?? { done: [], undone: [] }, rev: cur?.rev ?? 0 });
  }
  /** after an action: the screens' state is written from the craft */
  private writeBack() {
    if (!this.engineOn) return;
    const f = this.layers, v = craftToFlow(this.craft.doc);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered
    const used = new Set(f.stack.map((l) => l.regionId));
    f.regionList = [...f.regionList.filter((r) => !used.has(r.id) && !r.id.startsWith('p:')), ...(v.regionList as unknown as typeof f.regionList)];
    f.stack = v.stack as unknown as typeof f.stack;
    f.sel = Math.min(Math.max(1, f.sel), f.stack.length) || 1;
    f.sheetPaths = []; f.overrides = {}; f.hiddenLayers = [];
    this.save();
  }
  /** the screen's selected row, for "this layer" */
  private selectRow(n = this.layers.selected.n) { const r = rowsOf(this.craft.doc)[n - 1]; this.actions.selected = r ? [r.op?.id ?? r.part.id] : []; }
  /** run calls through the actions, then write the result back for the screens */
  async act(action: ActionId, refs: Parameters<ActionState['perform']>[1], opts: Record<string, unknown> = {}, via: 'chat' | 'button' | 'pass' = 'button'): Promise<Outcome> {
    this.selectRow();
    const r = await this.actions.perform(action, refs, opts, via);
    if (r.ok) this.writeBack();
    return r;
  }
  /** what the chat said, as the actions read it (undo / redo / again / calls) */
  private async runSaid(said: Said) {
    if (said.kind === 'undo') { this.undoLast({ echo: false }); return; }
    if (said.kind === 'redo') { this.redoLast(); return; }
    this.selectRow();
    const r = said.kind === 'again' ? await this.actions.again(said.refs) : await this.actions.performAll(said.calls, 'chat');
    if (r.ok) this.writeBack();
    // straightened items are seen on their own sheets
    if (r.ok && said.kind === 'calls' && said.calls.some((c) => c.action === 'straighten') && this.layers.separateItems) { this.layers.setView('cut'); this.save(); }
  }
  redoLast() { if (this.actions.redo()) this.writeBack(); }
  /** can this row be split (the engine's split: a merged layer, or one with separate pieces) */
  canSplit(n: number) {
    if (!this.engineOn) return this.layers.canSplit(n);
    // cheap (it is read on every render): a merged part, or a cut with more than one loop; the action itself checks
    // properly when pressed and says "one piece" if it is
    const r = rowsOf(this.craft.doc)[n - 1];
    return Boolean(r && !r.op && (r.part.from?.length || (r.part.ops.find((o) => o.kind === 'cut')?.geometry.paths.length ?? 0) > 1));
  }
  /** The clean-up pass after the layers (and whenever asked): specks, pin-holes and wire bits (an earring's hook, a
   *  bookmark's cord) off; repeated holes evened out; near-symmetric items made symmetric; every layer smoothed in
   *  two light passes. One step in the chat, one undo. */
  async cleanUp(via: 'pass' | 'chat' = 'pass') {
    const rows = rowsOf(this.craft.doc); if (!rows.length) return;
    const parts = rows.filter((r) => !r.op);
    const r = await this.actions.performAll([
      // wire bits (hooks, cords) only hang off separate items; a one-piece picture's outline is left as traced
      { action: 'tidy', refs: [{ all: true }], opts: this.layers.separateItems ? {} : { thinMm: 0 } },
      { action: 'repeat-pattern', refs: [{ all: true }], opts: {} },
      ...(this.layers.separateItems ? [{ action: 'symmetrize' as ActionId, refs: [{ all: true as const }], opts: {} }] : []),
      ...parts.map((p) => ({ action: 'smooth' as ActionId, refs: [{ n: p.n }], opts: { strength: 4, passes: 2 } }))
    ], via, `Cleaned up ${parts.length} layer${parts.length === 1 ? '' : 's'}: specks and wire bits off, repeated holes evened out${this.layers.separateItems ? ', symmetric items made exact' : ''}, outlines smoothed`);
    if (r.ok) this.writeBack();
  }
  /** Spark reads the request into action calls (design/14 §7); false = nothing it could plan. Besides the craft's
   *  actions it can re-run a stage of the breakdown ("try again splitting into 5 bookmarks"): find the items, remove
   *  the background, regroup the colours. Those run first; the craft's actions run on what they produce. */
  private async planAndRun(text: string): Promise<boolean | { reply: string }> {
    const craft = this.project?.id; if (!craft) return false;
    const rows = rowsOf(this.craft.doc), c = this.flow.conversation, f = this.layers;
    const stages = [
      ...(this.photo && f.imageBrief?.arrangement === 'multiple-items' ? [{ id: 'find-items', hint: 'Find the separate items in the photo again with SAM 3.1 (when items were missed, merged or cut short), then rebuild their layers, turn each upright, fill hidden edges and clean up.', options: 'count (how many items the user expects)' }] : []),
      ...(this.photo ? [{ id: 'remove-background', hint: 'Remove the background again, harder (the wall, its texture and shadows), and rebuild the layers.', options: '' }] : []),
      ...(this.photo && f.imageBrief && f.imageBrief.arrangement !== 'multiple-items' ? [{ id: 'regroup-colours', hint: 'Regroup a one-piece picture into a number of colour layers.', options: 'k 2–8' }] : []),
      ...(this.photo && f.imageBrief && f.imageBrief.arrangement !== 'multiple-items' ? [{ id: 'restack', hint: 'Rebuild a one-piece picture to the layer stack the user describes, back to front: each layer a colour (the same colour may come twice, e.g. a white backer and white petals), optionally a solid sheet; with outline every layer keeps the outer border.', options: 'layers: [{name, colour (a colour word), solid?}] back to front (2–8); outline: true|false (default true)' }] : [])
    ];
    if (rows.length) stages.push({ id: 'clean-up', hint: 'The whole clean-up pass on every layer: specks, pin-holes and wire bits (hooks, cords) off, repeated holes evened out, near-symmetric items made exact, outlines smoothed.', options: '' });
    const tools = [...stages, ...(rows.length ? toolList() : [])];
    if (!tools.length) return false;
    const a = await this.muse.planActions(craft, { text, layers: rows.map((r) => ({ n: r.n, name: r.name, item: r.item.name, role: r.role, shows: Math.round(r.shows) })), selected: [this.layers.selected.n].filter((n) => n > 0), actions: tools }).catch(() => null);
    if (!a) return false;
    if (a.ask) { c.say(a.ask); return true; }
    if (!a.calls.length) return a.reply ? { reply: a.reply } : false;
    const stage = a.calls.filter((x) => stages.some((t) => t.id === x.action)), edits = a.calls.filter((x) => !stages.some((t) => t.id === x.action));
    if (stage.length) {
      if (a.reply) c.say(a.reply);
      for (const x of stage) {
        if (this.project?.id !== craft) return true;
        if (x.action === 'find-items') {
          this.run++; this.segmentReady = this.runSegment(); this.planReady = this.runPlan(); await Promise.all([this.segmentReady, this.planReady]);
          // the count asked for, said against what was found (SAM finds what is there; it is never padded)
          // eslint-disable-next-line svelte/prefer-svelte-reactivity -- counted once, not reactive state
          const want = Number(x.opts.count) || 0, got = new Set(f.layers.map((l) => l.itemName).filter(Boolean)).size;
          if (want && got && want !== got) c.say(`I found ${got} item${got === 1 ? '' : 's'}, not the ${want} you expected. Say which one is missing or merged (“the fox and the whale are one”), or “find the items again”.`);
        }
        else if (x.action === 'clean-up') await this.cleanUp('chat');
        else if (x.action === 'remove-background') { f.removeBackdrop = true; this.save(); await this.rebuildFromShape(); }
        else if (x.action === 'regroup-colours') { f.layerPlan = null; await this.rebuildFromShape({ k: Math.max(2, Math.min(8, Number(x.opts.k) || 4)) }); }
        else if (x.action === 'restack') {
          const plan = stackPlanFrom(x.opts);
          if (!plan) { c.say('I couldn’t read that stack — name each layer’s colour, back to front (“white base, black, red, white flowers, gold”).'); continue; }
          f.layerPlan = plan; this.save(); await this.rebuildFromShape();
        }
      }
      // a rebuilt breakdown runs its passes itself (upright, hidden edges, clean-up): not twice
      const after = edits.filter((x) => !['straighten', 'interpolate', 'smooth', 'tidy', 'repeat-pattern', 'symmetrize', 'clean-up'].includes(x.action) || !stage.some((y) => y.action !== 'clean-up'));
      if (!after.length || !rowsOf(this.craft.doc).length) return true;
      edits.splice(0, edits.length, ...after);
    }
    if (!edits.length) return true;
    this.selectRow();
    const r = await this.actions.performAll(edits.map((x) => ({ action: x.action as ActionId, refs: refsFromPlan(x.refs), opts: x.opts })), 'chat', stage.length ? undefined : a.reply || undefined);
    if (r.ok) this.writeBack();
    return true;
  }
  /** The invite code is the user_id (demo-grade identity): crafts live under that user's storage namespace. */
  userId = $state('guest');
  bindUser(userId: string | null | undefined) {
    if (!userId || userId === this.userId) return;
    this.userId = userId;
    this.session.userId = userId;
    this.store.setUserId(userId);
    this.usage.reload();
    this.queue.reload();
    this.projects = this.store.list();
    const d = this.store.getSetting(DEVICE_KEY) as DeviceId | null;
    if (d) this.defaultDevice = d;
    const id = this.store.current();
    const saved = id ? this.store.load(id) : null;
    this.project = null;
    if (saved) this.apply(saved);
  }
  private apply(p: ProjectRecord) {
    this.resetChat();
    this.instructions = null;
    this.watch.reset();
    this.capture = new CaptureState();
    this.layers.restore({ ...LayerFlowState.defaults(), ...p.choices });
    this.craft.load(emptyCraft(p.id, p.name));
    // Import, Cutout and Segment are part of Layers now: a craft saved on one of them reopens there
    this.project = /^\/make\/(import|cutout|segment)$/.test(p.path) ? { ...p, path: flowPath('layers'), reached: Math.max(p.reached, steps.findIndex((s) => s.id === 'layers')) } : p;
    // the captured photos and the heavy results (traced paths) come back from IndexedDB; steps wait for them
    this.hydrating = Promise.all([
      getMedia(p.id).then((media) => { if (media.length && this.project?.id === p.id) this.capture.hydrate(media, p.kind === '3d' ? 'multi' : 'single'); }),
      p.choices?.heavyStored ? getCraftData(p.id).then((heavy) => {
        if (!heavy || this.project?.id !== p.id) return;
        const { chat, craftDoc, ...rest } = heavy as Record<string, unknown> & { chat?: import('./conversation.svelte').LogEntry[]; craftDoc?: CraftDoc };
        this.layers.restore(rest);
        // the craft (and its history) as saved; then re-read from the screens' state (stable ids: no change)
        if (craftDoc?.v === 2) this.craft.load(craftDoc);
        this.syncCraft();
        if (Array.isArray(chat)) this.flow.conversation.log = [...chat, ...this.flow.conversation.log];
      }) : Promise.resolve().then(() => { if (this.project?.id === p.id) this.syncCraft(); })
    ]).then(() => undefined);
  }
  /** The best image for the stage views: the in-session capture, else the saved thumbnail. */
  get stageImage() { return this.capture.media[0]?.url || this.project?.image || ''; }
  /** The project's name, or the example subject until something is captured. */
  get title() { return this.project?.name || this.layers.data.project; }
  /** each craft has its own chat: switching crafts (or starting one) starts from its own conversation */
  private resetChat() { this.flow.conversation.log = []; this.guidedSteps = []; this.quote = null; }
  newProject() {
    const now = Date.now();
    this.resetChat();
    this.capture = new CaptureState();
    this.workPhoto = null;
    this.instructions = null;
    this.watch.reset();
    this.layers.restore(LayerFlowState.defaults());
    this.layers.setDevice(this.defaultDevice);
    this.project = { id: crypto.randomUUID(), name: '', createdAt: now, updatedAt: now, reached: -1, kind: 'flat', path: '/capture', image: '', choices: {}, status: 'draft' };
    this.craft.load(emptyCraft(this.project.id, '', now));
  }
  /** Home · a new craft from a starting point (or from what was said or typed): Capture opens set up for it. */
  startCraft(from: StartId | string, { heard = false, say }: { heard?: boolean; /** what the chat opens with instead of the start's own line */ say?: string } = {}): string {
    const picked = starts.find((s) => s.id === from);
    // a new craft starts a new chat: what was said goes into it
    this.newProject();
    if (!heard && !picked) this.flow.conversation.ingestTranscript(from);
    const start: Start = picked ?? this.muse.classifyIntent(from, this.project!.id);
    this.project = { ...this.project!, kind: start.kind };
    this.layers.setKind(start.kind);
    this.capture.setMode(start.mode);
    this.capture.setSource(start.source);
    this.flow.conversation.say(say ?? start.say);
    return '/capture';
  }
  /** The first step: what was captured names the project and opens the flow (six sides go to the six-view step). */
  startFromCapture({ fileName, images, mode, at, prefix, views = [] }: { fileName?: string; images: string[]; mode: 'single' | 'multi'; at?: Date; prefix?: string; /** every picture of an object (JPEG), for Muse to sort */ views?: string[] }) {
    if (!this.project) this.newProject();
    const p = this.project!;
    const kind = mode === 'multi' ? '3d' : p.kind === 'ref' ? 'ref' : 'flat';
    this.layers.setKind(kind);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a one-off timestamp for the name, not reactive state
    const when = at ?? new Date();
    // Analyze goes straight to Layers (the background, items and layers are worked out there, live)
    const from = mode === 'multi' ? 0 : steps.findIndex((s) => s.id === 'layers');
    this.project = { ...p, name: p.name || projectName({ fileName, at: when, prefix }), kind, image: images[0] ?? p.image,
      reached: Math.max(p.reached, from), path: flowPath(mode === 'multi' ? 'views' : kind === 'ref' ? 'reference' : 'layers') };
    this.save();
    const c = this.flow.conversation, look = this.stepKey('look');
    if (mode === 'multi') { this.lookAtViews(p.id, views.length ? views : images); return; }
    c.think(look, 'Looking at your photo', { thought: 'Muse Spark reads what it is, how it is built and what it is made of.', job: 'capture.describe' });
    c.work(look);
    this.briefReady = this.muse.describeCapture(p.id, kind, images[0]).then((r) => {
      if (r.brief) this.layers.applyBrief(r.brief); else this.layers.applySubject(r.subject);
      this.save();
      const b = r.brief;
      if (b && b.arrangement !== 'multiple-items') this.layers.setBuild(buildFor(b));
      // the material picks the kind of machine: paper and card on a blade cutter, wood and acrylic on a laser
      if (b) { const laser = b.likelyMaterial === 'wood' || b.likelyMaterial === 'acrylic'; if (laser !== (this.layers.machine === 'laser')) this.layers.setDevice(laser ? 'xtool' : 'cricut'); }
      const craftType = !b ? '' : b.class === 'composite-3d' || b.arrangement === 'assembly-3d' ? '3D object' : b.class === 'layered' ? 'layered artwork' : 'laser-cut pieces';
      c.done(look, `I see ${r.subject}`, { detail: b ? `${craftType} · ${b.likelyMaterial === 'unknown' ? 'material unclear' : b.likelyMaterial} · ${b.arrangement === 'multiple-items' ? `${b.regions.length || 'several'} separate items` : `one piece, built as ${BUILD_TEXT[this.layers.build].title.toLowerCase()}`}${b.notes ? ` · ${b.notes}` : ''}` : undefined });
    }).catch(() => { c.fail(look, 'Couldn’t read the photo just now', 'I’ll still measure it from its colours.'); });
    if (this.capture.media.some((m) => m.source === 'sketch')) void this.muse.cleanSketch(p.id, images[0]);
  }
  /** the views to stitch: the ones Muse sorted (close-ups and plans are reference only); without them, the slot order */
  private viewImages(image?: string) {
    const f = this.layers;
    const sorted = f.pictures.filter((p) => p.kind === 'view' && p.angle !== 'unknown');
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, not reactive state
    const used = new Set<string>();
    return sorted.length ? sorted.map((p) => {
      const angle = p.angle === 'three-quarter' ? (['front', 'right', 'left', 'back'].find((a) => !sorted.some((x) => x.angle === a) && !used.has(a)) ?? 'front') : p.angle;
      used.add(angle);
      return { view: angle as import('../content/layers').ViewId, url: this.capture.media[p.index - 1]?.url };
    }) : f.views.map((v, i) => ({ view: v.id, url: this.capture.media[i]?.url || (i === 0 ? image : undefined) }));
  }
  /** Several pictures of one object (any number, any order, extras allowed): Muse Spark sorts them — which side
   *  each shows, close-ups and cut plans kept as reference — and estimates the object's real size. */
  private lookAtViews(craft: string, views: string[]) {
    const c = this.flow.conversation, look = this.stepKey('look'), f = this.layers;
    c.think(look, `Looking at your ${views.length} pictures`, { thought: 'Muse Spark works out which side each one shows; close-ups and cut plans are kept as reference.', job: 'capture.describe' });
    c.work(look);
    this.briefReady = this.muse.sortViews(craft, views).then((b) => {
      if (this.project?.id !== craft) return;
      f.applySubject(b.subject);
      f.applyPictures(b.pictures);
      if (b.realSizeMm?.w) { f.outline = { ...f.outline, sizeMm: Math.round(Math.max(b.realSizeMm.w, b.realSizeMm.h, b.realSizeMm.d || 0)) }; f.sizeBasis = b.realSizeMm.basis; }
      this.save();
      const label = (p: (typeof b.pictures)[number]) => p.kind === 'view' ? (p.angle === 'three-quarter' ? '¾ view' : p.angle) : p.kind === 'plan' ? 'cut plan' : p.kind === 'detail' ? 'close-up' : 'other';
      const missing = f.views.filter((v) => !v.ok).map((v) => v.label.toLowerCase());
      c.done(look, `I see ${b.subject}`, { detail: `${b.pictures.map(label).join(' · ')}${b.pictures.some((p) => p.kind !== 'view') ? ' — close-ups and plans are kept as reference' : ''}${missing.length ? ` · not seen: ${missing.join(', ')} (I’ll assume symmetry)` : ''}${b.realSizeMm?.w ? ` · about ${b.realSizeMm.w} × ${b.realSizeMm.h} × ${b.realSizeMm.d} mm (${b.realSizeMm.basis})` : ''}` });
    }).catch(() => { c.fail(look, 'Couldn’t sort the pictures just now', 'Using them in the order you took them.'); });
  }
  /** Home · release the mic: what was heard starts a craft (returns where to go), or nothing was heard. */
  listenToStart(): string | null {
    this.flow.conversation.stopListening();
    const heard = this.flow.conversation.transcript.trim();
    return heard ? this.startCraft(heard, { heard: true }) : null;
  }
  /** Capture's Continue: the captured media start the craft (a small thumbnail is kept for the gallery). */
  async startFromCaptureMedia(fileName?: string) {
    if (!this.project) this.newProject();
    // keep the captured photos (downscaled) with the craft so reopening it shows them on every step
    const media = await Promise.all(this.capture.media.map(async (m) => ({ ...m, url: await downscale(m.url, 1600) })));
    await putMedia(this.project!.id, media);
    // the models get this JPEG copy, never the original upload (Meta accepts JPEG, PNG, GIF, WebP — not AVIF/HEIC)
    this.workPhoto = media[0]?.url ?? null;
    const first = media[0]?.url;
    const sketched = this.capture.media[0]?.source === 'sketch';
    this.startFromCapture({ fileName: fileName ?? this.fileName, images: first ? [await thumbnail(first, 360)] : [], mode: this.capture.mode, prefix: sketched ? 'Sketch' : 'Photo', views: media.map((m) => m.url) });
  }
  /** A step is open once the one before it has been reached; the branch screens once anything is captured. */
  canVisit(id: FlowPage) {
    const reached = this.project?.reached ?? -1;
    if (reached < 0) return false;
    if (id === 'views' || id === 'reference') return true;
    // once the craft has its layers, Preview, Cut and Assemble are open (no walking through every step)
    const at = steps.findIndex((s) => s.id === 'layers');
    if (id === 'gaps' || id === 'output' || id === 'assemble') return Boolean(this.project?.example) || ((reached >= at || this.project?.kind === '3d') && this.layers.layers.length > 0) || steps.findIndex((s) => s.id === id) <= reached;
    return steps.findIndex((s) => s.id === id) <= reached + 1;
  }
  /** The furthest open step (where a blocked visit lands). */
  get resumePath() { return this.project && this.project.reached >= 0 ? this.project.path : '/workshop'; }
  visit(id: FlowPage) {
    if (!this.project || !this.canVisit(id)) return;
    const i = steps.findIndex((s) => s.id === id);
    this.project = { ...this.project, reached: Math.max(this.project.reached, i), path: flowPath(id) };
    this.runJobsFor(id);
  }
  /** The model / agent jobs a step needs, run once per craft when it is first opened. */
  /** a reopened craft's photos and traced results, loading from IndexedDB */
  hydrating: Promise<void> = Promise.resolve();
  private runJobsFor(id: FlowPage) {
    void this.hydrating.then(() => this.runJobsNow(id));
  }
  private runJobsNow(id: FlowPage) {
    const craft = this.project?.id;
    if (!craft || this.project?.example) return;
    for (const job of jobsOnVisit[id] ?? []) {
      if (this.muse.has(craft, job) || this.scheduled.has(`${craft}:${job}`)) continue;
      // A reopened craft already carries its saved results: never re-run a job over them.
      const have: Partial<Record<string, boolean>> = {
        // saved results only count when they are real: fixture-grade results (no traced paths) re-run
        'shape.cutout': this.layers.subjectPaths.length > 0,
        'shape.segment': this.layers.regionList.some((r) => r.paths?.length || r.box),
        'layers.plan': this.layers.stack.length > 0 && (this.layers.regionList.length === 0 || this.layers.stack.some((l) => l.regionId)),
        'sheets.vectorise': this.layers.sheetPaths.length >= Math.max(1, this.layers.stack.length),
        'layers.unfold': this.layers.objectSpec !== null || this.layers.plan.length > 0
      };
      if (have[job]) continue;
      // each result is written into the flow state; the pages only ever read that state
      const f = this.layers;
      const image = this.project?.image || undefined;
      this.scheduled.add(`${craft}:${job}`);
      if (job === 'shape.cutout') this.cutoutReady = this.runCutout();
      else if (job === 'shape.segment') this.segmentReady = this.runSegment();
      else if (job === 'layers.plan') this.planReady = this.runPlan();
      else if (job === 'layers.imagineGaps') void this.muse.imagineGaps(craft, image);
      else if (job === 'layers.unfold') {
        // a kit with a cut plan: its sheets come from the plan (code reads it), not from stitching the views
        void (this.briefReady ?? Promise.resolve()).then(() => {
          const plan = f.pictures.find((p) => p.kind === 'plan'), url = plan ? this.capture.media[plan.index - 1]?.url : undefined;
          return url ? this.readPlan(craft, url) : this.stitch(craft, image);
        });
      }
      else if (job === 'sheets.vectorise') void this.muse.vectorise(craft, f.layers.length, this.sheetOpts()).then((r) => { f.applySheets(r.sheetsData); if (r.pathCount) this.flow.conversation.say(`Traced ${r.pathCount} closed paths across ${r.sheetsData.length} sheets (${r.sheetsData.reduce((a, s) => a + s.cutLengthMm, 0).toFixed(0)} mm of cut). Pick a device and send the first sheet.`); });
      else if (job === 'assemble.instructions') void this.muse.writeInstructions(craft, this.assembly).then((r) => { this.instructions = r; });
    }
  }
  /** 3D · the views stitched into one object (panels as sheets) */
  private stitch(craft: string, image?: string) {
    const f = this.layers;
    return this.muse.stitchViews(craft, { views: this.viewImages(image), sizeMm: f.outline.sizeMm, joinery: f.joinery }).then((r) => {
      if (this.project?.id !== craft) return;
      f.applySpec(r.spec); f.applyParts(r.parts); f.applyLayers(r.layers); f.applySheets(r.sheets); this.save();
      this.flow.conversation.say(`Stitched your views into one object: ${r.spec.wMm} × ${r.spec.dMm} × ${r.spec.hMm} mm, ${r.spec.panels.length} panels and ${r.spec.joins.length} ${f.joinery} joins.${r.spec.symmetry.length ? ` Symmetric: ${r.spec.symmetry.join(', ')}.` : ''}${r.spec.warnings.length ? ` Heads up: ${r.spec.warnings.join(' ')}` : ''}`);
    });
  }
  /** 3D kit · its sheets read from the cut-plan picture, said in the chat as a step */
  private readPlan(craft: string, url: string) {
    const f = this.layers, c = this.flow.conversation, key = this.stepKey('plan');
    c.think(key, 'Reading your cut plan', { job: 'layers.readPlan', thought: 'Code finds each sheet, the pieces its cut lines close off, and the engraving (red and green marks).' });
    c.work(key);
    return this.muse.readCutPlan(craft, url).then((r) => {
      if (this.project?.id !== craft) return;
      if (!r.sheets.length) { c.fail(key, 'I couldn’t find the sheets in the plan', 'Stitching your views instead.'); return this.stitch(craft); }
      f.applyPlan(r.sheets); this.syncCraft(undefined, { fresh: true }); this.save();
      const pieces = r.sheets.reduce((a, s) => a + s.pieces, 0), size = r.sheets[0].sizeMm;
      c.done(key, `Read ${r.sheets.length} sheets from your cut plan`, { detail: `${r.sheets.map((s) => s.name).join(' · ')} · about ${pieces} pieces · each sheet ${size[0]} × ${size[1]} mm (assumed)${Math.max(r.w, r.h) < 2500 ? ` · the picture is ${r.w} × ${r.h} px, so outlines are approximate — import the original SVG or DXF to cut precisely` : ''}` });
    });
  }
  // ── Shape → Layers, in order: each step waits for the one it builds on (the brief, then the outline, then the regions)
  briefReady: Promise<unknown> | null = null;
  /** jobs queued behind the step they build on (so opening a step twice does not queue them twice) */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered
  private scheduled = new Set<string>();
  /** steps already retried once in this run (a second empty answer is said, not retried again) */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered
  private retried = new Set<string>();
  cutoutReady: Promise<unknown> | null = null;
  segmentReady: Promise<unknown> | null = null;
  planReady: Promise<unknown> | null = null;
  /** the first uploaded file's name (names the craft) when the upload started on Home */
  fileName: string | undefined = undefined;
  /** the captured photo as a JPEG at working size (set at Analyze; a reopened craft's stored media already is one) */
  workPhoto: string | null = null;
  private get photo() { return this.workPhoto || this.capture.media[0]?.url || this.project?.image || undefined; }
  // ── The breakdown, said in the chat as it happens: each stage is a timeline step (thinking → working → done)
  /** a fresh run of the breakdown (a rebuild) gets new step rows; within a run, the stages share them */
  private run = 0;
  private stepKey(base: string) { return `${this.project?.id ?? 'craft'}:${base}:${this.run}`; }
  private get multiple() { return this.layers.imageBrief?.arrangement === 'multiple-items'; }
  /** Breakdown · remove the background (SAM outline + code backdrop measurement); `strict` when the user asked for the wall to go */
  runCutout() {
    const craft = this.project?.id; if (!craft) return Promise.resolve();
    const f = this.layers, c = this.flow.conversation, key = this.stepKey('cutout');
    c.think(key, 'Removing the background', { job: 'shape.cutout', thought: f.removeBackdrop ? 'You asked for the wall to go: clearing the wall, its texture, its shadows and props at the edges.' : 'I’ll measure the backdrop from the photo edge, with SAM 3.1’s outline as a hint so the parts around the subject stay attached.' });
    return (this.briefReady ?? Promise.resolve()).then(() => { c.work(key); return this.muse.cutout(craft, { imageDataUrl: this.photo, subjectPrompt: f.imageBrief?.subjectPrompt, strict: f.removeBackdrop }); })
      .then((r) => {
        if (this.project?.id !== craft) return;
        f.applyCutout(r);
        if (typeof r.aspect === 'number') f.aspect = r.aspect;
        const real = f.imageBrief?.realSizeMm;
        if (real && !this.multiple && f.subjectPaths.length) f.calibrate(real, f.subjectPaths);
        this.save();
        const pct = f.cutoutChecks.find((x) => /Subject/.test(x.text))?.text.match(/([\d.]+)%/)?.[1];
        const size = !this.multiple && f.imageBrief?.realSizeMm ? f.pieceSize : null;
        if (r.paths?.length) c.done(key, f.removeBackdrop ? 'Background removed · wall and shadows cleared' : 'Background removed', { detail: this.multiple ? 'a first pass on the colours; SAM 3.1 outlines each item next' : `${pct ? `the subject is ${pct}% of the photo · ` : ''}${r.paths.length} closed outline path${r.paths.length > 1 ? 's' : ''}${size ? ` · about ${size.wMm} × ${size.hMm} mm${f.sizeBasis ? ` (${f.sizeBasis})` : ''}` : ''}` });
        else c.fail(key, 'Outline not found in this photo', 'Say “remove the background” to try again.');
      })
      .catch(() => { c.fail(key, 'Background removal failed', 'Say “remove the background” to try again.'); });
  }
  /** Breakdown · the items, then their parts: colour groups inside the outline (one stacked piece), SAM per item (separate items) */
  runSegment(k?: number): Promise<unknown> {
    const craft = this.project?.id; if (!craft) return Promise.resolve();
    const f = this.layers, c = this.flow.conversation, items = this.stepKey('items'), layers = this.stepKey('layers');
    c.think(items, 'Finding the items', { job: 'shape.segment', thought: 'Is it one stacked piece or several separate things? That decides how it splits.' });
    return (this.cutoutReady ?? this.briefReady ?? Promise.resolve()).then(() => {
      if (this.multiple) c.work(items, 'Finding the items', 'SAM 3.1 outlines each separate item.');
      else {
        c.done(items, `Found 1 item: ${f.subject || 'your picture'}`, { detail: 'one stacked piece · its layers are its colours' });
        if (f.layerPlan) c.think(layers, `Building your ${f.layerPlan.layers.length} layers`, { job: 'shape.segment', thought: 'Code gives each pixel the nearest of your colours; a colour used twice splits by what frames it.' });
        else c.think(layers, `Splitting into colour layers`, { job: 'shape.segment', thought: 'Code groups the photo’s colours inside the outline, then orders them back to front by what sits on top.' });
        c.work(layers);
      }
      return this.muse.segment(craft, { imageDataUrl: this.photo, briefRegions: f.imageBrief?.regions, brief: f.imageBrief, subjectPaths: f.subjectPaths, k, plan: this.multiple ? null : f.layerPlan });
    })
      .then((r) => {
        if (this.project?.id !== craft) return;
        f.applyRegions(r); this.save();
        if (this.multiple) {
          // a photo has no scale: the typical item is the size Spark estimated (the median item, so a fanned or
          // partly hidden one does not skew it)
          const real = f.imageBrief?.realSizeMm;
          const cuts = f.regions.filter((x) => x.paths?.length && x.role !== 'engrave');
          if (real && cuts.length) {
            const long = (x: (typeof cuts)[number]) => { const pts = x.paths!.flat(); const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) / f.aspect); };
            const median = [...cuts].sort((a, b) => long(a) - long(b))[Math.floor(cuts.length / 2)];
            f.calibrate(real, median.paths!);
            this.save();
          }
          // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a one-off set of names, not reactive state
          const names = [...new Set(f.regions.map((x) => x.itemName ?? x.name))];
          const engraved = f.regions.filter((x) => x.role === 'engrave').length;
          const sizeOf = (nm: string) => { const rs = f.regions.filter((x) => (x.itemName ?? x.name) === nm && x.paths?.length && x.role !== 'engrave'); const pts = rs.flatMap((x) => x.paths!).flat(); if (!real || !pts.length) return ''; const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return ` (${Math.round((Math.max(...xs) - Math.min(...xs)) * f.mmPerUnit.x)} × ${Math.round((Math.max(...ys) - Math.min(...ys)) * f.mmPerUnit.y)} mm)`; };
          // every item needs its outline: SAM can name five and outline one (a mask over several is turned away)
          const bare = names.filter((nm) => !f.regions.some((x) => (x.itemName ?? x.name) === nm && x.paths?.length));
          if (names.length && bare.length && !this.retried.has(items)) { this.retried.add(items); c.work(items, 'Finding the items', `SAM 3.1 outlined ${names.length - bare.length} of ${names.length} — asking again for ${bare.slice(0, 3).join(', ')}${bare.length > 3 ? '…' : ''}.`); return this.runSegment(k); }
          if (names.length && bare.length) { c.fail(items, `Outlined ${names.length - bare.length} of the ${names.length} items`, `No outline for ${bare.join(', ')}: SAM 3.1 saw them only as part of a bigger shape. Say “find the items again”, or carry on with the ones outlined.`); return; }
          if (names.length) c.done(items, `Found ${names.length} item${names.length > 1 ? 's' : ''}`, { detail: `${names.slice(0, 8).map((nm) => nm + sizeOf(nm)).join(' · ')}${engraved ? ` · ${engraved} with an engraving inside (engrave first, then cut)` : ''}${real ? ` · sizes from ${f.sizeBasis || 'Spark’s estimate'}` : ''}` });
          // nothing back (a busy model, or Spark saw far more items than SAM could outline): one quiet retry first
          else if (!this.retried.has(items)) { this.retried.add(items); c.work(items, 'Finding the items', 'Nothing came back from SAM 3.1 — trying once more.'); return this.runSegment(k); }
          else c.fail(items, 'No items found yet', 'The outline is needed first — say “remove the background” to try again.');
        } else if (!f.regions.length) c.fail(layers, 'No layers found yet', 'The outline is needed first — say “remove the background” to try again.');
        else c.work(layers, undefined, `${f.regions.length} colour groups measured`);
      })
      .catch(() => { c.fail(this.multiple ? items : layers, 'Finding the parts failed', 'Try again in a moment.'); });
  }
  /** Breakdown · the stack (one stacked piece) or a layer per item (separate items) */
  runPlan() {
    const craft = this.project?.id; if (!craft) return Promise.resolve();
    const f = this.layers, c = this.flow.conversation, key = this.stepKey('layers');
    return (this.segmentReady ?? Promise.resolve()).then(() => {
      if (!f.regions.length) return null;
      if (this.multiple) c.think(key, 'Giving each item its layers', { job: 'layers.plan', thought: 'Each item is its own cut; parts of one item stack on it.' });
      else c.think(key, 'Ordering the layers back to front', { job: 'layers.plan', thought: 'Muse Spark names each layer from what it sees; code keeps every layer tied to its own mask.' });
      c.work(key);
      return this.muse.planLayers(craft, f.makeAs, { imageDataUrl: this.photo, description: f.brief || f.subject, regions: f.regions, brief: f.imageBrief, named: !this.multiple && Boolean(f.layerPlan) });
    })
      .then(async (r) => {
        if (!r || this.project?.id !== craft) return;
        f.applyLayers(r); this.syncCraft(undefined, { fresh: true }); this.save();
        const swatches = f.layers.map((l) => ({ hex: l.colour, label: l.name, n: l.n }));
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- counted once, not reactive state
        const itemsN = new Set(f.layers.map((l) => l.itemName).filter(Boolean)).size;
        if (!f.layers.length) c.fail(key, 'No layers yet', 'Say “remove the background” to try again.');
        else c.done(key, this.multiple ? `${itemsN || f.layers.length} item${(itemsN || f.layers.length) > 1 ? 's' : ''} · ${f.layers.length} layer${f.layers.length > 1 ? 's' : ''}` : f.layerPlan ? `Built ${f.layers.length} layers to your stack` : `Split into ${f.layers.length} layers by colour`, { detail: this.multiple ? `${f.separateItems ? 'a cut and its engraving per item' : 'one cut each'} · tap a layer to quote it` : f.layerPlan ? `back to front: ${f.layerPlan.layers.map((l) => `${l.name}${l.solid ? ' (solid)' : ''}`).join(' · ')}${f.layerPlan.outline !== false ? ' · every layer keeps the outer outline' : ''}` : 'back to front · tap a layer to quote it', swatches });
        if (f.separateItems) await this.itemPasses(craft);
        if (this.engineOn && this.project?.id === craft) await this.cleanUp();
      })
      .catch(() => { c.fail(key, 'Planning the layers failed', 'Try again in a moment.'); });
  }
  /**
   * Separate items photographed overlapping (bookmarks fanned out) get two passes after their layers, each a step
   * in the chat: align & straighten (each item onto its own sheet, upright — code, from its long axis), then
   * interpolation (an item a neighbour lay over gets its hidden edges back from its outline's hull). Each item is
   * a good cut on its own; these passes are the adjustment the overlap needs.
   */
  async itemPasses(craft: string) {
    const f = this.layers, c = this.flow.conversation;
    if (this.engineOn) {
      // the same actions as the chat and the buttons (design/14 §9 recipe): each a step, each undoable
      // perspective first: a card shot at an angle is a keystone, and its long axis (what straighten reads) leans
      await this.act('rectify', [{ all: true }], {}, 'pass');
      await this.act('straighten', [{ all: true }], {}, 'pass');
      // every item is looked at: the action knows its family (a bookmark narrower than the others had a strip
      // hidden under a neighbour; a bite out of a convex one was a tassel) and says what it filled
      if (this.project?.id === craft) await this.act('interpolate', [{ all: true }], { maxAddPct: 40 }, 'pass');
      // the bitten ones have all four corners now: their perspective too (the rest are square already, so untouched)
      if (this.project?.id === craft) await this.act('rectify', [{ all: true }], {}, 'pass');
      // a set is cut one size: pairs together, or all of one kind (five bookmarks), like the one shot best
      if (this.project?.id === craft && setsOf(this.craft.doc, this.craft.doc.items.map((i) => i.id)).length) await this.act('same-size', [{ all: true }], {}, 'pass');
      return;
    }
    const straighten = this.stepKey('straighten');
    c.think(straighten, 'Aligning and straightening each item', { thought: 'Code finds each item’s long axis and turns it upright onto its own sheet; its engraving turns with it.' });
    c.work(straighten);
    const turns = this.itemTurns();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- counted once, not reactive state
    const items = new Set(f.layers.map((l) => l.itemName).filter(Boolean)).size;
    c.done(straighten, `Each of the ${items} items is on its own sheet, upright`, { detail: turns.length ? `turned ${turns.join(', ')}` : 'all were already upright' });
    const hidden = this.hiddenItems();
    if (!hidden.length) return;
    const fill = this.stepKey('interpolate');
    c.think(fill, 'Filling in what the neighbours hide', { thought: `${hidden.join(', ')} ${hidden.length > 1 ? 'are' : 'is'} partly under another item in the photo; code rebuilds the hidden edges from the visible outline.` });
    c.work(fill);
    const done: string[] = [];
    for (const l of f.layers.filter((x) => x.role !== 'engrave' && hidden.includes(x.itemName ?? x.name))) {
      if (this.project?.id !== craft) return;
      if (await this.refineLayer(l.n, `Complete the hidden edges of the ${l.itemName ?? l.name}`, { echo: false, op: { kind: 'complete' }, show: false })) done.push(l.itemName ?? l.name);
    }
    if (done.length) c.done(fill, `Filled in the hidden edges of ${done.join(', ')}`, { detail: 'the engraving under a neighbour can’t be seen, so it stays as it was' });
    else c.fail(fill, 'Couldn’t fill in the hidden edges', 'Say “complete the hidden edges of the …” to try one item.');
  }
  /** Re-run Shape (and Layers when reached) after an instruction changed what they should do. */
  private rebuildFromShape(opts: { k?: number } = {}) {
    this.run++;
    const reached = this.project?.reached ?? -1;
    const at = (id: StepId) => steps.findIndex((s) => s.id === id);
    if (reached >= at('cutout')) this.cutoutReady = this.runCutout();
    if (reached >= at('segment')) this.segmentReady = this.runSegment(opts.k);
    if (reached >= at('layers')) this.planReady = this.runPlan();
    return Promise.all([this.cutoutReady, this.segmentReady, this.planReady]);
  }
  /** what Katachi is working on right now (the open timeline step), for the work area's status pill */
  get working(): string | null {
    const open = this.flow.conversation.log.filter((e) => e.step && (e.step.status === 'thinking' || e.step.status === 'working'));
    return open.at(-1)?.step?.title ?? null;
  }
  /** What the models and agents did for the open craft (optionally one journey step), for the activity strip. */
  activity(step?: string) {
    return this.muse.forCraft(this.project?.id)
      .map((t) => ({ key: t.key, model: agentJobs[t.job].model, step: agentJobs[t.job].step, status: t.status, summary: t.summary }))
      .filter((t) => !step || t.step === step);
  }
  // ── Sheets and Burn Watch: send a cut to the device, watch it, export the files
  /** Send the current sheet to the device (progress simulated until adapters stream it) and watch that cut. */
  sendSheet() {
    const n = this.layers.job.sheet;
    this.layers.beginCut({ simulate: true });
    void this.watch.watchSheet(n);
  }
  /** separate items: how far each was turned to stand upright ("fox bookmark 7°") */
  itemTurns(): string[] {
    const f = this.layers; if (!f.separateItems) return [];
    return f.layers.filter((l) => l.role !== 'engrave').map((l) => ({ name: l.itemName ?? l.name, turn: f.pieceFor(l.n).turn })).filter((x) => x.turn).map((x) => `${x.name} ${Math.abs(x.turn)}°`);
  }
  /** separate items that a neighbour covered in the photo (their outline has bites taken out of it) */
  hiddenItems(): string[] {
    const f = this.layers; if (!f.separateItems) return [];
    // the item's outline only (its own see-through holes are not something a neighbour hid)
    return f.layers.filter((l) => l.role !== 'engrave' && hiddenShare(f.regionForLayer(l)?.paths ?? []) > 0.12).map((l) => l.itemName ?? l.name);
  }
  /** Add the craft's sheets (all, in cutting order, or some layers) to the cut queue — said in the chat. */
  queueSheets(only?: number[]) {
    const f = this.layers, p = this.project, c = this.flow.conversation;
    if (!p || (!f.layers.length && !this.craft.doc.items.length)) return 0;
    const ns = (only ?? f.passOrder).filter((n) => f.layers[n - 1]);
    const machine = f.machine;
    // the hand-off (design/15 §5): the craft becomes sheets for this device — a part's engraving and its cut on
    // one sheet, engraving first, holes before outlines
    const planned = this.craft.doc.items.length ? this.plannedSheets(only) : null;
    const added = planned ? this.queue.add(planned) : this.queue.add(ns.map((n) => {
      const l = f.layers[n - 1];
      return { craftId: p.id, craftName: p.name || this.title, layer: n, name: l.name, material: l.material, op: f.opFor(n), colour: l.colour, machine,
        ...((pc) => ({ cut: pc.d, shapes: pc.shapes, sheetMm: pc.sheetMm }))(f.pieceFor(n)) };
    }));
    c.ingestTranscript(only?.length === 1 && f.layers[only[0] - 1] ? `Add ${f.layers[only[0] - 1].name} to the cut queue` : 'Add the sheets to the cut queue');
    c.done(`${p.id}:queue:${c.log.length}`, added ? `Added ${added} sheet${added === 1 ? '' : 's'} to the cut queue` : 'Already in the cut queue',
      { detail: `${this.queue.waiting.length} waiting · you feed each sheet, send it and check it before the next` });
    c.log = c.log.map((e, i) => (i === c.log.length - 1 ? { ...e, actions: [{ label: 'Open the cut queue', href: '/queue' }] } : e));
    return added;
  }
  // ── The hand-off (design/15 §5): the craft as sheets for this device, laid out the way chosen on Cut
  get cutProfile() { return { ...profileFor(this.layers.device, rowsOf(this.craft.doc)[0]?.part.material ?? ''), layout: this.layers.cutLayout }; }
  private planMemo: { key: string; plan: CutPlan } | null = null;
  /** the cut plan, kept until the craft, the device or the layout changes (fit to board takes a moment on big kits) */
  get cutPlan(): CutPlan | null {
    const doc = this.craft.doc;
    if (!doc.items.length) return null;
    const p = this.cutProfile, key = `${doc.id}:${doc.rev}:${p.device}:${p.layout}`;
    if (this.planMemo?.key === key) return this.planMemo.plan;
    let plan: CutPlan;
    try { plan = planCut(doc, p); } catch { plan = planCut(doc, { ...p, layout: 'one-part-per-sheet' }); }
    this.planMemo = { key, plan };
    return plan;
  }
  /** the layouts that make sense for this craft */
  get cutLayouts(): { value: CutProfile['layout']; label: string; hint: string }[] {
    const doc = this.craft.doc, kit = doc.items.some((i) => i.build === 'assembly'), groups = doc.groups.length > 0;
    return [
      { value: 'one-part-per-sheet', label: 'One per sheet', hint: 'Each layer or piece on its own sheet, upright.' },
      ...(groups ? [{ value: 'groups-together' as const, label: 'Pairs together', hint: 'Pairs (left and right) and sets go on the same sheet.' }] : []),
      { value: 'nest', label: 'Fit to board', hint: 'Packs the pieces onto as few boards as possible — small ones even inside others’ holes.' },
      ...(kit && doc.sources.some((s) => s.id === 'svg-import') ? [{ value: 'one-item-per-sheet' as const, label: 'As drawn', hint: 'Your file’s drawing on one sheet, exactly as it is.' }] : []),
      ...(kit && !doc.sources.some((s) => s.id === 'svg-import') ? [{ value: 'given' as const, label: 'As the kit draws it', hint: 'Each kit sheet exactly as its layout shows it.' }] : [])
    ];
  }
  /** Cut · choose how the parts go on sheets — said in the chat, with anything too big for the board */
  setCutLayout(layout: CutProfile['layout']) {
    const f = this.layers, c = this.flow.conversation, opt = this.cutLayouts.find((o) => o.value === layout);
    if (!opt || f.cutLayout === layout) return;
    f.cutLayout = layout; this.save();
    const plan = this.cutPlan, warnings = plan?.sheets.flatMap((s) => s.warnings ?? []) ?? [];
    c.ingestTranscript(`Lay it out: ${opt.label.toLowerCase()}`);
    c.done(`${this.project?.id ?? 'craft'}:layout:${c.log.length}`, `${opt.label}: ${plan?.sheets.length ?? 0} sheet${plan?.sheets.length === 1 ? '' : 's'} on the ${this.cutProfile.board.wMm} × ${this.cutProfile.board.hMm} mm ${f.currentDevice.label}`,
      { detail: warnings.length ? `${warnings.length} need attention: ${warnings.slice(0, 2).join(' · ')}${warnings.length > 2 ? ' · …' : ''}` : opt.hint });
  }
  /** Home · a maker's own kit file (SVG): exact pieces, straight to Cut (no photo, no tracing) — design/15 §5 */
  async importKitFile(file: { name: string; text(): Promise<string> }): Promise<string | null> {
    const text = await file.text(), name = file.name.replace(/\.svg$/i, '') || 'Kit file';
    let doc: CraftDoc;
    try { doc = svgToCraft(text, { name, newId: () => `i${(this.narrated++).toString(36)}${Math.random().toString(36).slice(2, 6)}` }); }
    catch (e) { this.flow.conversation.say(`I couldn’t read ${file.name} as a cut file: ${e instanceof Error ? e.message : 'not an SVG'}.`); return null; }
    this.newProject();
    const p = this.project!, f = this.layers, at = steps.findIndex((s) => s.id === 'layers');
    this.craft.load({ ...doc, id: p.id, name, createdAt: p.createdAt, updatedAt: p.updatedAt });
    // the screens read the craft through the bridge; the file's own drawing is the sheet
    const v = craftToFlow(this.craft.doc), it = this.craft.doc.items[0];
    f.regionList = v.regionList as unknown as typeof f.regionList;
    f.stack = v.stack as unknown as typeof f.stack;
    if (it) { f.widthMm = it.frame.size[0] / it.frame.pxPerMm; f.aspect = it.frame.size[0] / it.frame.size[1]; }
    f.cutLayout = 'one-item-per-sheet';
    this.project = { ...p, name, reached: Math.max(p.reached, at), path: flowPath('output') };
    this.save();
    const pieces = it?.parts.length ?? 0, c = this.flow.conversation;
    c.ingestTranscript(`Import ${file.name}`);
    c.done(`${p.id}:import:${c.log.length}`, `Imported ${name}: ${pieces} piece${pieces === 1 ? '' : 's'}, exact from your file`,
      { detail: `${it ? `${Math.round(it.frame.size[0] / it.frame.pxPerMm)} × ${Math.round(it.frame.size[1] / it.frame.pxPerMm)} mm · ` : ''}red cuts, blue scores, black engraving · laid out as drawn — choose “Fit to board” on Cut to pack the pieces` });
    return '/make/output';
  }
  /** one sheet's file (SVG or DXF) for the maker's own software */
  sheetDownload(layer: number, format: 'svg' | 'dxf') {
    // the plan's sheet that holds this layer's part (rows and sheets differ: a bookmark's engraving shares its sheet)
    const plan = this.cutPlan, pid = rowsOf(this.craft.doc)[layer - 1]?.part.id;
    if (!plan?.sheets.length) return null;
    const sheet = plan.sheets.find((s) => s.placements.some((p) => p.partId === pid)) ?? plan.sheets[0];
    return sheetFile(plan, sheet.n, format);
  }
  /** Cut shows the plan's sheets when they differ from the layers: separate items (a part's engraving and cut share
   *  a sheet, pairs and fit to board) and kits. Stacked art keeps one sheet per layer, tracked through the run. */
  get planOnCut() { return Boolean(this.cutPlan) && (this.layers.separateItems || this.layers.kind === '3d' || this.craft.doc.sources.some((x) => x.id === 'svg-import')); }
  /** Views · a kit's sheets as read from its cut-plan picture, to look at before cutting: each sheet's pieces (cut)
   *  and marks (engrave) in sheet mm, with the pieces counted */
  get kitSheets(): { name: string; pieces: number; sizeMm: [number, number]; passes: { kind: string; d: string }[]; view: { x: number; y: number; w: number; h: number } }[] {
    const d = (paths: [number, number][][]) => paths.map((l) => `M${l.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`).join('');
    return this.layers.plan.map((s) => ({ name: s.name, pieces: s.pieces, sizeMm: s.sizeMm, view: { x: 0, y: 0, w: s.sizeMm[0], h: s.sizeMm[1] },
      passes: [...(s.engrave.length ? [{ kind: 'engrave', d: d(s.engrave) }] : []), { kind: 'cut', d: d(s.cut) }] }));
  }
  /** Cut · the plan's sheets ready to draw: each pass as an SVG path in sheet mm, framed on the used area */
  get planSheets(): { n: number; name: string; colour: string; material: string; board: { wMm: number; hMm: number }; view: { x: number; y: number; w: number; h: number }; passes: { kind: string; d: string }[]; warnings: string[] }[] {
    const plan = this.cutPlan; if (!plan) return [];
    return plan.sheets.map((sh) => {
      const pts = sh.passes.flatMap((p) => p.shapesMm.flat());
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const [x0, y0, x1, y1] = pts.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, sh.board.wMm, sh.board.hMm];
      return { n: sh.n, name: sh.name, colour: sh.colour, material: sh.material, board: sh.board, view: { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }, warnings: sh.warnings ?? [],
        passes: sh.passes.map((p) => ({ kind: p.kind, d: p.shapesMm.map((l) => `M${l.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`).join('') })) };
    });
  }
  /** every sheet as SVG + DXF in one zip — said in the chat */
  sheetsZip() {
    const plan = this.cutPlan; if (!plan) return null;
    const z = planZip(plan, this.project?.name || this.title), c = this.flow.conversation;
    c.done(`${this.project?.id ?? 'craft'}:zip:${c.log.length}`, `Downloaded ${plan.sheets.length} sheets as SVG and DXF`, { detail: `${z.name} · ${this.cutProfile.label} layout “${this.cutLayouts.find((o) => o.value === this.layers.cutLayout)?.label ?? 'One per sheet'}” · cut red, score blue, engrave black` });
    return z;
  }
  /** the cut plan's sheets as queue items (all, or the sheets holding the given rows) */
  private plannedSheets(only?: number[]) {
    const doc = this.craft.toJSON(), rows = rowsOf(doc), plan = this.cutPlan!, profile = this.cutProfile;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a lookup built per call, not reactive state
    const parts = only ? new Set(only.map((n) => rows[n - 1]?.part.id).filter(Boolean)) : null;
    return plan.sheets.filter((s) => !parts || s.placements.some((pl) => parts.has(pl.partId))).map((s) => ({ ...toQueueInput(s, doc, profile), craftName: doc.name || this.title }));
  }
  /** Sheets · a virtual run of every pass, start to end: blank sheet, engraving, cut, the extra pieces vanish. */
  runId = 0;
  async playRun() {
    const f = this.layers, run = ++this.runId;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    f.job = { sheet: 1, phase: 'feed', progress: 0 };
    this.flow.conversation.say(`A virtual run of all ${f.passOrder.length} passes${f.passOrder.some((n) => f.opFor(n) === 'engrave') ? ' — engraving first, then the cuts' : ''}: each starts from a blank sheet in its colour, is cut, and the extra pieces drop away.`);
    for (let i = 0; i < f.passOrder.length && run === this.runId; i++) {
      await wait(500);
      f.beginCut({ simulate: true });
      while (f.job.phase === 'cutting' && run === this.runId) await wait(100);
      await wait(1100);
      if (run !== this.runId) return;
      f.confirmCut();
    }
  }
  stopRun() { this.runId++; }
  /** Burn Watch on a cut: the current sheet is sent first; any other cut is (re)watched from its clip. */
  watchCut(n: number) {
    if (n === this.layers.job.sheet && this.layers.job.phase === 'feed') this.sendSheet();
    else void this.watch.watchSheet(n);
  }
  /** what Sheets traces: each layer's sheet as its build decides, engraving before the cut */
  private sheetOpts() {
    const f = this.layers;
    return { regions: f.regions, sizeMm: f.widthMm, aspect: f.aspect, layers: f.layers, sheetPoints: (n: number) => f.sheetPointsFor(n), pieceMm: f.separateItems ? (n: number) => f.pieceFor(n).shapes : undefined, op: (n: number) => f.opFor(n), order: f.passOrder };
  }
  /** Scale the piece to a real size, proportions kept (said in the chat; the sheets are traced again at the new size). */
  setSize(mm: number, side: 'w' | 'h' = 'w', { say = true } = {}) {
    const f = this.layers, c = this.flow.conversation;
    if (say) c.ingestTranscript(`Make it ${Math.round(mm)} mm ${side === 'w' ? 'wide' : 'tall'}`);
    f.scaleTo(mm, side); this.save();
    const z = f.pieceSize;
    c.done(`${this.project?.id ?? 'craft'}:size:${c.log.length}`, z ? `Scaled to ${z.wMm} × ${z.hMm} mm` : 'Nothing to scale yet', { detail: z ? 'Proportions kept from your photo; the sheets are traced again at this size.' : undefined });
  }
  /** How it is built (stacked / inlay / engrave + cut): said in the chat, the sheets are traced again on Sheets. */
  setBuild(b: import('./layer-flow.svelte').Build, { say = true } = {}) {
    const f = this.layers, c = this.flow.conversation;
    if (say) c.ingestTranscript(BUILD_TEXT[b].said);
    f.setBuild(b); this.save();
    c.done(`${this.project?.id ?? 'craft'}:build:${c.log.length}`, BUILD_TEXT[b].title, { detail: BUILD_TEXT[b].detail });
  }
  /** Download .zip: the vectorised sheets (placeholder until sheets.vectorise is wired). */
  exportSheets() {
    if (!this.project) return;
    void this.muse.vectorise(this.project.id, this.layers.layers.length, this.sheetOpts()).then((r) => {
      this.layers.applySheets(r.sheetsData);
      this.flow.conversation.say(r.pathCount ? `Traced ${r.pathCount} closed paths across ${r.sheetsData.length} sheets — the .zip export carries those SVG paths per sheet.` : `The .zip will hold ${this.layers.layers.length} sheet files (SVG + device format) once tracing is wired — for now the sheets are previews.`);
    });
  }
  /** Assemble · Muse Image pictures the finished piece (placeholder). */
  renderFinished() { if (this.project) void this.muse.renderFinished(this.project.id, this.project.image || undefined); }
  /** Autosave: called whenever the project or its choices change (a draft with nothing captured is not saved). */
  save() {
    const p = this.project;
    if (!p || p.reached < 0) return;
    const choices = this.layers.snapshot();
    const heavy = Object.fromEntries(HEAVY.map((k) => [k, choices[k]]));
    const light = Object.fromEntries(Object.entries(choices).filter(([k]) => !(HEAVY as readonly string[]).includes(k)));
    const record: ProjectRecord = { ...$state.snapshot(p) as ProjectRecord, updatedAt: Date.now(), choices: { ...light, heavyStored: true } };
    // the craft's chat is kept with it (a new craft starts a new chat; reopening one brings its chat back)
    // the craft (with its history) only when it changed since the last save: autosave runs on every edit
    const craftDoc = this.craft.doc.id === record.id && this.craft.doc.rev !== this.savedRev ? this.craft.toJSON() : this.lastCraftDoc;
    if (craftDoc && craftDoc.id === record.id) { this.savedRev = craftDoc.rev; this.lastCraftDoc = craftDoc; }
    void putCraftData(record.id, { ...heavy, chat: $state.snapshot(this.flow.conversation.log), ...(craftDoc?.id === record.id ? { craftDoc } : {}) });
    this.store.save(record);
    this.store.setCurrent(record.id);
    this.projects = this.store.list();
  }
  // Import · Katachi turns "what do you want to make of it" into a plan (Muse dissection, /api/convert)
  variations = $state<{ title: string; change: string }[]>([]);
  async askForBrief(description: string) {
    const text = description.trim();
    if (!text) return;
    this.flow.conversation.ingestTranscript(text);
    if (BACKDROP_ASK.test(text) && !this.layers.removeBackdrop) {
      this.layers.removeBackdrop = true;
      this.layers.addNote({ step: 'Shape', text });
      this.flow.conversation.say('Noted — I’ll remove the background wall and its shadows when I trace the outline.');
      if ((this.project?.reached ?? -1) >= steps.findIndex((x) => x.id === 'cutout')) void this.rebuildFromShape();
    }
    const group = this.layers.makeAs === 'paper' ? 'cricut-paper' : 'laser-cut';
    const r = await this.muse.brief({ imageDataUrl: this.project?.image || undefined, description: text, group });
    if (!r?.objective) { this.flow.conversation.say('I couldn’t reach Muse just now — try again in a moment.'); return; }
    this.variations = (r.variations ?? []).slice(0, 3);
    this.flow.conversation.say(`${r.objective}. Pick a direction and I’ll plan the layers around it:`, this.variations.map((v, i) => ({ label: v.title, id: `variation:${i}` })));
  }
  chooseVariation(i: number) {
    const v = this.variations[i];
    if (!v) return;
    this.layers.setBrief(`${v.title} — ${v.change}`);
    this.flow.conversation.say(`Going with ${v.title}.`);
  }
  open(id: string) { const p = this.store.load(id); if (p) { this.apply(p); this.store.setCurrent(id); } }
  /** Crafts · delete one (the gallery confirms first). */
  removeCraft(id: string) {
    this.store.remove(id);
    void removeMedia(id); void removeCraftData(id);
    this.projects = this.store.list();
    if (this.project?.id === id) this.project = null;
  }
  /** Crafts · the bundled example, so an empty gallery still shows what a finished craft looks like. */
  openExample() {
    const existing = this.projects.find((p) => p.example);
    if (existing) { this.open(existing.id); return; }
    this.newProject();
    const at = steps.findIndex((s) => s.id === 'assemble');
    this.project = { ...this.project!, name: 'Mountain sunset · example', example: true, reached: at, path: flowPath('assemble'), status: 'finished' };
    this.save();
  }
  /** Where a craft is: its journey step (0–4) and label, or finished. */
  progressOf(p: ProjectRecord) {
    const i = p.reached < 0 ? 0 : journeyIndexOf(p.path);
    const finished = p.status === 'finished';
    return { index: i, total: journey.length, finished, label: finished ? 'Finished' : `Step ${i + 1} of ${journey.length} · ${journey[i].label}` };
  }
  /** Assemble · Spark's instructions once written for this craft, else the code-derived draft from its layers or parts. */
  instructions = $state<AssemblyStep[] | null>(null);
  get assembly(): AssemblyStep[] {
    if (this.instructions) return this.instructions;
    // the cut plan says which sheet each item is on (pairs share one; fit to board packs several)
    const plan = this.planOnCut ? this.cutPlan : null, doc = this.craft.doc;
    const sheetsOf = plan ? (item: string) => { const id = doc.items.find((i) => i.name === item)?.id; return plan.sheets.filter((s) => s.placements.some((p) => p.itemId === id)).map((s) => s.n); } : undefined;
    const kit = this.layers.plan.length ? this.layers.plan.map((s) => ({ name: s.name, pieces: s.pieces })) : undefined;
    // the pairs and sets found at Layers (by shape) carry through: partners side by side, one step each naming the other
    const groups = doc.groups.map((g) => ({ name: g.name, kind: g.kind, items: g.items.map((id) => doc.items.find((i) => i.id === id)?.name).filter((n): n is string => Boolean(n)) }));
    return assemblySteps({ kind: this.layers.kind, layers: this.layers.layers, set: this.layers.data, joinery: this.layers.joinery, multiple: this.layers.imageBrief?.arrangement === 'multiple-items', sheetsOf, kit, groups });
  }
  /** Katachi's word on a step, from what the models found (falls back to the step's guide copy). */
  noteFor(id: StepId): string {
    const f = this.layers;
    switch (id) {
      case 'import': return f.imageBrief
        ? `Looks like ${f.subject} \u2014 ${f.imageBrief.class}, ${f.imageBrief.likelyMaterial}. I see ${f.imageBrief.regions.length} regions to cut: ${f.imageBrief.regions.slice(0, 5).map((r) => r.label).join(', ')}. Tell me what to make of it, or go on and I\u2019ll find the outline.`
        : `Looks like ${f.subject}. Tell me what to make of it, or go on and I\u2019ll find the outline.`;
      case 'cutout': return !f.subjectPaths.length ? 'Tracing the outline and removing the background from your photo…' : `Background removed and the outline found: ${f.outline.shape === 'free' ? 'a free-form shape' : `a ${f.outline.shape}`}, about ${f.outline.shape === 'circle' ? '\u00d8 ' : ''}${f.outline.sizeMm} mm${f.subjectPaths.length ? `, traced as ${f.subjectPaths.length} closed path${f.subjectPaths.length > 1 ? 's' : ''} on your photo` : ''}. Check the edge, then I\u2019ll find the objects.`;
      case 'segment': return !f.regions.length ? 'Finding the parts of your photo that become layers…' : `I found ${f.regions.length} regions in your photo: ${f.regions.slice(0, 6).map((r) => `${r.name} ${r.pct}%`).join(', ')}. ${f.kept.length} kept (${f.keptPct}%). Toggle any region, or tell me \u201cdrop the ${f.kept[0]?.name ?? 'frame'}\u201d.`;
      case 'layers': return `${f.layers.length} layers, back to front: ${f.layers.map((l) => l.name).join(' \u00b7 ')}. Pick a layer to see what shows and what hides behind the ones in front \u2014 or tell me \u201cmerge ${f.selected.name} down\u201d.`;
      case 'gaps': return `${f.selected.name} is ${f.selected.hiddenPct}% hidden behind the layers in front. Across the stack you\u2019d use ${f.materialPct}% of ${f.layers.length} full sheets. Tell me \u201cmake ${f.selected.name} solid\u201d or \u201cleave ${f.selected.name} open\u201d, or pick a rule.`;
      case 'output': return this.planOnCut && this.cutPlan
        ? `${this.cutPlan.sheets.length} sheet${this.cutPlan.sheets.length === 1 ? '' : 's'} for the ${f.currentDevice.label}, laid out “${this.cutLayouts.find((o) => o.value === f.cutLayout)?.label ?? 'One per sheet'}”. Choose how the parts go on sheets, download them, or send them to the cut queue.`
        : f.sheetPaths.length
        ? `${f.sheetPaths.length} sheets traced from your masks: ${f.sheetPaths.reduce((a, s) => a + s.pathCount, 0)} closed paths, ${f.sheetPaths.reduce((a, s) => a + s.cutLengthMm, 0).toFixed(0)} mm of cut for the ${f.currentDevice.label}. Feed a sheet and send it, or download the paths.`
        : `${f.layers.length} sheets for the ${f.currentDevice.label} (${f.currentDevice.format}). The traced paths appear here once the masks are in \u2014 go back to Layers if the count looks wrong.`;
      case 'assemble': return `Here\u2019s how ${this.title} goes together: ${this.assembly.slice(0, 3).map((s, i) => `${i + 1}. ${s.title}`).join('  ')} Tick each step off, then Save craft so you can find it again.`;
      default: return guide.gaps.text;
    }
  }
  /** Assemble · Save craft: finished, with its layers, instructions and chat notes. */
  finishCraft() {
    if (!this.project) return;
    this.project = { ...this.project, status: 'finished', reached: Math.max(this.project.reached, steps.findIndex((s) => s.id === 'assemble')), path: flowPath('assemble') };
    this.save();
    this.flow.conversation.say(`Saved “${this.project.name}” to your crafts — layers, ${this.assembly.length} assembly steps and ${this.layers.notes.length} notes.`, [{ label: 'Open crafts', href: '/workshop' }]);
  }

  /** Settings · the user's machines (demo list until pairing arrives, P2); Sheets and Settings read it from here. */
  get devices() { return devices; }
  // Settings · the machine Sheets sends to by default (remembered in this browser)
  defaultDevice = $state<DeviceId>('cricut');
  setDefaultDevice(d: DeviceId) {
    this.defaultDevice = d;
    this.store.setSetting(DEVICE_KEY, d);
    if (this.project && this.project.status !== 'finished') this.layers.setDevice(d);
  }

  get trace() { return this.flow.trace; }
  /** the top bar: what the open craft has cost so far (live calls) and how many models; the user's total on Home */
  get costPill() { return this.usage.label(this.project && this.project.reached >= 0 ? this.project.id : undefined); }

  /** The Katachi assistant thread in Rokkit ChatMessage shape: greeting, then every entry of the conversation log. */
  get messages(): { id: string; role: 'user' | 'assistant'; text: string; data?: { actions?: ChatAction[]; call?: ModelCall; step?: StepEntry; quote?: Quote } }[] {
    const log = [{ role: 'assistant' as const, text: 'Hi Dev — what are we making today?' }, ...this.flow.conversation.log];
    return log.map((e, i) => {
      const data = { ...('actions' in e && e.actions ? { actions: e.actions } : {}), ...('call' in e && e.call ? { call: e.call } : {}), ...('step' in e && e.step ? { step: e.step } : {}), ...('quote' in e && e.quote ? { quote: e.quote } : {}) };
      return { id: `m${i}`, role: e.role, text: e.text, ...(Object.keys(data).length ? { data } : {}) };
    });
  }

  /** A page's context for the assistant column (inspector, rule, send-to): it sits above the Katachi chat. */
  info = $state<{ title: string; body: Snippet } | null>(null);
  setInfo(title: string, body: Snippet) { this.info = { title, body }; }
  /** Pass the body you set: a leaving page must not clear the next page's info (it is set first). */
  clearInfo(body?: Snippet) { if (body && this.info?.body !== body) return; this.info = null; }

  /** Katachi guides each image → layers step once, with Previous / Next. */
  guidedSteps = $state<StepId[]>([]);
  currentStep = $state<StepId | null>(null);
  guideStep(id: StepId) {
    this.currentStep = id;
    // Layers narrates itself: the breakdown's steps are the guide; moving between steps is the rail and the suggestions
    if (this.guidedSteps.includes(id) || id === 'layers' || id === 'import' || id === 'cutout' || id === 'segment') return;
    this.guidedSteps = [...this.guidedSteps, id];
    this.flow.conversation.say(this.noteFor(id));
  }
  /** Suggestion chips for the composer: from the actual regions/layers when we have them, else the step's defaults. */
  get suggestions(): (string | ChatAction)[] {
    const f = this.layers;
    if (this.currentStep === 'segment' && f.regions.length) return [...f.kept.slice(0, 2).map((r) => `Drop the ${r.name}`), ...f.regions.filter((r) => !r.on).slice(0, 1).map((r) => `Keep the ${r.name}`), 'Separate into layers'];
    if (this.currentStep === 'layers' && this.flow.conversation.busy) return [];
    if (this.currentStep === 'layers' && f.layers.length) {
      // helpful, not repeated: nothing already asked for, no background removal once it is done, ideas for the
      // selected layer by name, and the next step last
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a lookup built per read, not reactive state
      const said = new Set(this.flow.conversation.log.filter((e) => e.role === 'user').map((e) => e.text.trim().toLowerCase()));
      // tidy-ups the stack itself needs: layers nothing of shows, several engravings that could be one
      const tidy = [
        ...(f.layers.some((l) => Math.round(l.visiblePct) <= 0 && (l.n > 1 || f.separateItems || l.role)) ? ['Remove the empty layers'] : []),
        // separate items: only when an item has more than one engraving (each item keeps its own sheet)
        ...((f.separateItems ? f.items.some((i) => i.layers.filter((l) => l.role === 'engrave').length > 1) : f.layers.filter((l) => l.role === 'engrave').length > 1) ? ['Merge all the engravings into one layer'] : [])
      ].filter((x) => !said.has(x.toLowerCase()));
      if (f.separateItems) {
        const fix = this.hiddenItems().map((n) => `Complete the hidden edges of the ${n}`).filter((x) => !said.has(x.toLowerCase()));
        return [...tidy, ...fix.slice(0, 2), { label: 'Add the sheets to the cut queue', id: 'queue' }, { label: 'Cut the sheets', href: '/make/output', id: 'say' }];
      }
      const sel = f.selected, front = f.layers[sel.n];
      const ideas: (string | ChatAction)[] = [
        ...(f.removeBackdrop ? [] : ['Remove the wall and shadows']),
        sel.n === 1 ? `Make ${sel.name} one solid outline` : `Keep the fine details in ${sel.name}`,
        ...(front ? [`Merge ${sel.name} with ${front.name}`] : []),
        ...(sel.tune?.detail === 5 ? [] : [`Make ${sel.name} smoother`])
      ].filter((x) => typeof x !== 'string' || !said.has(x.toLowerCase()));
      return [...ideas.slice(0, 2), { label: 'Add the sheets to the cut queue', id: 'queue' }, { label: 'Cut the sheets', href: '/make/output', id: 'say' }];
    }
    if (this.currentStep === 'layers') return ['Remove the background'];
    if (this.currentStep === 'gaps') return [`Make ${f.selected.name} solid`, `Leave ${f.selected.name} open`, 'Imagine the hidden parts'];
    if (this.currentStep === 'assemble') return this.assembly.slice(0, 2).map((s) => s.title);
    if (this.page === '/make/views') return this.layers.layers.length ? [{ label: 'Cut the parts', href: '/make/output', id: 'say' }] : [];
    if (this.page === '/make/output') return this.layers.job.phase === 'done' ? [{ label: 'Put it together', href: '/make/assemble', id: 'say' }] : [{ label: 'Add the sheets to the cut queue', id: 'queue' }, 'Play the whole run', { label: 'Put it together', href: '/make/assemble', id: 'say' }];
    if (this.page === '/capture') return this.capture.done ? ['Analyze it', 'Remove the wall and shadows, then analyze'] : [];
    if (this.currentStep) return guide[this.currentStep].chips;
    // the "what are we making" starters belong to Home and Crafts only
    return this.page === '/workshop' || this.page === '/crafts' || this.page === '' ? WORKSHOP_CHIPS : [];
  }

  /** the page the studio is on (the layout sets it): suggestions and chat routing depend on it */
  page = $state('');
  /** Phones show the assistant as a sheet over the work area. */
  sheetOpen = $state(false);
  toggleSheet() { this.sheetOpen = !this.sheetOpen; }

  /** The studio shows one right panel at a time: the Katachi chat or the editor's properties. */
  toggleChat() { this.chatOpen = !this.chatOpen; if (this.chatOpen) this.propsOpen = false; }
  setDensity(d: 'comfortable' | 'compact') { vibe.density = d; }
  toggleProps() { this.propsOpen = !this.propsOpen; if (this.propsOpen) this.chatOpen = false; }
  setScreen(title: string, subtitle = '') { this.screen = { title, subtitle }; }

  /**
   * The composer (phone dock or studio chat panel). On Home or Crafts, what you say starts a craft (returns where to go);
   * on a craft step it is a refinement note for that step (and the selected layer), saved with the craft.
   */
  /** Capture's chat: the photo is analyzed (as the Analyze button does) with the instruction applied first */
  async analyzeFromChat(text: string): Promise<string | null> {
    const c = this.flow.conversation;
    c.ingestTranscript(text);
    if (!this.capture.done) { c.say(this.capture.media.length ? 'Add the rest of the photos first, then I’ll analyze them.' : 'Add a photo first (snap, upload or sketch it), then I’ll analyze it.'); return null; }
    await this.startFromCaptureMedia();
    if (BACKDROP_ASK.test(text)) { this.layers.removeBackdrop = true; this.layers.addNote({ step: 'Layers', text }); c.say('Analyzing — I’ll remove the wall and shadows as I trace the outline.'); }
    else if (!/^(analy[sz]e|go|start|continue|yes|ok)\b/i.test(text)) { this.layers.addNote({ step: 'Layers', text }); c.say('Analyzing — your note is kept with the craft.'); }
    this.save();
    return this.resumePath;
  }
  // ── Quoting: a layer or an earlier message rides along with the next thing said (a card above the composer)
  quote = $state<Quote | null>(null);
  quoteLayer(n: number) {
    const l = this.layers.layers[n - 1]; if (!l) return;
    this.layers.selectLayer(n);
    this.quote = { kind: 'layer', n, label: l.name, colour: l.colour, d: this.layers.overlayForLayer(n)?.d, image: this.stageImage || undefined };
  }
  quoteMessage(text: string) { const t = text.trim(); if (t) this.quote = { kind: 'message', label: 'Katachi said', text: t.length > 160 ? `${t.slice(0, 157)}…` : t }; }
  clearQuote() { this.quote = null; }
  private layerQuote(n: number): Quote | null {
    const l = this.layers.layers[n - 1]; if (!l) return null;
    return { kind: 'layer', n, label: l.name, colour: l.colour, d: this.layers.overlayForLayer(n)?.d, image: this.stageImage || undefined };
  }

  async ask(text: string, path = '/workshop'): Promise<string | null> {
    const t = text.trim();
    if (!t) return null;
    if (path === '/workshop' || path === '/crafts') return this.startCraft(t);
    const step = journeyStepFor(path);
    const quote = this.quote; this.quote = null;
    // Capture: with a photo in, anything said is "analyze it" — with what was asked applied (remove the wall…)
    if (path === '/capture') return this.analyzeFromChat(t);
    // Cut: "play the whole run" / "start cutting" runs every pass, said in the chat
    if (path === '/make/output' && /\b(play|run|start cutting|cut (them|it|all)|simulate)\b/i.test(t)) { this.flow.conversation.ingestTranscript(t); void this.playRun(); return null; }
    if (step && this.project) {
      await this.refine(t, path, quote);
      // a change to the breakdown (background, layer count, a layer's mask) is seen on Layers: go there
      const breakdown = BACKDROP_ASK.test(t) || /\b\d{1,2}\s+(colour |color )?layers\b/i.test(t) || Boolean(parseLayerOp(t));
      return breakdown && !/^\/make\/(layers|gaps)$/.test(path) && this.canVisit('layers') && this.layers.kind !== '3d' ? '/make/layers' : null;
    }
    if (await this.flow.runCommand(t)) return null;
    this.flow.conversation.ingestTranscript(t);
    await this.flow.analyse();
    return null;
  }
  /** Plain chat commands the app can apply itself, right now (drop/keep a region, merge/duplicate/split, solid/open). */
  private applyChatCommand(text: string): string | null {
    const f = this.layers, n = f.history.length;
    f.checkpoint(text);
    const done = this.chatCommand(text);
    // nothing changed: no undo step for it
    if (!done && f.history.length > n) f.history = f.history.slice(0, n);
    return done;
  }
  private chatCommand(text: string): string | null {
    const f = this.layers, t = text.toLowerCase();
    const region = f.regions.find((r) => t.includes(r.name.toLowerCase()));
    // the verb, not a word of the region's own name ("Swirl drop left")
    const verb = region ? t.replace(region.name.toLowerCase(), ' ') : t;
    if (region && /\b(merge|combine|join)\b/.test(verb)) { /* a stack edit: handled below */ }
    else if (region && /\b(drop|remove|exclude|hide|without)\b/.test(verb)) { f.keep[region.id] = false; return `dropped ${region.name} — ${f.kept.length} of ${f.regions.length} regions kept (${f.keptPct}%)`; }
    else if (region && /\b(keep|include|add|restore|back)\b/.test(verb)) { f.keep[region.id] = true; return `kept ${region.name} — ${f.kept.length} of ${f.regions.length} regions kept (${f.keptPct}%)`; }
    const sel = f.selected;
    // "merge the gold and the red layers" / "merge white with black": two layers named
    const named = /\b(merge|combine|join)\b/.test(t) ? this.namedLayers(t) : [];
    if (named.length >= 2) { const label = named.length > 2 ? `${named.length} layers (${named.map((l) => l.name).join(', ')})` : `${named[0].name} and ${named[1].name}`; f.mergeMany(named.map((l) => l.n)); return `merged ${label} — now ${f.layers.length} layers`; }
    if (sel && /\bmerge\b/.test(t) && f.canMergeDown(sel.n)) { const name = sel.name; f.mergeDown(sel.n); return `merged ${name} down — now ${f.layers.length} layers`; }
    if (sel && /\bduplicate\b/.test(t)) { f.duplicate(sel.n); return `duplicated ${sel.name} — now ${f.layers.length} layers`; }
    if (sel && /\bsplit\b/.test(t) && f.canSplit(sel.n)) { const name = sel.name; f.split(sel.n); return `split ${name} — now ${f.layers.length} layers`; }
    if (sel && /\b(solid|fill)\b/.test(t)) { f.overrides = { ...f.overrides, [sel.n]: true }; return `${sel.name} will be cut solid`; }
    if (sel && /\b(open|leave|hollow)\b/.test(t)) { f.overrides = { ...f.overrides, [sel.n]: false }; return `${sel.name} will be left open with a glue lip`; }
    return null;
  }
  /**
   * Stack edits said in the chat, applied before anything is read as a mask correction:
   * "remove the 0% layers" / "delete the empty layers", "delete this layer", "remove the X and Y layers",
   * "merge all the engravings into one layer". Returns what was done, or null.
   */
  stackCommand(text: string, quoted?: number): { title: string; detail?: string } | null {
    const f = this.layers, t = text.toLowerCase();
    if (!f.layers.length) return null;
    const removing = /\b(remove|delete|drop|get rid of|discard)\b/.test(t);
    // the layers nothing of shows (0% visible): they only repeat what is already there
    if (removing && /(\b0\s*%|\bzero\b|\bempty\b|nothing (shows|visible)|not visible|invisible|no visible)/.test(t)) {
      const empty = f.layers.filter((l) => Math.round(l.visiblePct) <= 0 && (l.n > 1 || f.separateItems || l.role)).map((l) => l.n);
      if (!empty.length) return { title: 'No empty layers', detail: 'Every layer has something that shows.' };
      const names = empty.map((n) => f.layers[n - 1].name);
      f.checkpoint(text); f.removeLayers(empty);
      return { title: `Deleted ${names.length} empty layer${names.length > 1 ? 's' : ''}`, detail: `${names.join(', ')} · now ${f.layers.length} layers` };
    }
    // "merge all the engravings (into one layer)" / "combine all the gold layers"
    const all = /\b(merge|combine|join)\b.*?\ball\s+(?:of\s+)?(?:the\s+)?([a-z]+)/.exec(t);
    if (all) {
      const word = all[2].replace(/(ings?|s)$/, ''), stem = word.slice(0, Math.max(4, Math.min(6, word.length)));
      const ns = f.layers.filter((l) => (stem.startsWith('engrav') && l.role === 'engrave') || (stem.startsWith('cut') && l.role === 'cut') || l.name.toLowerCase().includes(stem)).map((l) => l.n);
      // separate items: one engraving per item, so each still sits on its own straightened sheet
      const byItem = f.separateItems ? Object.values(Object.groupBy(ns.map((n) => f.layers[n - 1]), (l) => l.itemName ?? '')).filter((g) => (g?.length ?? 0) > 1) : [];
      if (byItem.length) {
        f.checkpoint(text);
        let k = 0;
        // merge the frontmost group first, so the earlier groups keep their positions
        for (const g of byItem.reverse()) { const names = g!.map((l) => l.name); const item = g![0].itemName; const cur = f.layers.filter((l) => names.includes(l.name)).map((l) => l.n); k += f.mergeMany(cur, item ? `${item} · engraving` : undefined); }
        return { title: `Merged ${k} layers: one ${all[2].replace(/s$/, '')} per item`, detail: `now ${f.layers.length} layers · each item’s engraving stays on its own sheet · split one to undo` };
      }
      if (ns.length >= 2) { f.checkpoint(text); const k = f.mergeMany(ns, `All ${all[2]}`); return { title: `Merged ${k} layers into one`, detail: `“All ${all[2]}” · now ${f.layers.length} layers · split it to undo` }; }
      if (ns.length < 2 && /layers?\b/.test(t) && !/\b(engrav|cut)/.test(stem)) {
        // "merge all layers": everything into one
        if (all[2] === 'layer' || all[2] === 'layers') { f.checkpoint(text); const k = f.mergeMany(f.layers.map((l) => l.n)); return { title: `Merged all ${k} layers into one` }; }
      }
      return { title: `Nothing to merge`, detail: `I found ${ns.length} layer${ns.length === 1 ? '' : 's'} matching “${all[2]}”.` };
    }
    if (removing && /\blayers?\b/.test(t)) {
      // "delete this layer" (quoted / selected), or the layers it names
      if (/\b(this|that)\s+layer\b/.test(t)) { const n = quoted ?? f.selected.n; const name = f.layers[n - 1]?.name; if (!name) return null; f.checkpoint(text); f.removeLayers([n]); return { title: `Deleted ${name}`, detail: `now ${f.layers.length} layers` }; }
      // only a whole-layer delete when the text is about layers, not parts of one ("remove the wall from the gold layer")
      if (!/\bfrom\b/.test(t)) {
        const named = this.namedLayers(t);
        if (named.length) { const names = named.map((l) => l.name); f.checkpoint(text); f.removeLayers(named.map((l) => l.n)); return { title: `Deleted ${names.length > 1 ? `${names.length} layers` : names[0]}`, detail: `${names.length > 1 ? `${names.join(', ')} · ` : ''}now ${f.layers.length} layers` }; }
      }
    }
    return null;
  }
  /** Undo the last edit to the layers (chat “undo” or the Undo button), said in the chat */
  undoLast({ echo = true } = {}) {
    const f = this.layers, c = this.flow.conversation;
    if (echo) c.ingestTranscript('Undo');
    if (this.engineOn) { const e = this.actions.undo(); if (e) this.writeBack(); return Boolean(e); }
    // kits (until L3): the older snapshots
    const what = f.undo(), key = `${this.project?.id ?? 'craft'}:undo:${c.log.length}`;
    if (!what) { c.done(key, 'Nothing to undo', { detail: 'Edits made in this session can be undone, one at a time.' }); return false; }
    this.save();
    c.done(key, `Undone: ${what}`, { detail: `${f.layers.length} layers${f.canUndo ? ` · ${f.history.length} more to undo` : ''}` });
    return true;
  }
  get canUndo() { return this.engineOn ? this.actions.canUndo : this.layers.canUndo; }
  get canRedo() { return this.engineOn && this.actions.canRedo; }
  get undoLabel() { return this.engineOn ? this.actions.lastLabel : this.layers.history.at(-1)?.label; }

  /** the layers a text names ("the gold and the red layers"), back to front */
  namedLayers(text: string) {
    const t = text.toLowerCase(), f = this.layers;
    // by number: "layer 3", "layers 2 and 5", "layers 2, 3, 4", "layers 2-4" / "2 to 4", "#3"
    const nums: number[] = [];
    for (const m of t.matchAll(/\blayers?\s+((?:#?\d{1,2}\s*(?:,|and|&|to|through|-|–)?\s*)+)/g)) {
      const part = m[1];
      for (const r of part.matchAll(/(\d{1,2})\s*(?:-|–|to|through)\s*(\d{1,2})/g)) for (let k = Number(r[1]); k <= Number(r[2]); k++) nums.push(k);
      for (const d of part.replace(/(\d{1,2})\s*(?:-|–|to|through)\s*(\d{1,2})/g, '').matchAll(/\d{1,2}/g)) nums.push(Number(d[0]));
    }
    for (const m of t.matchAll(/#(\d{1,2})\b/g)) nums.push(Number(m[1]));
    const byNumber = f.layers.filter((l) => nums.includes(l.n));
    if (byNumber.length) return byNumber;
    // by name: a layer whose whole name is said wins over ones that only share a word ("left", "drop")
    const flat = t.replace(/\s+/g, ' ');
    const said = (l: { name: string; role?: string }) => { const full = l.name.toLowerCase().replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ').trim(), base = l.name.toLowerCase().split('·')[0].trim();
      // "the swirl drop left" names the item's cut; its engraving only when said ("… engraving")
      return flat.includes(full) || (l.role !== 'engrave' && base.length > 3 && flat.includes(base)); };
    const whole = f.layers.filter(said);
    if (whole.length) return whole;
    const stop = ['the', 'and', 'layer', 'layers', 'cut', 'left', 'right', 'top', 'bottom', 'with', 'into', 'one'];
    const words = (l: { name: string }) => l.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !stop.includes(w));
    const all = f.layers.filter((l) => words(l).length && words(l).every((w) => new RegExp(`\\b${w}\\b`).test(t)));
    if (all.length) return all;
    return this.layers.layers.filter((l) => l.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !['the', 'and', 'layer'].includes(w)).some((w) => new RegExp(`\\b${w}\\b`).test(t)));
  }
  /** The layer a correction is about: one named in the text ("the white layer…"), else the selected one. */
  layerFor(text: string) {
    const t = text.toLowerCase(), f = this.layers;
    const named = f.layers.find((l) => l.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3).some((w) => new RegExp(`\\b${w}\\b`).test(t)));
    return named ?? (f.selected.n > 0 ? f.selected : undefined);
  }
  /** Correct one layer from the chat or the layer's own feedback box: re-measured from the photo, saved, said in the chat. */
  async refineLayer(n: number, text: string, { echo = true, op, show = true }: { echo?: boolean; op?: LayerOp; /** switch the stage to this layer on its own (not during the automatic passes) */ show?: boolean } = {}): Promise<boolean> {
    const f = this.layers, craft = this.project?.id;
    const layer = f.layers[n - 1];
    const region = f.regionForLayer(layer);
    if (!craft || !layer || !region?.paths?.length) return false;
    if (echo) this.flow.conversation.ingestTranscript(text, this.layerQuote(n));
    const c = this.flow.conversation, key = `${craft}:refine:${n}:${c.log.length}`;
    c.think(key, `Correcting ${layer.name}`, { job: 'layers.refine', thought: 'Code re-measures this layer’s mask from your photo; the other layers stay as they are.' });
    c.work(key);
    // the layer's own name words are how it was addressed, not what to change ("the white layer is missing the whiskers")
    const ask = layer.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3).reduce((acc, w) => acc.replace(new RegExp(`\\b${w}\\b`, 'gi'), ''), text);
    // what lies in front of it: the later layers of the same item (separate items never cover each other's sheets)
    const front = f.layers.slice(n).filter((l) => !layer.itemName || l.itemName === layer.itemName).flatMap((l) => f.regionForLayer(l)?.paths ?? []);
    const r = await this.muse.refineLayer(craft, { imageDataUrl: this.photo, subjectPaths: f.subjectPaths, colours: f.layers.map((l) => l.colour), index: n - 1, current: region.paths, front, text: ask, name: `${layer.name}`, op }).catch(() => null);
    f.addNote({ step: 'Layers', layer: `${layer.name}`, text });
    if (!r) { this.save(); c.done(key, `Noted for ${layer.name}`, { detail: 'I can apply “keep the fine details”, “bolder”, “thinner”, “smoother”, “take the wall out”, or “add/remove the <colour> parts” right away; anything else is saved with the craft.' }); return false; }
    f.checkpoint(`${layer.name}: ${text}`);
    f.regionList = f.regionList.map((x) => (x.id === region.id ? { ...x, paths: r.visiblePaths, cutPaths: r.sheetPaths, pct: r.visiblePct, hiddenPct: r.hiddenPct } : x));
    f.stack = f.stack.map((l) => (l.n === n ? { ...l, visiblePct: r.visiblePct, hiddenPct: r.hiddenPct, ...(op?.kind === 'tune' ? { tune: { detail: op.detail, weight: op.weight } } : {}) } : l));
    f.sheetPaths = [];
    this.save();
    // show the change: the layer on its own, its whole sheet in its colour
    const shown = show && (f.view === 'all' || f.view === 'exploded');
    if (shown) { f.selectLayer(n); f.setView('only'); }
    c.done(key, `Done — ${layer.name}: ${r.describe}`, { detail: `Now ${r.visiblePct}% shows · saved with the craft${shown ? ' · showing this layer on its own (All layers on the toolbar shows the stack)' : ''}`, swatches: [{ hex: layer.colour, label: layer.name, n }] });
    return true;
  }
  /**
   * The layer toolbar and the work-area tools. Everything goes through the chat: what was asked is said first
   * (with the layer quoted), then applied, and the result lands as a step in the timeline.
   */
  async layerAction(n: number, a: LayerAction): Promise<void> {
    const f = this.layers, layer = f.layers[n - 1];
    if (!layer) return;
    const name = layer.name, c = this.flow.conversation;
    const said: Record<LayerAction['kind'], string> = {
      hide: 'Hide this layer', show: 'Show this layer', only: 'Show only this layer', duplicate: 'Duplicate this layer', merge: 'Merge this layer down', split: 'Split this layer into its pieces',
      mergeWith: a.kind === 'mergeWith' ? `Merge this layer with ${f.layers[a.other - 1]?.name ?? 'another layer'}` : '',
      tune: a.kind === 'tune' ? `Detail ${a.detail} of 5 · weight ${a.weight > 0 ? `+${a.weight}` : a.weight}` : '',
      shape: a.kind === 'shape' ? `${a.mode === 'add' ? 'Add' : 'Cut out'} a ${a.shape.type}` : '',
      smoothArea: a.kind === 'smoothArea' ? (a.strength >= 3 ? 'Reduce the jitter in this area' : 'Smooth the curves in this area') : '',
      move: a.kind === 'move' ? 'Move this layer' : '', remove: 'Delete this layer'
    };
    const viaRefine = a.kind === 'tune' || a.kind === 'shape' || a.kind === 'smoothArea';
    if (!viaRefine) c.ingestTranscript(said[a.kind], this.layerQuote(n));
    const key = `${this.project?.id ?? 'craft'}:act:${n}:${c.log.length}`;
    const done = (title: string, detail?: string) => { this.save(); c.done(key, title, { detail }); };
    // the stack's own edits run as actions (one history with the chat)
    if (this.engineOn && a.kind === 'split') { await this.act('split', [{ n }]); return; }
    if (this.engineOn && (a.kind === 'remove' || a.kind === 'duplicate' || a.kind === 'mergeWith' || a.kind === 'merge')) {
      if (a.kind === 'merge' && !f.canMergeDown(n)) return done(`${name} is already the front layer`);
      const refs = a.kind === 'mergeWith' ? [{ n }, { n: a.other }] : a.kind === 'merge' ? [{ n }, { n: n + 1 }] : [{ n }];
      await this.act(a.kind === 'remove' ? 'delete' : a.kind === 'duplicate' ? 'duplicate' : 'merge', refs);
      return;
    }
    if (['mergeWith', 'duplicate', 'merge', 'split', 'move', 'remove'].includes(a.kind)) f.checkpoint(`${said[a.kind].replace('this layer', name)}`);
    switch (a.kind) {
      case 'hide': case 'show': if (f.isLayerVisible(n) === (a.kind === 'hide')) f.toggleLayerVisible(n); return done(`${a.kind === 'hide' ? 'Hidden' : 'Showing'} · ${name}`, a.kind === 'hide' ? 'Still cut on Sheets; show it again from the list.' : undefined);
      case 'only': if (!f.isLayerVisible(n)) f.toggleLayerVisible(n); f.selectLayer(n); f.setView('only'); return done(`Showing only ${name}`, 'Switch the view back to All layers on the toolbar.');
      case 'mergeWith': {
        const other = f.layers[a.other - 1];
        if (!other || !f.canMerge(n, a.other)) return done(`Nothing to merge ${name} with`);
        f.mergeLayers(n, a.other); f.sheetPaths = [];
        return done(`Merged ${name} with ${other.name}`, `now ${f.layers.length} layers · split it to undo`);
      }
      case 'remove': f.removeLayers([n]); return done(`Deleted ${name}`, `now ${f.layers.length} layer${f.layers.length === 1 ? '' : 's'} · its mask stays with the photo`);
      case 'duplicate': f.duplicate(n); return done(`Duplicated ${name}`, `now ${f.layers.length} layers`);
      case 'merge': if (!f.canMergeDown(n)) return done(`${name} is already the front layer`); f.mergeDown(n); f.sheetPaths = []; return done(`Merged ${name} down`, `now ${f.layers.length} layers`);
      case 'split': if (!f.canSplit(n)) return done(`${name} is one piece`, 'Nothing to split.'); f.split(n); return done(`Split ${name}`, `now ${f.layers.length} layers`);
      case 'move': {
        const region = f.regionForLayer(layer);
        if (!region?.paths?.length) return done(`${name} has no mask to move yet`);
        f.regionList = f.regionList.map((x) => (x.id === region.id ? { ...x, paths: translatePaths(x.paths ?? [], a.dx, a.dy), cutPaths: x.cutPaths ? translatePaths(x.cutPaths, a.dx, a.dy) : x.cutPaths, holes: x.holes ? translatePaths(x.holes, a.dx, a.dy) : x.holes } : x));
        f.sheetPaths = [];
        return done(`Moved ${name}`, `${Math.round(a.dx / 10)}% across, ${Math.round(a.dy / 10)}% down`);
      }
      default: {
        const op: LayerOp = a.kind === 'tune' ? { kind: 'tune', detail: a.detail, weight: a.weight } : a.kind === 'shape' ? { kind: 'shape', shape: a.shape, mode: a.mode } : { kind: 'smoothArea', box: a.box, strength: a.strength };
        if (!f.regionForLayer(layer)?.paths?.length) { c.ingestTranscript(said[a.kind], this.layerQuote(n)); return done(`${name} has no mask to edit yet`); }
        await this.refineLayer(n, said[a.kind], { op });
      }
    }
  }
  /** the selected layer's outline as one SVG path, for the work area */
  layerPath(n: number) { const r = this.layers.regionForLayer(this.layers.layers[n - 1]); return (r?.paths ?? []).map(pointsToPath).join(''); }
  /** Spark's reading of a free-text correction, applied by code; when it is only a note, it is kept as one */
  private async interpretAndApply(n: number, text: string, path: string, step: string, layerLabel: string | undefined) {
    const f = this.layers, layer = f.layers[n - 1], craft = this.project!.id;
    const c = this.flow.conversation, key = `${craft}:read:${c.log.length}`;
    c.think(key, `Reading what you asked for ${layer.name}`, { job: 'layers.refine' });
    const a = await this.muse.interpretLayer(craft, { text, layer: layer.name, layers: f.layers.filter((l) => l.n !== n).map((l) => l.name) }).catch(() => null);
    if (!a || a.op === 'none') {
      // not a mask edit: a stack edit (merge, split, duplicate, solid/open) applies now, anything else is a note
      const applied = this.applyChatCommand(text);
      if (applied) { this.save(); c.done(key, `Done — ${applied}`, { detail: 'Saved with the craft.' }); return; }
      f.addNote({ step, ...(layerLabel ? { layer: layerLabel } : {}), text }); this.save();
      c.done(key, `Noted for ${layer.name}`, { detail: 'Not a change I can make to the layer yet — kept with the craft and listed when you assemble. Try “one solid outline”, “keep the fine details”, “bolder” or “merge with the red layer”.' });
      return;
    }
    c.done(key, a.reply || `Understood: ${a.op.replace('-', ' ')}`);
    if (a.op === 'merge') {
      const other = f.layers.find((l) => l.n !== n && a.other && l.name.toLowerCase().includes(a.other.toLowerCase().split(/\s+/)[0]));
      if (!other) { c.fail(`${key}:m`, `Which layer should ${layer.name} merge with?`, 'Name it, or use Merge with… on the layer.'); return; }
      const label = `${layer.name} with ${other.name}`;
      f.checkpoint(`Merge ${label}`); f.mergeLayers(n, other.n); f.sheetPaths = []; this.save();
      c.done(`${key}:m`, `Merged ${label}`, { detail: `now ${f.layers.length} layers · split it to undo` });
      return;
    }
    const op: LayerOp | null = a.op === 'remove-backdrop' ? { kind: 'remove', backdrop: true }
      : a.op === 'remove-colour' || a.op === 'add-colour' ? parseLayerOp(`${a.op === 'add-colour' ? 'add' : 'remove'} the ${a.colour}`)
      : (['fill', 'detail', 'bolder', 'thinner', 'smoother'] as const).includes(a.op as 'fill') ? { kind: a.op as 'fill' } : null;
    if (!op) { c.fail(`${key}:x`, `I can’t apply “${a.op}” to this layer yet`, 'Kept as a note.'); f.addNote({ step, text }); return; }
    void path;
    await this.refineLayer(n, text, { echo: false, op });
  }
  /** A chat refinement on a craft step: applied at once when it is a plain command, else noted against the step/layer. */
  /** returns the work it started (the chat need not wait; tests and recipes can) */
  refine(text: string, path: string, quote: Quote | null = null): Promise<unknown> | void {
    const step = journeyStepFor(path)?.label ?? 'Craft';
    const quoted = quote?.kind === 'layer' && quote.n ? this.layers.layers[quote.n - 1] : undefined;
    if (quoted) this.layers.selectLayer(quoted.n);
    const layer = /^\/make\/(layers|gaps)$/.test(path) && this.layers.selected.n > 0 ? this.layers.selected.name : undefined;
    // "undo" / "undo that" / "go back": the last edit is put back
    if (/^\s*(undo|undo (that|it|the last( change| edit)?)|go back|revert( that)?|put it back)\s*[.!]?\s*$/i.test(text)) { this.flow.conversation.ingestTranscript(text, quote); this.undoLast({ echo: false }); return; }
    // redo / again / one plain action with its layers (design/14 §7): the actions, no model
    const said = this.engineOn && /^\/make\/(layers|gaps|output)$/.test(path) && !BACKDROP_ASK.test(text) ? fastPath(text, this.craft.doc) : null;
    if (said && !(said.kind === 'calls' && said.calls[0].action === 'resize' && !this.layers.separateItems)) { this.flow.conversation.ingestTranscript(text, quote); return this.runSaid(said); }
    this.flow.conversation.ingestTranscript(text, quote);
    // several actions in one ask: planned together, before any one-verb branch takes just its first half
    if (this.engineOn && /^\/make\/(layers|gaps|output)$/.test(path) && manyActions(text)) {
      void this.planAndRun(text).then((done) => { if (done === true) return; if (done) this.flow.conversation.say(done.reply); else this.refineFallback(text, path, step, layer, { planned: true }); });
      return;
    }
    // "use 3 layers": regroup the whole picture's colours
    const count = /\b(\d{1,2})\s+(colour |color )?layers\b/i.exec(text);
    if (count && this.layers.regionList.length && this.engineOn && namesAStack(text)) {
      this.layers.addNote({ step, text });
      void this.planAndRun(text).then((done) => { if (done === true) return; this.flow.conversation.say(done ? done.reply : 'Say the layers back to front with their colours (“white base, black, red, white flowers, gold”).'); });
      return;
    }
    if (count && this.layers.regionList.length) {
      this.layers.layerPlan = null;
      const k = Math.max(2, Math.min(8, Number(count[1])));
      this.layers.addNote({ step, text });
      this.flow.conversation.say(`Regrouping the colours into ${k} layers.`);
      void this.rebuildFromShape({ k });
      return;
    }
    // "make it 300 mm wide" / "40 cm tall" / "scale to 50%": the real size, proportions kept
    const sizeAsk = /\b(\d+(?:\.\d+)?)\s*(mm|cm|in|inch(?:es)?)\b(?:\s*(wide|width|across|tall|high|height))?/i.exec(text);
    const pctAsk = /\bscale\b[^\d]*(\d+(?:\.\d+)?)\s*%/i.exec(text);
    if (((sizeAsk && /\b(make|scale|size|resize|wide|tall|high|across|should be|is)\b/i.test(text)) || pctAsk) && this.layers.pieceSize) {
      const now = this.layers.pieceSize;
      const unit = sizeAsk?.[2].toLowerCase() ?? 'mm';
      const mm = pctAsk ? (now.wMm * Number(pctAsk[1])) / 100 : Number(sizeAsk![1]) * (unit === 'cm' ? 10 : unit.startsWith('in') ? 25.4 : 1);
      this.setSize(mm, !pctAsk && /tall|high|height/i.test(sizeAsk?.[3] ?? '') ? 'h' : 'w', { say: false });
      return;
    }
    // stack edits (delete, delete the empty ones, merge all of a kind) apply at once
    const stack = /^\/make\/(layers|gaps|output)$/.test(path) ? this.stackCommand(text, quoted?.n) : null;
    if (stack) {
      const c = this.flow.conversation; this.save();
      c.done(`${this.project?.id ?? 'craft'}:stack:${c.log.length}`, stack.title, { detail: stack.detail });
      return;
    }
    // "straighten each bookmark / lay them out separately": separate items already are — say how
    if (this.layers.separateItems && this.engineOn && /\b(straighten|upright|tilt(ed)?|separate(ly)?|apart|own sheet|lay (them )?out)\b/i.test(text)) {
      return this.act('straighten', [{ all: true }], {}, 'chat').then(() => { this.layers.setView('cut'); this.save(); });
    }
    if (this.layers.separateItems && /\b(straighten|upright|rotat(e|ed|ion)|tilt(ed)?|separate(ly)?|apart|own sheet|lay (them )?out)\b/i.test(text)) {
      const c = this.flow.conversation, turns = this.itemTurns(), hidden = this.hiddenItems();
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- counted once, not reactive state
      c.done(`${this.project?.id ?? 'craft'}:layout:${c.log.length}`, `Each of the ${new Set(this.layers.layers.map((l) => l.itemName)).size} items is on its own sheet, upright`,
        { detail: `${turns.length ? `Turned: ${turns.join(', ')}.` : 'They were already upright.'} Its engraving turns with it. See it on “Its sheet”, in Cut and in the cut queue.${hidden.length ? ` Partly hidden in the photo: ${hidden.join(', ')} — say “complete the hidden edges of the ${hidden[0]}”.` : ''}` });
      this.layers.setView('cut'); this.save();
      return;
    }
    // "merge the gold and the red layers": two layers named — a stack edit, not a correction to one mask
    if (/\b(merge|combine|join)\b/i.test(text) && this.namedLayers(text).length >= 2) { this.refineFallback(text, path, step, layer); return; }
    // On Layers: a correction aimed at one layer (quoted, named, or "this layer") is applied to that layer's mask
    if (/^\/make\/(layers|gaps)$/.test(path) && this.layers.layers.length) {
      const target = quoted ?? this.layerFor(text);
      const aimed = Boolean(quoted) || /\b(this|that|the)\s+layer\b|\blayer\b/i.test(text) || (target && target.n !== this.layers.selected.n) || !BACKDROP_ASK.test(text);
      if (target && aimed) {
        const ask = target.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3).reduce((acc, w) => acc.replace(new RegExp(`\\b${w}\\b`, 'gi'), ''), text);
        const op = parseLayerOp(ask);
        const area = this.layers.area;
        if (op && this.layers.regionForLayer(target)?.paths?.length) { void this.refineLayer(target.n, text, { echo: false, op: op.kind === 'smoother' && area ? { kind: 'smoothArea', box: area, strength: /jitter|wobbl/i.test(text) ? 3 : 2 } : undefined }); return; }
        // free text the keywords do not cover: Muse Spark reads it as one edit, code applies it
        // an action the fast path couldn't read plainly (several steps, or layers named loosely): Spark plans it
        if (this.engineOn && ACTION_WORDS.test(text)) return this.planAndRun(text).then((done) => (done === true ? undefined : this.interpretAndApply(target.n, text, path, step, layer)));
        if (this.project && this.layers.regionForLayer(target)?.paths?.length) { void this.interpretAndApply(target.n, text, path, step, layer); return; }
        this.refineFallback(text, path, step, layer);
        return;
      }
    }
    if (BACKDROP_ASK.test(text)) {
      this.layers.removeBackdrop = true;
      this.layers.addNote({ step, text });
      this.save();
      this.flow.conversation.say('On it — removing the background harder (the wall, its texture and shadows, props at the edges) and rebuilding the layers from it.');
      void this.rebuildFromShape();
      return;
    }
    this.refineFallback(text, path, step, layer);
  }
  private refineFallback(text: string, path: string, step: string, layer: string | undefined, o: { planned?: boolean } = {}) {
    void path;
    const applied = this.applyChatCommand(text);
    if (applied) { this.save(); this.flow.conversation.say(`Done — ${applied}. Saved with the craft.`); return; }
    // anything the fixed phrases don't cover: Muse Spark reads what was meant and picks the actions (never just "noted")
    if (!o.planned && this.project) {
      void this.planAndRun(text).then((done) => {
        if (done === true) return;
        if (done) { this.flow.conversation.say(done.reply); return; }
        this.refineFallback(text, path, step, layer, { planned: true });
      });
      return;
    }
    const note = { step, ...(layer ? { layer } : {}), text };
    this.layers.addNote(note);
    const c = this.flow.conversation, key = `${this.project?.id ?? 'craft'}:note:${c.log.length}`;
    c.think(key, `Noted for ${layer ?? step}`, { job: 'layers.refine' });
    const finish = () => c.done(key, `Noted for ${layer ?? step}`, { detail: 'Saved with the craft and listed when you assemble. Try “bolder”, “keep the fine details”, “one solid outline” or “merge the gold and red layers” to change it now.' });
    if (this.project) void this.muse.applyRefinement(this.project.id, note).then(finish, finish); else finish();
  }
}
