// State only: slots + transcript. Presentation renders from this; no fetching here in P1 shell.
/** a chat button: `href` navigates; id `say` also posts its label as what you said (suggestions go through the chat) */
export interface ChatAction { label: string; href?: string; id?: string }
/** A model or agent call shown in the chat: which model, what it did, what it cost (estimated for placeholders). */
export interface ModelCall { model: string; action: string; costUsd: number; ms: number; status: 'live' | 'placeholder' | 'failed' }
/** Something quoted into a message: a layer (with a small preview of its mask) or an earlier message. */
export interface Quote { kind: 'layer' | 'message'; label: string; text?: string; n?: number; d?: string; colour?: string; image?: string }
/** One thing Katachi does, shown in the timeline as it happens: thinking → working → done (or failed). */
export interface StepEntry { key: string; job?: string; status: 'thinking' | 'working' | 'done' | 'failed'; title: string; detail?: string; swatches?: { hex: string; label: string; /** the layer it stands for (quoting) */ n?: number }[]; calls: ModelCall[] }
/** a timeline row as the chat renders it (AppState.messages) */
export type TimelineMsg = { id: string; role: 'user' | 'assistant'; text: string; data?: { actions?: ChatAction[]; call?: ModelCall; step?: StepEntry; quote?: Quote } };
export interface LogEntry { role: 'user' | 'assistant'; text: string; actions?: ChatAction[]; call?: ModelCall; step?: StepEntry; quote?: Quote }
export interface Slots { intent?: string; qty?: number; material?: string; thicknessMm?: number; deviceId?: string; art?: string }
const NUMWORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export class ConversationState {
  listening = $state(false);
  partial = $state('');
  listenSec = $state(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  startListening() {
    this.listening = true; this.listenSec = 0;
    this.partial = 'I want to make a layered mountain picture for Maya…';
    this.timer = setInterval(() => { this.listenSec += 1; }, 1000);
  }
  stopListening() {
    this.listening = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.partial) this.ingestTranscript(this.partial.replace(/…$/, ''));
  }
  get listenLabel() { return `release to send · 0:${String(this.listenSec).padStart(2, '0')}`; }
  slots = $state<Slots>({});
  transcript = $state('');
  /** Every bot interaction: what you said and what Katachi replied, with optional actions. */
  log = $state<LogEntry[]>([]);
  ingestTranscript(text: string, quote?: Quote | null) {
    this.transcript = text;
    if (text.trim()) this.log = [...this.log, { role: 'user', text, ...(quote ? { quote } : {}) }];
    const t = text.toLowerCase();
    const qtyMatch = t.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    const thickMatch = t.match(/(\d+(?:\.\d+)?)\s*mm/);
    const material = ['birch','basswood','plywood','walnut','acrylic'].find(m => t.includes(m));
    const intent = ['coaster','ornament','box','holder','stand','sign'].find(m => t.includes(m));
    this.slots = { ...this.slots,
      ...(qtyMatch ? { qty: NUMWORDS[qtyMatch[1]] ?? Number(qtyMatch[1]) } : {}),
      ...(thickMatch ? { thicknessMm: Number(thickMatch[1]) } : {}),
      ...(material ? { material } : {}),
      ...(intent ? { intent: intent === 'coaster' ? 'coasters' : intent } : {}) };
  }
  /** post a model call into the thread: on the step it belongs to (same job, else the open one), else its own row */
  logCall(call: ModelCall, job?: string) {
    const open = (e: LogEntry) => e.step && (e.step.status === 'thinking' || e.step.status === 'working');
    let i = -1;
    for (let k = this.log.length - 1; k >= 0 && i < 0; k--) if (open(this.log[k]) && (!job || this.log[k].step!.job === job)) i = k;
    if (i < 0 && !job) for (let k = this.log.length - 1; k >= 0 && i < 0; k--) if (open(this.log[k])) i = k;
    if (i >= 0) { this.patchStep(this.log[i].step!.key, { calls: [...this.log[i].step!.calls, call] }); return; }
    this.log = [...this.log, { role: 'assistant', text: `${call.model} · ${call.action}`, call }];
  }
  // ── Steps: what Katachi is thinking about, doing and has done, updated in place
  private patchStep(key: string, patch: Partial<StepEntry>) {
    this.log = this.log.map((e) => (e.step?.key === key ? { ...e, text: patch.title ?? e.text, step: { ...e.step, ...patch } } : e));
  }
  stepOf(key: string) { return this.log.find((e) => e.step?.key === key)?.step; }
  /** a new step, thinking: `thought` says what it is about to do and why */
  think(key: string, title: string, { thought, job }: { thought?: string; job?: string } = {}) {
    if (this.stepOf(key)) { this.patchStep(key, { status: 'thinking', title, detail: thought, swatches: undefined, ...(job ? { job } : {}) }); return; }
    this.log = [...this.log, { role: 'assistant', text: title, step: { key, job, status: 'thinking', title, detail: thought, calls: [] } }];
  }
  /** the step's model / code work has started */
  work(key: string, title?: string, detail?: string) {
    if (!this.stepOf(key)) this.think(key, title ?? 'Working');
    this.patchStep(key, { status: 'working', ...(title ? { title } : {}), ...(detail !== undefined ? { detail } : {}) });
  }
  done(key: string, title: string, { detail, swatches }: { detail?: string; swatches?: StepEntry['swatches'] } = {}) {
    if (!this.stepOf(key)) this.think(key, title);
    this.patchStep(key, { status: 'done', title, detail, swatches });
  }
  fail(key: string, title: string, detail?: string) {
    if (!this.stepOf(key)) this.think(key, title);
    this.patchStep(key, { status: 'failed', title, detail });
  }
  /** a step is still thinking or working */
  get busy() { return this.log.some((e) => e.step && (e.step.status === 'thinking' || e.step.status === 'working')); }
  say(text: string, actions?: ChatAction[]) { this.log = [...this.log, { role: 'assistant', text, ...(actions ? { actions } : {}) }]; }
}
