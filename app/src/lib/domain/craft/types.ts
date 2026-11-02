// The craft document (design/15): Craft → Items → Parts → Ops. Plain, versioned data — what is saved.
// State classes (state/craft/) wrap it; actions (domain/actions) change it; the cut plan (domain/cutplan) reads it.
import type { Box, Geometry } from '../geo/types';

export type Id = string;
export type Tier = 'S' | 'M' | 'L' | 'XL';
export const TIER_PX: Record<Tier, number> = { S: 256, M: 512, L: 1024, XL: 2048 };

export interface CraftDoc {
  v: 2;
  id: Id; name: string; kind: 'layered' | 'items' | '3d';
  createdAt: number; updatedAt: number;
  /** bumped by every applied action; the cut plan records the rev it was built from */
  rev: number;
  realSize?: { wMm: number; hMm: number; dMm?: number; basis: string };
  items: ItemDoc[];
  groups: GroupDoc[];
  sources: SourceDoc[];
  history: { done: EntryDoc[]; undone: EntryDoc[] };
}
export interface SourceDoc { id: Id; kind: 'photo' | 'view' | 'kit-layout' | 'detail' | 'sketch'; w: number; h: number; note?: string }
export interface Frame {
  tier: Tier;
  /** px; long edge = the tier, short edge from the item's bounding box */
  size: [number, number];
  /** where the frame sits on its source picture, in 0-1000 photo units, and how far it is turned (straighten) */
  fromSource: { sourceId: Id; box: Box; rotateDeg: number };
  /** frame px per mm (resize changes only this) */
  pxPerMm: number;
  /** mirrored when cut (flip): applied after rotate */
  flipX?: boolean; flipY?: boolean;
}
export interface ItemDoc {
  id: Id; name: string;
  build: 'stacked' | 'inlay' | 'engrave' | 'assembly' | 'single';
  frame: Frame;
  parts: PartDoc[];
  joins: JoinDoc[];
  /** how many to make (5 of the same earring): the cut plan places it this many times */
  qty?: number;
  /** the model's call: this item is small or fine enough to need a closer look (design/15 §2) */
  needsEnhance?: { reason: string };
  /** what the passes found about the photo of it: how far its corners were off square (perspective), how much of it
   *  was filled in from what showed — the item shot squarest and whole is the size reference for its family */
  shot?: { skewDeg?: number; filledPct?: number };
}
export interface PartDoc {
  id: Id; name: string;
  /** stacked art: 0 = the back */
  z: number;
  material: string; colour: string;
  ops: OpDoc[];
  measured?: { visiblePct: number; hiddenPct: number; tune?: { detail: number; weight: number } };
  /** stacked art: the part of it that shows (the rest sits under the parts in front) — for the screen's preview */
  shows?: Geometry;
  /** kept from the analysis so a part can be re-measured from the photo */
  regionId?: string;
  /** a merged part remembers the parts it was made from, so split gives them back */
  from?: PartDoc[];
}
export type OpKind = 'cut' | 'engrave' | 'score';
/** geometry is in the item's frame px */
export interface OpDoc { id: Id; kind: OpKind; geometry: Geometry; settings?: { feed?: number; power?: number; passes?: number }; /** how much of the photo it shows, % (an engraving's own row) */ shows?: number }
export interface JoinDoc { id: Id; a: Id; b: Id; type: 'finger' | 'tab' | 'slot' | 'glue' }
export interface GroupDoc { id: Id; name: string; kind: 'pair' | 'set'; items: Id[]; rule: 'same-sheet' | 'together' | 'none' }

/** one undoable step (design/14 §5): only what changed, by node id; `null` = did not exist */
export interface EntryDoc {
  id: Id; action: string; opts: unknown; targets: Id[]; via: 'chat' | 'button' | 'pass';
  summary: string; at: number;
  before: Patch; after: Patch;
  children?: EntryDoc[];
}
export interface Patch {
  items: Record<Id, ItemDoc | null>;
  groups?: Record<Id, GroupDoc | null>;
  /** item order (back → front of the craft's list) when it changed */
  order?: Id[];
}
