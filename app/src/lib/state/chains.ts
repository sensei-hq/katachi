// The user's saved chains (recipes): named action lists kept in the browser, registered beside the built-ins
// so the gallery, the chat and the planner all see them. Said by name ("evening tidy"); a name that also reads
// as an action falls through to the planner instead of guessing.
import { actionOf } from '../domain/actions/registry';
import { compositeOf, registerComposite, unregisterComposite, type ChainCall, type CompositeDef } from '../domain/actions/composites';
import type { Ref } from '../domain/actions/types';
import { MemoryStorage, type KeyValueStorage } from './project.svelte';

const KEY = 'katachi.chains.v1';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface StoredStep { action: string; refs: Ref[]; opts: Record<string, unknown> }
interface Stored { id: string; label: string; calls: StoredStep[] }

/** stored steps back to chain calls; null when any step names something that is not an action */
function stepsOf(calls: StoredStep[]): ChainCall[] | null {
  if (!Array.isArray(calls) || !calls.length) return null;
  const out: ChainCall[] = [];
  for (const c of calls) {
    if (!c || typeof c !== 'object' || !actionOf(c.action as never) || !Array.isArray(c.refs) || typeof c.opts !== 'object' || !c.opts) return null;
    out.push({ action: c.action as ChainCall['action'], refs: c.refs, opts: c.opts });
  }
  return out;
}
function toDef(s: Stored): CompositeDef | null {
  if (typeof s.id !== 'string' || !s.id.startsWith('user-') || typeof s.label !== 'string' || !s.label.trim()) return null;
  const calls = stepsOf(s.calls);
  if (!calls) return null;
  const label = s.label.trim().slice(0, 60);
  return { id: s.id, label, icon: 'i-solar:layers-minimalistic-linear', hint: `Saved chain: ${calls.map((c) => actionOf(c.action)?.label ?? c.action).join(' → ')}.`, says: [new RegExp(`\\b${esc(label)}\\b`, 'i')], calls };
}

export class ChainStore {
  constructor(private storage: KeyValueStorage = new MemoryStorage()) {}
  private read(): Stored[] {
    try {
      const v = JSON.parse(this.storage.getItem(KEY) ?? '[]') as unknown;
      return Array.isArray(v) ? v as Stored[] : [];
    } catch { return []; }
  }
  private write(v: Stored[]) {
    try { this.storage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: chains last the session */ }
  }
  /** register every saved chain (at startup); skips whatever no longer reads as actions */
  load(): CompositeDef[] {
    const out: CompositeDef[] = [];
    for (const s of this.read()) { const d = toDef(s); if (d) { registerComposite(d); out.push(d); } }
    return out;
  }
  /** save a chain under a name (new id); null when the steps do not read as actions */
  save(label: string, calls: StoredStep[]): CompositeDef | null {
    const steps = stepsOf(calls);
    const name = label.trim().slice(0, 60);
    if (!name || !steps) return null;
    const stored: Stored = { id: `user-${Date.now().toString(36)}`, label: name, calls: steps };
    this.write([...this.read(), stored]);
    const def = toDef(stored)!;
    registerComposite(def);
    return def;
  }
  /** forget a saved chain (built-ins are never removed) */
  delete(id: string): boolean {
    const def = compositeOf(id);
    if (!def || def.builtin || !id.startsWith('user-')) return false;
    this.write(this.read().filter((s) => s.id !== id));
    unregisterComposite(id);
    return true;
  }
}
