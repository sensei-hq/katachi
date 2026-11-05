// One way to run an action (design/14 §5): resolve → check → run → record → apply → narrate. The chat, the
// buttons and the automatic passes all come through here, so everything is undoable the same way.
import { actionOf, withDefaults } from '../../domain/actions/registry';
import { resolve } from '../../domain/actions/resolve';
import { applyPatch, applyResult, diff, isEmpty } from '../../domain/actions/history';
import type { ActionCtx, ActionId, Ref } from '../../domain/actions/types';
import type { CraftDoc, EntryDoc, Id } from '../../domain/craft/types';
import { registerAll } from '../../domain/actions/defs';
import { expandCalls } from '../../domain/actions/composites';
import { ChainStore } from '../chains';
import { prune } from '../../domain/craft';
import type { CraftState } from './craft.svelte';

/** how a step is said in the chat (the conversation passes these in; tests pass nothing) */
export interface Narrator {
  think?(key: string, title: string): void;
  done?(key: string, title: string, detail?: string): void;
  fail?(key: string, title: string, detail?: string): void;
}
/** a call names an action or a saved chain (chains expand to their steps when the group runs) */
export interface Call { action: ActionId | string; refs: Ref[]; opts?: Record<string, unknown> }
export type Outcome = { ok: true; entry: EntryDoc } | { ok: false; reason: string };
const KEEP = 50;

export class ActionState {
  /** what the screen has selected (for { selected: true }) */
  selected = $state<Id[]>([]);
  constructor(private craft: CraftState, private ctx: () => ActionCtx, private say: Narrator = {}, chains: ChainStore = new ChainStore()) { registerAll(); chains.load(); }

  get done() { return this.craft.doc.history.done; }
  get undone() { return this.craft.doc.history.undone; }
  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }
  get lastLabel() { return this.done.at(-1)?.summary; }

  /** one action */
  perform(action: ActionId, refs: Ref[], opts: Record<string, unknown> = {}, via: EntryDoc['via'] = 'button'): Promise<Outcome> {
    return this.performAll([{ action, refs, opts }], via);
  }
  /** several actions as one undoable step (a chat request, a recipe) — design/14 §5 groups */
  async performAll(calls: Call[], via: EntryDoc['via'] = 'chat', summary?: string): Promise<Outcome> {
    const start = this.craft.toJSON();
    const flat = expandCalls(calls);
    let doc: CraftDoc = start;
    let lastDetail: string | undefined;
    const children: EntryDoc[] = [], key = `act:${this.done.length}:${flat.map((c) => c.action).join('+')}`;
    for (const c of flat) {
      const def = actionOf(c.action);
      if (!def) return this.refuse(key, `I don’t know how to ${c.action} yet`);
      const o = withDefaults(def, c.opts as never);
      if ('error' in o) return this.refuse(key, `Can’t ${def.label.toLowerCase()}: ${o.error}`);
      const targets = resolve(doc, c.refs, def.scope, this.selected);
      const input = { targets, opts: o.opts };
      const ok = def.can(doc, input);
      if (ok !== true) return this.refuse(key, ok);
      this.say.think?.(key, `${def.label}…`);
      // a long group (the clean-up pass) lets the page draw between its actions
      if (flat.length > 2) await new Promise((r) => setTimeout(r, 0));
      let r;
      try { r = await def.run(doc, input, this.ctx()); }
      catch (e) { return this.refuse(key, `${def.label} failed`, e instanceof Error ? e.message : String(e)); }
      // links to anything removed go in the same step, so undo puts them back too
      const next = prune(applyResult(doc, r)), d = diff(doc, next);
      children.push({ id: this.ctx().newId(), action: c.action, opts: o.opts, targets, via, summary: r.summary, at: Date.now(), before: d.before, after: d.after });
      doc = next; lastDetail = r.detail;
      if (r.select) this.selected = r.select;
    }
    const whole = diff(start, doc);
    // nothing changed (already upright, nothing hidden): said with what the action found, not recorded
    if (isEmpty(whole.after)) { this.say.done?.(key, children.at(-1)?.summary ?? 'Nothing changed', lastDetail ?? 'nothing to change'); return { ok: true, entry: children.at(-1)! }; }
    const entry: EntryDoc = children.length === 1 ? children[0] : { id: this.ctx().newId(), action: children.map((c) => c.action).join('+'), opts: {}, targets: children.flatMap((c) => c.targets), via, summary: summary ?? children.map((c) => c.summary).join(' · '), at: Date.now(), before: whole.before, after: whole.after, children };
    this.craft.commit({ ...doc, history: { done: [...start.history.done, entry].slice(-KEEP), undone: [] } });
    this.say.done?.(key, entry.summary, children.length > 1 ? `${children.length} steps · one undo` : lastDetail);
    return { ok: true, entry };
  }
  /** an edit made outside the actions (a mask re-measured from the photo) lands in the same history */
  adopt(next: CraftDoc, summary: string, action = 'detail', via: EntryDoc['via'] = 'chat'): EntryDoc | null {
    const cur = this.craft.toJSON(), d = diff(cur, next);
    if (isEmpty(d.after)) { this.craft.load({ ...next, history: cur.history, rev: cur.rev }); return null; }
    const entry: EntryDoc = { id: this.ctx().newId(), action, opts: {}, targets: Object.keys(d.after.items), via, summary, at: Date.now(), before: d.before, after: d.after };
    this.craft.commit({ ...next, history: { done: [...cur.history.done, entry].slice(-KEEP), undone: [] } });
    return entry;
  }
  /** put back what the last step changed */
  undo(): EntryDoc | null {
    const d = this.craft.toJSON(), e = d.history.done.at(-1);
    if (!e) { this.say.done?.('undo', 'Nothing to undo'); return null; }
    this.craft.commit({ ...applyPatch(d, e.before), history: { done: d.history.done.slice(0, -1), undone: [...d.history.undone, e] } });
    this.say.done?.(`undo:${e.id}`, `Undone: ${e.summary}`, this.canRedo ? 'say “redo” to bring it back' : undefined);
    return e;
  }
  /** bring back what Undo took away — the stored result, never re-run (a model's result comes back as it was) */
  redo(): EntryDoc | null {
    const d = this.craft.toJSON(), e = d.history.undone.at(-1);
    if (!e) { this.say.done?.('redo', 'Nothing to redo'); return null; }
    this.craft.commit({ ...applyPatch(d, e.after), history: { done: [...d.history.done, e], undone: d.history.undone.slice(0, -1) } });
    this.say.done?.(`redo:${e.id}`, `Redone: ${e.summary}`);
    return e;
  }
  /** the last action again, with its options — on new targets, or the same ones */
  again(refs?: Ref[]): Promise<Outcome> {
    const e = this.done.at(-1);
    if (!e) return Promise.resolve(this.refuse('again', 'Nothing to repeat yet'));
    const last = e.children?.at(-1) ?? e;
    return this.perform(last.action as ActionId, refs ?? last.targets.map((id) => ({ id })), last.opts as Record<string, unknown>, 'chat');
  }
  private refuse(key: string, reason: string, detail?: string): Outcome { this.say.fail?.(key, reason, detail); return { ok: false, reason }; }
}
