// The chat's planner (design/14 §7): Muse Spark reads what was said and picks from the app's actions — which ones,
// on which layers (by number, name, item, role…), with which options. Models reason; code runs the actions.
// The action list comes from the client's registry, so adding an action needs no server change.
import { MetaClient } from './client';

export interface PlanRef { kind: 'n' | 'name' | 'item' | 'role' | 'empty' | 'all' | 'selected'; value: string }
export interface PlanCall { action: string; refs: PlanRef[]; opts: Record<string, unknown> }
export interface PlanAnswer { calls: PlanCall[]; reply: string; ask: string }
export interface PlanBody { text?: string; layers?: { n: number; name: string; item: string; role: string; shows: number }[]; selected?: number[]; actions?: { id: string; hint: string; options: string }[] }

const Schema = {
  type: 'object', additionalProperties: false, required: ['calls', 'reply', 'ask'],
  properties: {
    calls: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['action', 'refs', 'optsJson'], properties: {
      action: { type: 'string' },
      refs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'value'], properties: { kind: { type: 'string', enum: ['n', 'name', 'item', 'role', 'empty', 'all', 'selected'] }, value: { type: 'string' } } } },
      optsJson: { type: 'string' }
    } } },
    reply: { type: 'string' }, ask: { type: 'string' }
  }
} as const;
const SYSTEM = `You are Katachi, a craft assistant for laser and blade cutting. The user is editing a craft made of layers (parts of items).
Turn what they said into calls to the app's actions — only the actions listed, in order. Each call names its targets with refs:
- n: a layer number as listed ("3"); name: a layer name; item: an item name; role: "cut" or "engrave"; empty: layers that show 0%; all: everything; selected: what is selected.
Put options as a JSON object string in optsJson (only the listed options, "{}" for defaults). Prefer few calls.
If it is unclear which layers are meant, return no calls and put one short question in "ask".
If nothing fits, return no calls and say so in "reply". "reply" is one short sentence saying what you will do.`;

export async function planActions(env: Record<string, string | undefined>, body: PlanBody, client?: MetaClient): Promise<{ answer: PlanAnswer; source: 'live' | 'fixture'; trace: { model: string; purpose: string; latencyMs: number; costUsd: number }[] }> {
  const none: PlanAnswer = { calls: [], reply: '', ask: '' };
  const text = String(body.text ?? '').slice(0, 500), actions = (body.actions ?? []).slice(0, 60);
  if (!env.META_API_KEY || !text || !actions.length) return { answer: none, source: 'fixture', trace: [] };
  try {
    const c = client ?? new MetaClient(env.META_API_KEY);
    const user = [
      'Actions:', ...actions.map((a) => `- ${a.id}: ${a.hint}${a.options ? ` Options: ${a.options}` : ''}`),
      'Layers (back to front):', ...(body.layers ?? []).slice(0, 80).map((l) => `${l.n}. ${l.name} — item ${l.item}, ${l.role}, ${l.shows}% shows`),
      `Selected: ${(body.selected ?? []).join(', ') || 'none'}`,
      `The user said: ${text}`
    ].join('\n');
    const r = await c.sparkJson(SYSTEM, user, Schema as unknown as Record<string, unknown>, 'ActionPlan');
    const d = r.data as { calls?: { action?: string; refs?: PlanRef[]; optsJson?: string }[]; reply?: string; ask?: string };
    const known = new Set(actions.map((a) => a.id));
    const calls: PlanCall[] = (d.calls ?? []).filter((x) => x.action && known.has(x.action)).map((x) => {
      let opts: Record<string, unknown> = {};
      try { const o = JSON.parse(x.optsJson || '{}'); if (o && typeof o === 'object' && !Array.isArray(o)) opts = o; } catch { /* a bad options string: defaults */ }
      return { action: x.action!, refs: (x.refs ?? []).filter((f) => f && typeof f.value === 'string'), opts };
    });
    return { answer: { calls, reply: String(d.reply ?? ''), ask: String(d.ask ?? '') }, source: 'live', trace: [{ model: 'muse-spark-1.3', purpose: 'action_plan', latencyMs: r.latencyMs, costUsd: r.costUsd }] };
  } catch (e) {
    console.error('action plan failed:', e instanceof Error ? e.message : String(e));
    return { answer: none, source: 'fixture', trace: [] };
  }
}
