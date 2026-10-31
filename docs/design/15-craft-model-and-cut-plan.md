# 15 · The craft model (Craft → Items → Parts) and the hand-off to the machine (the Cut plan)

Status: proposed (2026-10-30). Goes with 14 (the action set). Nothing here is built yet.

## Why

Today one class, `LayerFlowState`, holds:

- the craft's choices;
- the regions SAM found;
- the layers;
- the sheets;
- the view state.

On top of that, a separate copy of each sheet is made for the queue. Layers point at regions by id, and items exist only as an `itemName` string on each layer. The bookmarks show why this is brittle:

- A bookmark's engraving is a *separate layer* that has to find its cut layer by name to be straightened with it.
- A merge across items silently drops the item.
- Every place that straightens, sizes or queues a sheet rebuilds the same joins.

The fix: one **craft document**, a tree you own top to bottom, with state classes over it. One **cut plan** is derived from it for a device and material, and the queue, the run animation and Assemble read only that.

## 1 · The tree

```
Craft
 ├─ items: Item[]                 one physical thing you end up with
 │   ├─ frame                     its own canvas: tier + transform (photo → frame → mm)
 │   ├─ parts: Part[]             one piece cut out of material
 │   │   ├─ ops: Op[]             what the machine does to it: engrave, score, cut
 │   │   └─ z, material, colour
 │   └─ joins: Join[]             3D: how parts connect (part ↔ part)
 ├─ groups: Group[]               items that go together (a pair of earrings, a set of charms)
 ├─ sources: Source[]             the photos, the kit layout picture
 └─ history                       the action stack (design/14)
```

**The key change: cut and engrave are operations on a part, not separate layers.** A bookmark is *one part* with two ops: an engraving, then the cut with its holes. Its engraving can't be separated from it, straightened differently, or lose its item in a merge, because it lives inside the part. What the screen calls a "layer" is a part (and, for engraved parts, its op rows).

How the four samples map:

| Sample | Items | Parts per item | Ops per part | Groups / joins |
|---|---|---|---|---|
| **Cat** (layered wall art) | 1 | 4 parts, one per colour layer, stacked by `z` (back = the solid backing) | cut | — |
| **Bookmarks** | 5 | 1 each | engrave, then cut (holes first, outline last) | — |
| **Earrings / charms** | n | 1 each | cut, plus engrave if any | `pair` groups (left + right), cut together on one sheet; a `set` group for the whole frame |
| **Castle** (3D kit) | 1 | many: walls, floors, roof, gears… (from the kit layout picture or the stitched views) | cut + engrave / score | `joins` between parts (finger, tab, slot); the kit's own sheet layout kept as a *given layout* (§5) |

**Ownership versus references:**

- **Containment is ownership:** a part belongs to exactly one item, and an op belongs to exactly one part. There is no back-pointer that can go stale.
- **Sideways links are by id, in one direction only:**
  - a group lists item ids;
  - a join lists two part ids within the same item;
  - a placement in the cut plan lists a part id.
- **The index:** on load, the craft builds one id → node map. Lookups, the action resolver (design/14 §4) and validation all use it. When anything is removed, the links pointing at it are dropped in the same step (an invariant the tests check).

