// The chat's way into the actions (design/14 §7). First a fast path in code — the plain, unambiguous phrases need
// no model ("undo", "delete layer 5", "merge layers 2-4", "smooth the fox a lot") — and only what it can't read
// goes to Spark's planner. Both end as calls that run through ActionState.
import { layersOf } from '../craft';
import type { CraftDoc } from '../craft/types';
import { allActions } from './registry';
import { allComposites, expandCalls } from './composites';
import type { ActionId, Ref } from './types';

export type Said = { kind: 'undo' } | { kind: 'redo' } | { kind: 'again'; refs?: Ref[] } | { kind: 'calls'; calls: { action: ActionId; refs: Ref[]; opts: Record<string, unknown> }[] };

const NUM = /\blayers?\s+((?:#?\d{1,2}\s*(?:,|and|&|to|through|-|–)?\s*)+)/gi;
/** the layers a sentence names: numbers, ranges, names, items, roles, empty, all, this */
export function refsIn(text: string, doc: CraftDoc): Ref[] {
  const t = text.toLowerCase(), refs: Ref[] = [], layers = layersOf(doc);
  for (const m of t.matchAll(NUM)) {
    const part = m[1];
    for (const r of part.matchAll(/(\d{1,2})\s*(?:-|–|to|through)\s*(\d{1,2})/g)) for (let k = Number(r[1]); k <= Number(r[2]); k++) refs.push({ n: k });
    for (const d of part.replace(/(\d{1,2})\s*(?:-|–|to|through)\s*(\d{1,2})/g, '').matchAll(/\d{1,2}/g)) refs.push({ n: Number(d[0]) });
  }
  if (refs.length) return refs;
  if (/(\b0\s*%|\bzero\b|\bempty\b|nothing (shows|visible)|\binvisible\b)/.test(t)) return [{ empty: true }];
  if (/\ball (the )?engrav/.test(t)) return [{ role: 'engrave' }];
  if (/\b(this|that|it|selected)\b(?! (one|layer) of)/.test(t) && !/\ball\b/.test(t) && !layers.some((l) => t.includes(l.part.name.toLowerCase()) || t.includes(l.item.name.toLowerCase()))) return [{ selected: true }];
  if (/\b(all|every|everything|each)\b/.test(t) && !layers.some((l) => t.includes(l.part.name.toLowerCase()))) return [{ all: true }];
  // names said whole ("the swirl drop left"), longest first so "swirl drop left" wins over "swirl"
  const names = [...new Set(layers.flatMap((l) => [l.part.name, l.item.name]))].sort((a, b) => b.length - a.length);
  let rest = t;
  for (const n of names) { const low = n.toLowerCase(); if (low.length > 2 && rest.includes(low)) { refs.push({ name: n }); rest = rest.replace(low, ' '); } }
  return refs;
}

/** options a sentence carries for the common actions (strength words, sizes, axes, counts) */
export function optsIn(action: ActionId, text: string): Record<string, unknown> {
  const t = text.toLowerCase(), o: Record<string, unknown> = {};
  if (action === 'smooth') o.strength = /\b(a lot|lots|very|much|heavily|strongly|really)\b/.test(t) ? 4 : /\b(slightly|a bit|a little|gently|lightly)\b/.test(t) ? 1 : 2;
  if (action === 'resize') {
    const m = /(\d+(?:\.\d+)?)\s*(mm|cm|in(?:ch(?:es)?)?)\b(?:\s*(wide|width|across|tall|high|height))?/.exec(t), pct = /\bscale\b[^\d]*(\d+(?:\.\d+)?)\s*%/.exec(t);
    if (pct) o.scale = Number(pct[1]) / 100;
    else if (m) { const mm = Number(m[1]) * (m[2] === 'cm' ? 10 : m[2].startsWith('in') ? 25.4 : 1); o[/tall|high|height/.test(m[3] ?? '') ? 'hMm' : 'wMm'] = mm; }
  }
  if (action === 'flip' || action === 'mirror') o.axis = /\b(vertical(ly)?|upside|top to bottom)\b/.test(t) ? 'y' : 'x';
  if (action === 'quantity') { const m = /\b(\d{1,2})\s*(of|copies|times|x)\b/.exec(t); if (m) o.qty = Number(m[1]); }
  if (action === 'reorder') o.to = /\bback\b/.test(t) ? 'back' : /\bbackward\b/.test(t) ? 'backward' : /\bforward\b/.test(t) ? 'forward' : 'front';
  if (action === 'set-role') o.role = /\bcut\b/.test(t) && !/\bengrav/.test(t) ? 'cut' : 'engrave';
  return o;
}

/** options an action's own phrase carries in named groups ((?<qty>\d+), (?<axis>…)): numbers as numbers, words as
 *  the option values they mean */
const WORDS: Record<string, string> = { horizontal: 'x', horizontally: 'x', vertical: 'y', vertically: 'y', center: 'centre', middle: 'centre' };
export function groupsOf(says: RegExp[], text: string): Record<string, unknown> {
  for (const re of says) {
    const g = re.exec(text)?.groups;
    if (!g) continue;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(g)) if (v !== undefined) out[k] = /^\d+(\.\d+)?$/.test(v) ? Number(v) : WORDS[v.toLowerCase()] ?? v.toLowerCase();
    if (Object.keys(out).length) return out;
  }
  return {};
}
/** what the chat can do without a model, or null (then Spark plans it) */
export function fastPath(text: string, doc: CraftDoc): Said | null {
  const t = text.trim().toLowerCase();
  if (/^(undo|undo (that|it|the last( change| edit)?)|go back|revert( that)?|put it back)[.!]?$/.test(t)) return { kind: 'undo' };
  if (/^(redo|redo (that|it)|bring it back)[.!]?$/.test(t)) return { kind: 'redo' };
  if (/^(again|do (that|it) again|same again|repeat( that)?)[.!]?$/.test(t)) return { kind: 'again' };
  const again = /^(?:do )?(?:the )?same (?:for|to|on) (.+)$/.exec(t);
  if (again) { const refs = refsIn(again[1], doc); if (refs.length) return { kind: 'again', refs }; }
  // one action, said plainly, with its targets: anything with "and" between two verbs goes to the planner
  if (/\b(and|then)\b.*\b(merge|delete|smooth|flip|mirror|resize|straighten|enhance|rotate)\b/.test(t) && /\b(merge|delete|smooth|flip|mirror|resize|straighten|enhance|rotate)\b.*\b(and|then)\b/.test(t)) return null;
  // a layer's own name is not a command ("Swirl drop left" is not "drop")
  const names = layersOf(doc).flatMap((l) => [l.part.name, l.item.name]).sort((a, b) => b.length - a.length);
  const bare = names.reduce((acc, n) => (n.length > 2 ? acc.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ') : acc), text);
  const hits = allActions().filter((a) => a.says?.some((re) => re.test(bare)));
  const chains = allComposites().filter((c) => c.says?.some((re) => re.test(bare)));
  if (hits.length + chains.length !== 1) return null;
  if (chains.length) {
    // a chain, said plainly: named layers retarget every step, else each step keeps its own targets
    const refs = refsIn(text, doc);
    return { kind: 'calls', calls: expandCalls([{ action: chains[0].id, refs, opts: {} }]) };
  }
  const a = hits[0], refs = refsIn(text, doc);
  // destructive actions need their layers named: "delete this layer", "delete layer 5", "the empty layers" —
  // never a guess at the selection ("remove the red parts" is a colour edit, not a delete)
  const said = refs.length && !(refs.length === 1 && 'selected' in refs[0] && !/\b(this|that)\s+(layer|one|item|piece)\b/.test(t));
  if ((a.id === 'delete' || a.id === 'merge') && !said) return null;
  if (!refs.length && a.scope === 'part' && a.arity !== 'any') return null;
  return { kind: 'calls', calls: [{ action: a.id, refs: refs.length ? refs : [{ selected: true }], opts: { ...optsIn(a.id, text), ...groupsOf(a.says ?? [], bare) } }] };
}

/** the registry as the planner's tool list */
export function toolList() {
  return allActions().map((a) => ({ id: a.id, hint: a.hint, options: Object.entries(a.schema.properties).map(([k, v]) => { const s = v as { enum?: string[]; minimum?: number; maximum?: number; type?: string }; return s.enum ? `${k} (${s.enum.join('|')})` : s.minimum !== undefined ? `${k} ${s.minimum}–${s.maximum}` : `${k}${s.type ? ` (${s.type})` : ''}`; }).join(', ') }));
}
/** a planner call's refs → the action refs */
export function refsFromPlan(refs: { kind: string; value: string }[]): Ref[] {
  return refs.map((r): Ref | null => (r.kind === 'n' && Number(r.value) ? { n: Number(r.value) } : r.kind === 'name' ? { name: r.value } : r.kind === 'item' ? { item: r.value } : r.kind === 'role' && ['cut', 'engrave', 'score'].includes(r.value) ? { role: r.value as 'cut' } : r.kind === 'empty' ? { empty: true } : r.kind === 'all' ? { all: true } : r.kind === 'selected' ? { selected: true } : null)).filter((r): r is Ref => Boolean(r));
}
