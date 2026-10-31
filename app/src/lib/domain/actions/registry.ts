// The action registry (design/14): every action is registered once and found by id; buttons, chat and recipes
// list and run them from here.
import type { ActionDef, ActionId } from './types';

const defs = new Map<ActionId, ActionDef<never>>();
export function register<O>(def: ActionDef<O>) { defs.set(def.id, def as unknown as ActionDef<never>); return def; }
export function actionOf<O = Record<string, unknown>>(id: ActionId): ActionDef<O> | undefined { return defs.get(id) as unknown as ActionDef<O> | undefined; }
export function allActions(): ActionDef[] { return [...defs.values()] as unknown as ActionDef[]; }

/** options with their defaults filled, and bounds checked against the schema (a reason when out of range) */
export function withDefaults<O>(def: ActionDef<O>, opts: Partial<O> = {}): { opts: O } | { error: string } {
  const merged = { ...def.defaults, ...opts } as O;
  for (const [k, spec] of Object.entries(def.schema.properties) as [string, { minimum?: number; maximum?: number; enum?: unknown[] }][]) {
    const v = (merged as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (typeof v === 'number' && ((spec.minimum !== undefined && v < spec.minimum) || (spec.maximum !== undefined && v > spec.maximum))) return { error: `${k} must be between ${spec.minimum ?? '−∞'} and ${spec.maximum ?? '∞'}` };
    if (spec.enum && !spec.enum.includes(v)) return { error: `${k} must be one of ${spec.enum.join(', ')}` };
  }
  return { opts: merged };
}