```ts
// domain/craft/types.ts — the plain, versioned document (what is saved)
export interface CraftDoc {
  v: 2;                                   // schema version; v1 = today's LayerFlowState snapshot (migrated on load)
  id: string; name: string; kind: 'layered' | 'items' | '3d';
  createdAt: number; updatedAt: number;
  realSize?: { wMm: number; hMm: number; dMm?: number; basis: string };
  items: ItemDoc[]; groups: GroupDoc[]; sources: SourceDoc[];
  history: { done: EntryDoc[]; undone: EntryDoc[] };
  /** the screen's last place: open step, selection, view — saved, never in the history */
  view?: { step: string; selected?: string; mode?: string };
}
export interface ItemDoc {
  id: string; name: string;
  build: 'stacked' | 'inlay' | 'engrave' | 'assembly' | 'single';
  frame: Frame;                           // tier + transforms (§2)
  parts: PartDoc[]; joins: JoinDoc[];
  /** where it came from in the photo, for re-measuring and "enhance" */
  source: { sourceId: string; box: Box; mask?: Paths };
}
export interface PartDoc {
  id: string; name: string; z: number;    // z orders stacked art (0 = back)
  material: string; colour: string;
  ops: OpDoc[];                           // run order on the machine follows op kind (§4), not this order
  measured?: { visiblePct: number; hiddenPct: number; tune?: { detail: number; weight: number } };
}
export interface OpDoc { id: string; kind: 'cut' | 'engrave' | 'score'; geometry: Geometry; settings?: OpSettings }
export interface JoinDoc { id: string; a: string; b: string; type: 'finger' | 'tab' | 'slot' | 'glue'; edge?: [number, number] }
export interface GroupDoc { id: string; name: string; kind: 'pair' | 'set'; items: string[]; rule: 'same-sheet' | 'together' | 'none' }
```

`Geometry` is polylines or cubic Béziers (design/14, smooth) in **frame units**. There is one outline loop list for a cut, with holes as inner loops, and lines or fills for an engraving.

## 2 · Item frames (decision 1)

**Decision:** an item's frame is a **rectangle matching its bounding box**, squared only when the item is square. The long edge is the tier: S 256 · M 512 · L 1024 · XL 2048 px.

```ts
interface Frame {
  tier: 'S' | 'M' | 'L' | 'XL';
  size: [number, number];                 // px: long edge = tier, short edge from the item's own aspect
  fromPhoto: { box: Box; rotateDeg: number }; // crop + turn (straighten edits rotateDeg, never the geometry)
  pxPerMm: number;                        // frame → mm (resize edits this, never the geometry)
}
```

**Decision 2: the model decides on enhance.** Spark's brief gains one field per item: `needsEnhance`, with a reason (e.g. "fine lattice, holes under 3 px"). The items recipe (design/14 §9) runs enhance only for those items. The chat shows the step and its cost (one SAM call per item), and it can be undone like any action.

## 3 · State classes: Craft, Item, Part, Op

The document is plain data. Svelte state classes wrap it, so the screens read reactive getters and the actions mutate through one place.

```ts
// state/craft/*.svelte.ts
class CraftState {
  doc = $state<CraftDoc>(…);
  items = $derived(this.doc.items.map((d) => this.itemOf(d)));      // ItemState wrappers, cached by id
  byId(id): ItemState | PartState | OpState | undefined;              // the index
  get layers(): PartState[];                                         // the screen's "layers", flattened in display order
  readonly actions: ActionState;                                     // perform / undo / redo / again (design/14)
  toJSON(): CraftDoc; static from(doc: CraftDoc | LegacyV1): CraftState;
}
class ItemState  { doc; craft; get parts(); get sizeMm(); get turnDeg(); get hiddenShare(); … }
class PartState  { doc; item; get cut(); get engravings(); get sheetShapesMm(); get role(); … }
class OpState    { doc; part; get pathMm(); get lengthMm(); … }
```

**Rules:**

