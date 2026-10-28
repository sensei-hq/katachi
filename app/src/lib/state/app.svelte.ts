import { vibe } from '@rokkit/states';
import { FlowState } from './flow.svelte';
import type { ChatAction, ModelCall } from './conversation.svelte';
import type { Snippet } from 'svelte';
import { devices, guide, steps, type DeviceId, type StepId } from '../content/layers';
import { journey, journeyIndexOf, journeyStepFor, starts, type Start, type StartId } from '../content/journey';
import { assemblySteps, type AssemblyStep } from '../domain/assembly';
import { agentJobs, jobsOnVisit } from '../content/agents';
import { MuseAgents } from './muse.svelte';

type FlowPage = StepId | 'views' | 'reference';
const flowPath = (id: FlowPage) => `/make/${id}`;
const browserStore = () => new ProjectStore(typeof globalThis.localStorage?.getItem === 'function' ? globalThis.localStorage : undefined);

const WORKSHOP_CHIPS = ['A layered mountain picture', 'A birdhouse from six photos', 'Remix it with a moon'];
const DEVICE_KEY = 'katachi.device';
import { WatchState } from './watch.svelte';
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
    // every model call shows in the chat with its action and cost: live calls from the trace, craft jobs from MuseAgents
    this.flow.trace.onAdd = (e) => this.flow.conversation.logCall({ model: e.model, action: e.purpose.replace(/_/g, ' '), costUsd: e.costUsd, ms: e.latencyMs, status: 'live' });
    this.muse.onFinish = (t) => this.flow.conversation.logCall({ model: agentJobs[t.job].model, action: t.summary, costUsd: t.costUsd ?? 0, ms: t.ms ?? 0,
      status: t.status === 'failed' ? 'failed' : t.status === 'done' ? 'live' : 'placeholder' });
    const d = store.getSetting(DEVICE_KEY) as DeviceId | null;
    if (d) this.defaultDevice = d;
    const id = store.current();
    const saved = id ? store.load(id) : null;
    if (saved) this.apply(saved);
  }
  /** The invite code is the user_id (demo-grade identity): crafts live under that user's storage namespace. */
  userId = $state('guest');
  bindUser(userId: string | null | undefined) {
    if (!userId || userId === this.userId) return;
    this.userId = userId;
    this.session.userId = userId;
    this.store.setUserId(userId);
    this.projects = this.store.list();
    const d = this.store.getSetting(DEVICE_KEY) as DeviceId | null;
    if (d) this.defaultDevice = d;
    const id = this.store.current();
    const saved = id ? this.store.load(id) : null;
    this.project = null;
    if (saved) this.apply(saved);
  }
  private apply(p: ProjectRecord) {
    this.instructions = null;
    this.watch.reset();
    this.layers.restore({ ...LayerFlowState.defaults(), ...p.choices });
    this.project = p;
  }
  /** The best image for the stage views: the in-session capture, else the saved thumbnail. */
  get stageImage() { return this.capture.media[0]?.url || this.project?.image || ''; }
  /** The project's name, or the example subject until something is captured. */
  get title() { return this.project?.name || this.layers.data.project; }
  newProject() {
    const now = Date.now();
    this.capture = new CaptureState();
    this.instructions = null;
    this.watch.reset();
    this.layers.restore(LayerFlowState.defaults());
    this.layers.setDevice(this.defaultDevice);
    this.project = { id: crypto.randomUUID(), name: '', createdAt: now, updatedAt: now, reached: -1, kind: 'flat', path: '/capture', image: '', choices: {}, status: 'draft' };
  }
  /** Home · a new craft from a starting point (or from what was said or typed): Capture opens set up for it. */
  startCraft(from: StartId | string, { heard = false } = {}): string {
    const picked = starts.find((s) => s.id === from);
    if (!heard && !picked) this.flow.conversation.ingestTranscript(from);
    this.newProject();
    const start: Start = picked ?? this.muse.classifyIntent(from, this.project!.id);
    this.project = { ...this.project!, kind: start.kind };
    this.layers.setKind(start.kind);
    this.capture.setMode(start.mode);
    this.capture.setSource(start.source);
    this.flow.conversation.say(start.say);
    return '/capture';
  }
  /** The first step: what was captured names the project and opens the flow (six sides go to the six-view step). */
  startFromCapture({ fileName, images, mode, at, prefix }: { fileName?: string; images: string[]; mode: 'single' | 'multi'; at?: Date; prefix?: string }) {
    if (!this.project) this.newProject();
    const p = this.project!;
    const kind = mode === 'multi' ? '3d' : p.kind === 'ref' ? 'ref' : 'flat';
    this.layers.setKind(kind);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a one-off timestamp for the name, not reactive state
    const when = at ?? new Date();
    this.project = { ...p, name: p.name || projectName({ fileName, at: when, prefix }), kind, image: images[0] ?? p.image,
      reached: Math.max(p.reached, 0), path: flowPath(mode === 'multi' ? 'views' : kind === 'ref' ? 'reference' : 'import') };
    this.save();
    void this.muse.describeCapture(p.id, kind, images[0]).then((r) => {
      if (r.brief) this.layers.applyBrief(r.brief); else this.layers.applySubject(r.subject);
      this.save();
      if (r.brief) this.flow.conversation.say(`I see ${r.brief.subject}. ${r.brief.regions.length} regions to work with: ${r.brief.regions.slice(0, 5).map((x) => x.label).join(', ')}. Next I’ll trace the outline from the photo.`);
    });
    if (this.capture.media.some((m) => m.source === 'sketch')) void this.muse.cleanSketch(p.id, images[0]);
  }
  /** Home · release the mic: what was heard starts a craft (returns where to go), or nothing was heard. */
  listenToStart(): string | null {
    this.flow.conversation.stopListening();
    const heard = this.flow.conversation.transcript.trim();
    return heard ? this.startCraft(heard, { heard: true }) : null;
  }
  /** Capture's Continue: the captured media start the craft (a small thumbnail is kept for the gallery). */
  async startFromCaptureMedia(fileName?: string) {
    const first = this.capture.media[0]?.url;
    const sketched = this.capture.media[0]?.source === 'sketch';
    this.startFromCapture({ fileName, images: first ? [await thumbnail(first)] : [], mode: this.capture.mode, prefix: sketched ? 'Sketch' : 'Photo' });
  }
  /** A step is open once the one before it has been reached; the branch screens once anything is captured. */
  canVisit(id: FlowPage) {
    const reached = this.project?.reached ?? -1;
    if (reached < 0) return false;
    if (id === 'views' || id === 'reference') return true;
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
  private runJobsFor(id: FlowPage) {
    const craft = this.project?.id;
    if (!craft || this.project?.example) return;
    for (const job of jobsOnVisit[id] ?? []) {
      if (this.muse.has(craft, job)) continue;
      // A reopened craft already carries its saved results: never re-run a job over them.
      const have: Partial<Record<string, boolean>> = {
        'shape.cutout': this.layers.cutoutChecks.length > 0 || this.layers.subjectPaths.length > 0,
        'shape.segment': this.layers.regionList.length > 0,
        'layers.plan': this.layers.stack.length > 0,
        'sheets.vectorise': this.layers.sheetPaths.length > 0
      };
      if (have[job]) continue;
      // each result is written into the flow state; the pages only ever read that state
      const f = this.layers;
      const image = this.project?.image || undefined;
      if (job === 'shape.cutout') void this.muse.cutout(craft, { imageDataUrl: image, subjectPrompt: f.imageBrief?.subjectPrompt }).then((r) => { f.applyCutout(r); if (r.paths?.length) this.flow.conversation.say(`Outline traced on your photo: ${r.paths.length} closed path${r.paths.length > 1 ? 's' : ''} around the ${f.outline.shape}. Next, I’ll split it into regions.`); });
      else if (job === 'shape.segment') void this.muse.segment(craft, { imageDataUrl: image, briefRegions: f.imageBrief?.regions, brief: f.imageBrief }).then((r) => { f.applyRegions(r); this.flow.conversation.say(`Split into ${f.regions.length} regions: ${f.regions.slice(0, 6).map((x) => `${x.name} ${x.pct}%`).join(', ')}. ${f.kept.length} kept. Toggle any, or tell me which to drop.`); });
      else if (job === 'layers.plan') void this.muse.planLayers(craft, f.makeAs, { imageDataUrl: image, description: f.brief || f.subject, regions: f.regions, brief: f.imageBrief }).then((r) => { f.applyLayers(r); this.flow.conversation.say(`Planned ${f.layers.length} layers, back to front: ${f.layers.map((l) => l.name).join(' · ')}. Pick one to inspect, or tell me to merge or split it.`); });
      else if (job === 'layers.imagineGaps') void this.muse.imagineGaps(craft, image);
      else if (job === 'layers.unfold') void this.muse.unfold(craft).then((r) => f.applyParts(r));
      else if (job === 'sheets.vectorise') void this.muse.vectorise(craft, f.layers.length, { regions: f.regions, sizeMm: f.outline.sizeMm, layers: f.layers }).then((r) => { f.applySheets(r.sheetsData); if (r.pathCount) this.flow.conversation.say(`Traced ${r.pathCount} closed paths across ${r.sheetsData.length} sheets (${r.sheetsData.reduce((a, s) => a + s.cutLengthMm, 0).toFixed(0)} mm of cut). Pick a device and send the first sheet.`); });
      else if (job === 'assemble.instructions') void this.muse.writeInstructions(craft, this.assembly).then((r) => { this.instructions = r; });
    }
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
  /** Burn Watch on a cut: the current sheet is sent first; any other cut is (re)watched from its clip. */
  watchCut(n: number) {
    if (n === this.layers.job.sheet && this.layers.job.phase === 'feed') this.sendSheet();
    else void this.watch.watchSheet(n);
  }
  /** Download .zip: the vectorised sheets (placeholder until sheets.vectorise is wired). */
  exportSheets() {
    if (!this.project) return;
    void this.muse.vectorise(this.project.id, this.layers.layers.length, { regions: this.layers.regions, sizeMm: this.layers.outline.sizeMm, layers: this.layers.layers }).then((r) => {
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
    const record: ProjectRecord = { ...$state.snapshot(p) as ProjectRecord, updatedAt: Date.now(), choices: this.layers.snapshot() };
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
  get assembly(): AssemblyStep[] { return this.instructions ?? assemblySteps({ kind: this.layers.kind, layers: this.layers.layers, set: this.layers.data, joinery: this.layers.joinery, multiple: this.layers.imageBrief?.arrangement === 'multiple-items' }); }
  /** Katachi's word on a step, from what the models found (falls back to the step's guide copy). */
  noteFor(id: StepId): string {
    const f = this.layers;
    switch (id) {
      case 'import': return f.imageBrief
        ? `Looks like ${f.subject} \u2014 ${f.imageBrief.class}, ${f.imageBrief.likelyMaterial}. I see ${f.imageBrief.regions.length} regions to cut: ${f.imageBrief.regions.slice(0, 5).map((r) => r.label).join(', ')}. Tell me what to make of it, or go on and I\u2019ll find the outline.`
        : `Looks like ${f.subject}. Tell me what to make of it, or go on and I\u2019ll find the outline.`;
      case 'cutout': return `Background removed and the outline found: a ${f.outline.shape}, about ${f.outline.shape === 'circle' ? '\u00d8 ' : ''}${f.outline.sizeMm} mm${f.subjectPaths.length ? `, traced as ${f.subjectPaths.length} closed path${f.subjectPaths.length > 1 ? 's' : ''} on your photo` : ''}. Check the edge, then I\u2019ll find the objects.`;
      case 'segment': return `I found ${f.regions.length} regions in your photo: ${f.regions.slice(0, 6).map((r) => `${r.name} ${r.pct}%`).join(', ')}. ${f.kept.length} kept (${f.keptPct}%). Toggle any region, or tell me \u201cdrop the ${f.kept[0]?.name ?? 'frame'}\u201d.`;
      case 'layers': return `${f.layers.length} layers, back to front: ${f.layers.map((l) => l.name).join(' \u00b7 ')}. Pick a layer to see what shows and what hides behind the ones in front \u2014 or tell me \u201cmerge ${f.selected.name} down\u201d.`;
      case 'gaps': return `${f.selected.name} is ${f.selected.hiddenPct}% hidden behind the layers in front. Across the stack you\u2019d use ${f.materialPct}% of ${f.layers.length} full sheets. Tell me \u201cmake ${f.selected.name} solid\u201d or \u201cleave ${f.selected.name} open\u201d, or pick a rule.`;
      case 'output': return f.sheetPaths.length
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
    this.flow.conversation.say(`Saved “${this.project.name}” to your crafts — layers, ${this.assembly.length} assembly steps and ${this.layers.notes.length} notes.`, [{ label: 'Open crafts', href: '/crafts' }]);
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
  get costPill() { return this.trace.label; }

  /** The Katachi assistant thread in Rokkit ChatMessage shape: greeting, then every entry of the conversation log. */
  get messages(): { id: string; role: 'user' | 'assistant'; text: string; data?: { actions?: ChatAction[]; call?: ModelCall } }[] {
    const log = [{ role: 'assistant' as const, text: 'Hi Dev — what are we making today?' }, ...this.flow.conversation.log];
    return log.map((e, i) => {
      const data = { ...('actions' in e && e.actions ? { actions: e.actions } : {}), ...('call' in e && e.call ? { call: e.call } : {}) };
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
    if (this.guidedSteps.includes(id)) return;
    this.guidedSteps = [...this.guidedSteps, id];
    const i = steps.findIndex((s) => s.id === id);
    const prev = steps[i - 1], next = steps[i + 1];
    this.flow.conversation.say(this.noteFor(id), [
      ...(prev ? [{ label: `Previous · ${prev.label}`, href: prev.path }] : []),
      ...(next ? [{ label: `Next · ${next.label}`, href: next.path }] : [])
    ]);
  }
  /** Suggestion chips for the composer: from the actual regions/layers when we have them, else the step's defaults. */
  get suggestions() {
    const f = this.layers;
    if (this.currentStep === 'segment' && f.regions.length) return [...f.kept.slice(0, 2).map((r) => `Drop the ${r.name}`), ...f.regions.filter((r) => !r.on).slice(0, 1).map((r) => `Keep the ${r.name}`), 'Separate into layers'];
    if (this.currentStep === 'layers' && f.layers.length) return [`Merge ${f.selected.name} down`, `Duplicate ${f.selected.name}`, `Split ${f.selected.name}`];
    if (this.currentStep === 'gaps') return [`Make ${f.selected.name} solid`, `Leave ${f.selected.name} open`, 'Imagine the hidden parts'];
    if (this.currentStep === 'assemble') return this.assembly.slice(0, 2).map((s) => s.title);
    return this.currentStep ? guide[this.currentStep].chips : WORKSHOP_CHIPS;
  }

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
  async ask(text: string, path = '/workshop'): Promise<string | null> {
    const t = text.trim();
    if (!t) return null;
    if (path === '/workshop' || path === '/crafts') return this.startCraft(t);
    const step = journeyStepFor(path);
    if (step && this.project) { this.refine(t, path); return null; }
    if (await this.flow.runCommand(t)) return null;
    this.flow.conversation.ingestTranscript(t);
    await this.flow.analyse();
    return null;
  }
  /** Plain chat commands the app can apply itself, right now (drop/keep a region, merge/duplicate/split, solid/open). */
  private applyChatCommand(text: string): string | null {
    const f = this.layers, t = text.toLowerCase();
    const region = f.regions.find((r) => t.includes(r.name.toLowerCase()));
    if (region && /\b(drop|remove|exclude|hide|without)\b/.test(t)) { f.keep[region.id] = false; return `dropped ${region.name} — ${f.kept.length} of ${f.regions.length} regions kept (${f.keptPct}%)`; }
    if (region && /\b(keep|include|add|restore|back)\b/.test(t)) { f.keep[region.id] = true; return `kept ${region.name} — ${f.kept.length} of ${f.regions.length} regions kept (${f.keptPct}%)`; }
    const sel = f.selected;
    if (sel && /\bmerge\b/.test(t) && f.canMergeDown(sel.n)) { const name = sel.name; f.mergeDown(sel.n); return `merged ${name} down — now ${f.layers.length} layers`; }
    if (sel && /\bduplicate\b/.test(t)) { f.duplicate(sel.n); return `duplicated ${sel.name} — now ${f.layers.length} layers`; }
    if (sel && /\bsplit\b/.test(t) && f.canSplit(sel.n)) { const name = sel.name; f.split(sel.n); return `split ${name} — now ${f.layers.length} layers`; }
    if (sel && /\b(solid|fill)\b/.test(t)) { f.overrides = { ...f.overrides, [sel.n]: true }; return `${sel.name} will be cut solid`; }
    if (sel && /\b(open|leave|hollow)\b/.test(t)) { f.overrides = { ...f.overrides, [sel.n]: false }; return `${sel.name} will be left open with a glue lip`; }
    return null;
  }
  /** A chat refinement on a craft step: applied at once when it is a plain command, else noted against the step/layer. */
  refine(text: string, path: string) {
    const step = journeyStepFor(path)?.label ?? 'Craft';
    const layer = /^\/make\/(layers|gaps)$/.test(path) && this.layers.selected.n > 0 ? `Layer ${this.layers.selected.n} · ${this.layers.selected.name}` : undefined;
    this.flow.conversation.ingestTranscript(text);
    const applied = this.applyChatCommand(text);
    if (applied) { this.save(); this.flow.conversation.say(`Done — ${applied}. Saved with the craft.`); return; }
    const note = { step, ...(layer ? { layer } : {}), text };
    this.layers.addNote(note);
    if (this.project) void this.muse.applyRefinement(this.project.id, note);
    this.flow.conversation.say(`Noted for ${layer ?? step}. It’s saved with the craft and listed when you assemble.`);
  }
}
