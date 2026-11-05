// The actions gallery: every action with its live demo, every chain with its steps. Demos run on the
// synthetic craft (no photo, no models); chains run on the open craft when there is one.
import { actionOf } from '../domain/actions/registry';
import { allActions } from '../domain/actions/registry';
import { ACTION_GROUPS } from '../domain/actions/types';
import { allComposites } from '../domain/actions/composites';
import { demoAction, type ActionDemo } from '../domain/actions/demo';
import { rowsOf } from '../domain/craft';
import type { ActionState } from './craft/actions.svelte';
import type { CraftState } from './craft/craft.svelte';
import { ChainStore, type StoredStep } from './chains';

export class GalleryState {
  demos = $state<Record<string, ActionDemo>>({});
  loading = $state(true);
  /** the registry is not reactive: refreshed whenever a chain is saved or deleted */
  chainList = $state<{ id: string; label: string; icon: string; hint: string; ask?: string[]; steps: string[]; builtin?: boolean }[]>([]);
  lastRun = $state<{ id: string; summary: string } | null>(null);
  constructor(private actions: ActionState, private chainStore: ChainStore, private craft: CraftState) {}
  async load() {
    this.refreshChains();
    if (!this.loading && Object.keys(this.demos).length) return;
    for (const a of allActions()) this.demos[a.id] = await demoAction(a.id);
    this.loading = false;
  }
  get groups() {
    return ACTION_GROUPS.map((g) => ({ ...g, actions: allActions().filter((a) => a.group === g.id) }));
  }
  /** every action as a builder option (the page never touches the registry itself) */
  get actionOptions() {
    return allActions().map((a) => ({ id: a.id, label: a.label, group: a.group }));
  }
  refreshChains() {
    this.chainList = allComposites().map((c) => ({ id: c.id, label: c.label, icon: c.icon, hint: c.hint, ask: c.ask, builtin: c.builtin, steps: c.calls.map((s) => actionOf(s.action)?.label ?? s.action) }));
  }
  /** chains run on the open craft (each step keeps its own targets unless the chain was said with layers) */
  get canRun() {
    return rowsOf(this.craft.doc).length > 0;
  }
  async runChain(id: string) {
    const r = await this.actions.performAll([{ action: id, refs: [], opts: {} }], 'button');
    this.lastRun = { id, summary: r.ok ? r.entry.summary : r.reason };
  }
  saveChain(label: string, actionIds: string[]) {
    const steps: StoredStep[] = [];
    for (const id of actionIds) {
      const def = actionOf(id as never);
      if (!def) return null;
      steps.push({ action: def.id, refs: [{ all: true }], opts: { ...def.defaults } });
    }
    const d = this.chainStore.save(label, steps);
    if (d) this.refreshChains();
    return d;
  }
  deleteChain(id: string) {
    if (this.chainStore.delete(id)) this.refreshChains();
  }
}