- **Screens read state and call actions.** They never edit `doc` directly. This is today's "state separate from presentation", carried down to every node.
- **Measurements are derived:** size in mm, turn, hidden share, cut length are getters computed from `doc`. They are cached by Svelte, never stored twice and never stale.
- **One place applies changes:** `ActionState.perform`. History entries carry patches by node id (design/14 §5).
- **View state stays out:** what is selected, hidden from view, or the open view mode lives in a small `CraftViewState` next to the craft. It is saved, but never in the history.
- **The workflow stays separate:** `LayerFlowState` shrinks to the analysis pipeline (regions, cutout, the steps' jobs). It hands results to the craft as actions, e.g. `createItems(…)` and `measureParts(…)`, which can be undone like anything else.

## 4 · Persistence: one repository, local now, Supabase later

```ts
// state/craft/repository.ts
interface CraftRepository {
  list(): Promise<CraftSummary[]>;                  // the gallery
  load(id: string): Promise<CraftDoc | null>;       // migrates v1 → v2 on the way in
  save(doc: CraftDoc): Promise<void>;               // debounced by the caller (autosave)
  remove(id: string): Promise<void>;
  media: { put(craftId, sources: Blob[]): Promise<SourceDoc[]>; get(craftId): Promise<…> };
}
class LocalRepository implements CraftRepository { … }     // now: summary in localStorage, doc + media in IndexedDB
class SupabaseRepository implements CraftRepository { … }  // later: crafts(id, owner, doc jsonb, updated_at), media in Storage
```

- **What goes where locally:** today's light/heavy split becomes just "the summary row" in localStorage (for the gallery) and "the doc" in IndexedDB. The cut plan (about 1 MB for the castle) never hits localStorage again.
- **Supabase later:** one row per craft with the doc as `jsonb`, row-level security by owner, and the photos in a Storage bucket. The doc is self-contained, so the switch is a new class behind the same interface. Sync between devices is last-write-wins on `updatedAt` at first, with the history kept per device.
- **Migration:** `CraftState.from()` accepts today's saved shape (v1) and builds the tree:
  - layers that share an `itemName` become one item;
  - a cut layer and its engrave layer become one part with two ops;
  - stacked layers become parts by `z`;
  - plan sheets become parts of the kit item.

  Old crafts open unchanged.

## 5 · The hand-off: the Cut plan

Between "the craft" and "the machine" sits one derived object: the **Cut plan**. It is made for one device and one material. The craft says *what* to make; the plan says *how this machine makes it*: which sheets, what is on each, in what order.

```ts
// domain/cutplan/types.ts
export interface CutProfile {
  id: string; label: string;                       // "xTool S1 · 3 mm birch", "Cricut Maker · cardstock"
  device: DeviceId; machine: 'laser' | 'blade';
  material: string; board: { wMm: number; hMm: number };   // 12 × 12 in mat, 300 × 300 bed, a 600 × 400 sheet…
  marginMm: number; spacingMm: number; kerfMm: number;
  settings: Record<'cut' | 'engrave' | 'score', { feed: number; power: number; passes: number }>;
  layout: 'one-part-per-sheet' | 'one-item-per-sheet' | 'groups-together' | 'nest';   // nest = fit to board (later)
}
export interface CutPlan {
  craftId: string; profileId: string; craftRev: number;    // rebuilt when the craft or the profile changes
  sheets: Sheet[];
}
export interface Sheet {
  id: string; n: number; material: string; colour: string;
  board: { wMm: number; hMm: number };
  placements: { partId: string; itemId: string; at: [number, number]; rotateDeg: number }[];
  /** the machine's order on this sheet: every engraving first, then inner cuts, then outlines (design/12) */
  passes: { opId: string; partId: string; kind: 'engrave' | 'score' | 'cut'; shapesMm: Pt[][] }[];
  /** for the run animation and Assemble: what the sheet is for */
  forStep?: { itemId: string; z?: number };
}
// domain/cutplan/plan.ts
export function planCut(craft: CraftDoc, profile: CutProfile): CutPlan;
```

**How it behaves:**

- **Engraving and cutting share a sheet.** A part's engrave and cut ops are passes on the same sheet, in the right order: engrave first, so the part doesn't move after it is cut free.
- **Device and material decide the sheets.**
  - A blade cutter on 12 × 12 in cardstock and a laser on a 300 × 300 bed give different sheets from the same craft.
  - Material splits sheets: the cat's gold backing and its black layer can't share a sheet.
- **Layout rules:**
  - **`one-part-per-sheet`** is today's behaviour, copied over as the first profile layout: one sheet per part (per layer), upright, at a 5 mm margin.
  - **`groups-together`** puts a `pair` (earrings) or a `set` (charms) on the same sheet when it fits. A pair is always cut together, and a set spills onto more sheets when it doesn't fit.
  - **`nest`** (fit to board, later) packs parts to waste less.
- **A given layout (kits):** a kit layout picture (the castle's parts layout) is read as parts *and* as the kit's own sheet arrangement. The plan can keep that arrangement (`layout: 'given'`) or re-lay the parts for your board.
- **The queue freezes a copy:** queuing copies the sheet into the queue, so editing the craft afterwards never changes a sheet already loaded on the machine. The queue shows "the craft changed since this was queued — replace?".
- **Cutting programs:** G-code and blade moves (design/12) are built per sheet from `passes`.

**Names:** **Cut plan** for the hand-off; **sheet** for one board load; **pass** for one op on it. The castle's input picture becomes the **kit layout** (`readKitLayout`, today's `readPlan`), so "plan" means one thing.

## 6 · What has to keep working

The refactor's acceptance is today's behaviour, unchanged on screen:

| Screen | Reads today | Reads after |
|---|---|---|
| Cut queue: bed, run animation, program panel | `QueueItem { cut d, shapes mm, sheetMm, op, colour, machine }` | the frozen `Sheet` → the same `QueueItem` fields (an adapter at first) |
| Assemble: cards, fly-in, stacked finale, item cells | `pieceFor(n)`, `layers` | `CutPlan.sheets` + `item.parts` by `z` (stacked), or by item (cells) |
| Cut (preview, virtual run) | `sheetFor`, `previewFor`, `passOrder` | the plan's sheets and passes |
| Layers: rows, sheet view, warnings | layers + regions | `craft.layers` (parts with their op rows) |

The e2e suites are the safety net and must stay green through every step:

- `cat-sample` (the queue run and the assemble flight);
- `samples` (bookmarks straighten and fill, earrings, castle);
- the queue spec;
- `journey`.

## 7 · Build order (folds in design/14 §12)

1. **Craft model and repository**, about 1.5 days.
   - Build `CraftDoc` v2, the state classes and the index, the v1 → v2 migration, and `LocalRepository`.
   - `LayerFlowState`'s layer getters read from the craft through an adapter, so the screens don't change yet.
   - Unit tests: migration of the four samples' saved shapes, the index invariants, save and load round trips.
2. **Cut profile and cut plan**, about 1 day.
   - Build `CutProfile` (one per device and material; today's defaults copied over), `planCut` with `one-part-per-sheet`, and the queue / Assemble / Cut adapters.
   - Acceptance: the animations and the e2e suites pass unchanged.
3. **Action set on the craft**, about 1.5 days: design/14 steps 1–2 on `CraftState` (ids are now native), with the history in the doc.
4. **Item frames, new actions, chat tool-calling and recipes**, about 3 days: design/14 steps 3–6, with enhance driven by the brief's `needsEnhance`.
5. **`groups-together` layout**, about half a day: earrings in pairs, charm sets on one sheet, spilling over when needed.
6. **Later:** nest (fit to board), `SupabaseRepository`, multi-device sync.

## Decisions taken

1. **Item frames:** a rectangle matching the item's bounding box (square only when the item is). The long edge is the tier.
2. **Enhance:** the model decides, per item (`needsEnhance` in the brief, with a reason). The chat shows the cost, and it can be undone.
3. **Undo:** a request made of several actions is undone as one group.
4. **Cut and engrave are ops on a part,** not separate layers. Items own parts; groups and joins link by id.
5. **State classes** for Craft, Item, Part and Op over a plain, versioned document. One repository interface: local now, Supabase later.
6. **The Cut plan** is the hand-off: device + material → sheets holding both the engraving and cutting passes. It starts with today's one-part-per-sheet layout as the first cut profile.
