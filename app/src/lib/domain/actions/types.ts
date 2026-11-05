// The action contract (design/14 §1). Every action: craft + targets + options in → the changed items out.
// Pure: no Svelte, no fetch. Model actions get their model calls through ctx (MuseAgents), never directly.
import type { CraftDoc, Id, ItemDoc, GroupDoc } from '../craft/types';
import type { PixelImage } from '../colour';

export type ActionId =
  | 'merge' | 'delete' | 'duplicate' | 'split' | 'reorder' | 'set-role' | 'rename' | 'recolour'
  | 'straighten' | 'rotate' | 'flip' | 'mirror' | 'align' | 'distribute' | 'quantity'
  | 'interpolate' | 'fill' | 'smooth' | 'simplify' | 'bolder' | 'thinner' | 'detail' | 'offset' | 'weld'
  | 'bridge' | 'add-hole' | 'resize' | 'enhance' | 'remove-colour' | 'add-colour' | 'draw' | 'move'
  | 'group' | 'ungroup' | 'fit-to-board' | 'tidy' | 'unhook' | 'repeat-pattern' | 'symmetrize' | 'rectify' | 'same-size' | 'deshadow';

/** what a request names; resolved to ids before an action runs (design/14 §4) */
export type Ref =
  | { id: Id } | { n: number } | { name: string } | { item: string }
  | { role: 'cut' | 'engrave' | 'score' } | { empty: true } | { selected: true } | { all: true };

/** what an action works on: parts (most), or whole items (straighten, resize, flip, enhance…) */
export type Scope = 'part' | 'item';

export interface ActionInput<O> { targets: Id[]; opts: O }
export interface ActionResult {
  /** every item that changed, whole (new ids = created) */
  items: ItemDoc[];
  /** items removed */
  removed?: Id[];
  groups?: GroupDoc[]; removedGroups?: Id[];
  /** the craft's item order, when it changed */
  order?: Id[];
  summary: string;
  detail?: string;
  model?: { name: string; costUsd: number; latencyMs: number };
  /** what the screen should select afterwards */
  select?: Id[];
}
export interface ActionCtx {
  /** the source picture's pixels at a long edge of `max` px (lazy, cached) */
  pixels(sourceId: Id, max?: number): Promise<PixelImage | null>;
  /** model calls (enhance re-segments a crop with SAM; interpolate 'model' asks Muse Image) */
  /** the item's crop (pixels), outlined again by SAM; paths in 0-1000 of the crop (the state layer encodes and sends it) */
  muse?: { segmentCrop(img: PixelImage, prompt: string): Promise<{ paths: [number, number][][]; costUsd: number; latencyMs: number } | null> };
  newId(): Id;
  device?: { board: { wMm: number; hMm: number } };
}
export interface JsonSchema { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: false }
/** the gallery's shelves: what the action is for */
export type ActionGroup = 'stack' | 'shape' | 'photo' | 'cleanup';
export const ACTION_GROUPS: { id: ActionGroup; label: string; blurb: string }[] = [
  { id: 'stack', label: 'Stack', blurb: 'Arrange the layers: join, split, order, rename.' },
  { id: 'shape', label: 'Shape', blurb: 'Change outlines: turn, size, smooth, holes, patterns.' },
  { id: 'photo', label: 'Photo', blurb: 'Read the picture again: upright, hidden edges, size, detail.' },
  { id: 'cleanup', label: 'Clean up', blurb: 'Finish the traces: specks, shadows, hooks, symmetry.' }
];
export interface ActionDef<O = Record<string, unknown>> {
  id: ActionId;
  label: string;
  icon: string;
  scope: Scope;
  arity: 'one' | 'many' | 'any';
  group: ActionGroup;
  schema: JsonSchema;
  defaults: O;
  /** chat fast path: phrases that need no model (design/14 §7); captures fill options */
  says?: RegExp[];
  /** example asks for the gallery ("say …"): each either matches this action's fast path or is planner-routed (never another action's) */
  ask: string[];
  kind: 'code' | 'model';
  /** a one-line description for the chat model's tool list */
  hint: string;
  can(craft: CraftDoc, input: ActionInput<O>): true | string;
  run(craft: CraftDoc, input: ActionInput<O>, ctx: ActionCtx): ActionResult | Promise<ActionResult>;
}
