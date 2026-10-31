import { MetaClient } from './client';
// layers.refine: Muse Spark turns what the user said about one layer into one edit operation the code can apply.
// Models reason; code edits the mask (domain/layering). Without a key, nothing is guessed: the op is 'none'.
export const LAYER_OPS = ['fill', 'detail', 'bolder', 'thinner', 'smoother', 'remove-backdrop', 'remove-colour', 'add-colour', 'merge', 'none'] as const;
export type LayerOpName = (typeof LAYER_OPS)[number];
export interface LayerOpAnswer { op: LayerOpName; colour: string; other: string; reply: string }
export const LayerOpJsonSchema = {
  type: 'object', additionalProperties: false, required: ['op', 'colour', 'other', 'reply'],
  properties: {
    op: { type: 'string', enum: [...LAYER_OPS] }, colour: { type: 'string' }, other: { type: 'string' }, reply: { type: 'string' }
  }
} as const;
const SYSTEM = `You are Katachi, a craft assistant. The user is editing ONE cut layer of a layered craft (paper or wood) and said something about it.
Pick exactly one operation the app can apply to that layer's mask:
- fill: make it one solid shape — fill the enclosing outline, close holes and inner sections ("completely filled", "solid backing", "enclosing shape", "no gaps").
- detail: bring back fine strokes (whiskers, hair, thin lines) — sharper, more detail.
- bolder: thicker strokes, grow the shape. thinner: slimmer, shrink it.
- smoother: smooth jagged or jittery edges, drop specks, clean up.
- remove-backdrop: take the wall / background / shadows out of this layer.
- remove-colour / add-colour: take out or add the parts of a named colour (put the colour word in "colour").
- merge: join this layer with another layer (put that layer's name in "other").
- none: anything else (a note for later).
"reply" is one short sentence to the user saying what you will do, in plain words. Leave colour/other as "" when not used.`;
export async function interpretLayerOp(env: Record<string, string | undefined>, body: { text?: string; layer?: string; layers?: string[] }, client?: MetaClient): Promise<{ answer: LayerOpAnswer; source: 'live' | 'fixture'; trace: { model: string; purpose: string; latencyMs: number; costUsd: number }[] }> {
  const none: LayerOpAnswer = { op: 'none', colour: '', other: '', reply: 'Noted with the craft.' };
  const text = String(body.text ?? '').slice(0, 500);
  if (env.META_API_KEY && text) {
    try {
      const c = client ?? new MetaClient(env.META_API_KEY);
      const r = await c.sparkJson(SYSTEM, `Layer: ${body.layer ?? 'this layer'}\nOther layers: ${(body.layers ?? []).join(', ') || 'none'}\nThe user said: ${text}`, LayerOpJsonSchema as unknown as Record<string, unknown>, 'LayerOp');
      const d = r.data as Partial<LayerOpAnswer>;
      if (d && LAYER_OPS.includes(d.op as LayerOpName)) return { answer: { op: d.op as LayerOpName, colour: String(d.colour ?? ''), other: String(d.other ?? ''), reply: String(d.reply ?? '') }, source: 'live', trace: [{ model: 'muse-spark-1.3', purpose: 'layer_op', latencyMs: r.latencyMs, costUsd: r.costUsd }] };
    } catch (e) { console.error('layer op failed:', e instanceof Error ? e.message : String(e)); }
  }
  return { answer: none, source: 'fixture', trace: [] };
}
