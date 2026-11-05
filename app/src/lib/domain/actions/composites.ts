// Named chains of actions (recipes): several actions as one undoable step, invokable from the gallery and the
// chat. A chain's calls carry their own targets; an ask that names layers retargets every step to them.
import type { ActionId, Ref } from './types';

export interface ChainCall { action: ActionId; refs: Ref[]; opts: Record<string, unknown> }
export interface CompositeDef {
  id: string;
  label: string;
  icon: string;
  hint: string;
  says?: RegExp[];
  /** example asks for the gallery ("say …") */
  ask?: string[];
  calls: ChainCall[];
  /** built-ins ship with the app; the rest are the user's saved chains */
  builtin?: boolean;
}

const defs = new Map<string, CompositeDef>();
export function registerComposite(def: CompositeDef) { defs.set(def.id, def); return def; }
export function compositeOf(id: string): CompositeDef | undefined { return defs.get(id); }
export function unregisterComposite(id: string) { defs.delete(id); }
export function allComposites(): CompositeDef[] { return [...defs.values()]; }

/** chains to their atomic calls (one level: chains hold actions, never other chains). Unknown ids pass through —
 *  the runner refuses those with "I don't know how to … yet". */
export function expandCalls(calls: { action: string; refs: Ref[]; opts?: Record<string, unknown> }[]): ChainCall[] {
  return calls.flatMap((c) => {
    const chain = defs.get(c.action);
    if (!chain) return [{ action: c.action as ActionId, refs: c.refs, opts: c.opts ?? {} }];
    return chain.calls.map((s) => ({ ...s, refs: c.refs.length ? c.refs : s.refs }));
  });
}

/** the chains as the planner's tool list (beside the actions) */
export function compositeList() {
  return allComposites().map((c) => ({ id: c.id, hint: `${c.hint} Runs on every layer, or the layers named.`, options: '' }));
}

const ALL: Ref[] = [{ all: true }];
let done = false;
export function registerComposites() {
  if (done) return; done = true;
  registerComposite({
    id: 'polish', label: 'Polish', icon: 'i-solar:magic-stick-2-linear', builtin: true,
    hint: 'The works on the layers: shadow layers folded into the layer they shade, specks and pin-holes dropped, repeated holes evened out, outlines smoothed.',
    says: [/\bpolish\b/i],
    ask: ['polish the layers', 'polish layers 1 to 3'],
    calls: [
      { action: 'deshadow', refs: ALL, opts: {} },
      { action: 'tidy', refs: ALL, opts: { thinMm: 0 } },
      { action: 'repeat-pattern', refs: ALL, opts: {} },
      { action: 'smooth', refs: ALL, opts: { strength: 4, passes: 2 } }
    ]
  });
}
