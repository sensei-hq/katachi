# 14 · The action set: one core bundle for the chat, the buttons and the pipeline

Status: proposed (2026-10-30), decisions taken (see the end). Follows 13; the data model it acts on is in 15. Nothing here is built yet.

## Why

Today an edit can come from three places, and each path has its own code:

| Source | Today's code |
|---|---|
| Chat | Keyword regexes (`stackCommand`, `chatCommand`, `parseLayerOp`) and Spark's `/api/layer-op` (one op from a fixed list) |
| Buttons | `layerAction` (a switch over toolbar kinds) |
| Pipeline | `itemPasses`, which calls `refineLayer` directly |

The result:

- **Gaps:** some edits only work from one place. That is why "merge all the engravings" fell through to "noted".
- **Fragile undo:** it works as snapshots placed by hand (`checkpoint`) in a dozen places.
- **No redo, and no "do that again".**
- **Shared core:** the geometry runs on a 0–1000 photo frame shared by every item. A 95 px earring and a 2000 px wall-art panel are traced at the same coarse grain.

The fix is one **action set**: a registry of named, typed actions. Every one takes layers and options and returns layers, and every one runs through one `perform()` that records it on one history stack. The chat, the buttons and the automatic passes all call the same actions.

## 1 · The contract

Every action has the same shape. It takes an array of layers and returns an array of layers. Options say how it runs, and context gives the craft's frame, size and photo. A pure part computes; a thin state part applies, records and narrates.

```ts
// domain/actions/types.ts — pure, no Svelte, no fetch
export type LayerId = string;                        // stable id (uuid), never the stack position

export interface ActionInput<O> {
  targets: LayerId[];                                // resolved before the action runs (see §4)
  opts: O;                                           // validated against the action's schema, defaults filled
}

export interface ActionResult {
  /** layers after the action, keyed by id; a missing id was removed, a new id was created */
  layers: CraftLayer[];
  /** the stack order after the action (ids, back to front) */
  order: LayerId[];
  /** one sentence for the chat: what changed, with numbers ("merged 3 layers into All engravings") */
  summary: string;
  /** optional measurements for the step's detail line (turns, % added, Hausdorff distance…) */
  detail?: string;
  /** a model was used: which one and its cost (shown on the timeline step) */
  model?: { name: string; costUsd: number; latencyMs: number };
}

export interface ActionDef<O> {
  id: ActionId;                                      // 'merge' | 'delete' | 'smooth' | …
  label: string;                                     // button / menu label
  icon: string;                                      // solar icon
  /** how many targets it takes: 'one', 'many' (≥2 for merge), 'any' (0 = whole craft) */
  arity: 'one' | 'many' | 'any';
  /** JSON schema of the options (also the tool schema Spark sees) + defaults */
  schema: JsonSchema; defaults: O;
  /** the phrases the chat fast path recognises before asking Spark (see §5) */
  says?: RegExp[];
  /** deterministic code, or uses a model (Muse Image, SAM): redo then replays the stored result */
  kind: 'code' | 'model';
  /** can it run on this selection? (reason shown on a disabled button) */
  can(craft: CraftDoc, input: ActionInput<O>): true | string;
  run(craft: CraftDoc, input: ActionInput<O>, ctx: ActionCtx): Promise<ActionResult> | ActionResult;
}
```

`ActionCtx` carries the photo pixels (lazy), the craft's real size, the device and board, and the Muse client. A model action never fetches by itself: it goes through `MuseAgents`, which keeps the rule that all model calls go through state.

**What does not belong in the history:** viewing changes such as hide/show, "only this layer", the view mode and selection. They are presentation state, so they stay out of the stack, the way an image editor doesn't undo "zoom".

## 2 · The craft document and stable ids

The actions work on a `CraftDoc`, which is the subset of `LayerFlowState` that edits change:

```ts
export interface CraftDoc {
  order: LayerId[];                                  // back → front
  layers: Record<LayerId, CraftLayer>;
  items: Record<ItemId, CraftItem>;                  // separate items; one item for one-piece art
}
export interface CraftLayer {
  id: LayerId; item: ItemId; name: string; role: 'cut' | 'engrave';
  colour: string; material: string;
  /** geometry in the item's frame (§3): outline loops, holes, as polylines or cubic Béziers */
  geometry: Geometry;
  /** how it was measured (photo colour, tune sliders) so a re-measure can start from it */
  source?: { regionId?: string; tune?: { detail: number; weight: number } };
  visiblePct: number; hiddenPct: number;
}
```

**Stable ids are the first change.** Layers today are addressed by their position `n`, which renumbers after every merge or delete. That forces the name and number gymnastics in the chat. The chat and the buttons can still say "layer 3", but that is resolved to an id when the action is asked for, and stored as the id.

## 3 · Standard frames: every item gets its own canvas

Your proposal: a craft is stored at a set dimension, and a frame of earrings breaks into n separate 256 × 256 crafts. I agree with the idea. I'd make one adjustment: **the tier is the working resolution, not the real size**. Geometry is vector and stored in mm, so it stays exact. The tier decides how finely masks are measured and traced, and therefore how much detail survives.

| Tier | Long edge | For | Typical real size |
|---|---|---|---|
| S | 256 px | earrings, charms, tags | ≤ 60 mm |
| M | 512 px | bookmarks, coasters, ornaments | 60–200 mm |
| L | 1024 px | small wall art, signs, boxes' panels | 200–400 mm |
| XL | 2048 px | large layered wall art, plan sheets | > 400 mm |

- **The long edge sets the tier, and the aspect is kept.** A 50 × 180 mm bookmark at M is 142 × 512 px, so no square padding is wasted on it. A square tile is used only where something needs one, such as the Assemble cells.
- **The tier is picked from both the real size and the detail.** For each item, take the larger of:
  - the tier for its real size;
  - the tier its finest feature needs. Holes should be at least 6 px across. Muse's brief can flag "fine lattice", or code can estimate the finest feature from the crop.
- **Each item owns a transform:**
  - **photo → item frame:** crop box, rotation, scale. This is where straighten lives, as a rotation of the frame and not a rewrite of every point.
  - **item frame → mm:** px per mm, from the real size.
  - Assemble and the cut queue read the mm. The layers page reads the frame.
- **One-piece art is a single item**, e.g. the cat at XL. Separate items (earrings, bookmarks) are n items, each in its own frame. That is the "a frame of earrings breaks into n crafts" idea.
- **A cut plan becomes one item per sheet**, at XL, sized from the board.

**Enhance** (§6) moves an item up a tier.

**Fit to board** happens later, at output: the item mm and the device's board decide the layout. Today that is one item per sheet, upright. Later, several items are nested on one board to cut waste.

## 4 · Targets: how layers are named

One resolver turns what was asked into ids. The chat, the buttons and a recipe all use it.

```ts
type LayerRef =
  | { id: LayerId }                    // buttons: the row's own id
  | { n: number }                      // "layer 3" (position at the time of asking)
  | { name: string }                   // "the swirl drop left" — whole name beats shared words (design/13)
  | { item: string }                   // "the elephant bookmark" → that item's layers
  | { role: 'cut' | 'engrave' }        // "all the engravings"
  | { empty: true }                    // "the 0% layers"
  | { selected: true } | { all: true };
resolve(craft, refs: LayerRef[]): LayerId[]          // de-duplicated, back → front
```

**Ambiguity is a question, not a guess.** If "the left one" matches 4 layers, the chat asks "which of these?" and shows them as chips. The current code merges all of them.

## 5 · One way to run: `perform()`, the history and redo / repeat

```ts
// state/actions.svelte.ts
class ActionState {
  history: Entry[] = $state([]);       // done, newest last (cap 50)
  future: Entry[] = $state([]);        // undone, for redo; cleared by any new action
  async perform(id: ActionId, refs: LayerRef[], opts?: Partial<O>, via: 'chat' | 'button' | 'pass' = 'button'): Promise<Entry>;
  undo(): Entry | null;                // put back `before`; move the entry to `future`
  redo(): Entry | null;                // put back `after` (never re-runs a model); move back to `history`
  again(refs?: LayerRef[]): Promise<Entry>; // repeat the last action with its options, on a new selection
}
interface Entry {
  id: string; action: ActionId; refs: LayerRef[]; targets: LayerId[]; opts: unknown; via: 'chat' | 'button' | 'pass';
  /** only what changed: the affected layers before / after, and the order before / after */
  before: { layers: Record<LayerId, CraftLayer | null>; order: LayerId[] };
  after:  { layers: Record<LayerId, CraftLayer | null>; order: LayerId[] };
  summary: string; at: number;
}
```

**What `perform` does, every time:**

1. Resolve the refs, fill the defaults and validate the options. A bad request goes back as a question.
2. Call `can()`. If it fails, the chat says why and nothing is recorded.
3. Open a timeline step ("Smoothing the Fox bookmark…"), with the model call on it if the action uses one.
4. `run()` returns layers and order.
5. Diff them against the current doc, store `before` and `after` for the changed ids only, push to `history`, and clear `future`.
6. Apply the result and save. The history is saved with the craft in IndexedDB, so undo survives a reload.
7. Close the step with the summary and detail, plus **Undo** as an action on the step itself.

**Undo and redo.** Your list has redo as "repeats the previous action". There are two different things there, and both are useful:

- **Redo** brings back what Undo took away. It replays the stored `after`, so a model-made result (enhance) comes back exactly as it was, not re-generated.
- **Again** ("do that again", "same for the phoenix") runs the last action once more with the same options, on new targets, or on the same ones (e.g. one more smoothing pass).

**Groups.** An automatic pass, or a chat request that becomes several actions, is recorded as **one group**. "Straighten and fill the bookmarks" is one Undo. A group is an `Entry` with `children`, and undo walks its children in reverse.

**Determinism.** Code actions are pure functions of (doc, input, photo), so redo by replay and redo by re-run give the same result. Model actions are not, which is why redo always replays.

## 6 · The catalogue

Options are the knobs: how aggressive, how many passes. Each has a default, so a button press or a bare "smooth it" just works.

| Action | Arity | Options (defaults) | What it does | Kind |
|---|---|---|---|---|
| **merge** | many | `name?`, `keep: 'front'\|'back'` (front) | Unions the geometry. Role and item are kept only if all the targets share them. | code |
| **delete** | any | — | Removes the targets. Their source regions stay with the photo. | code |
| **duplicate** | one | `offsetMm` (0) | Copies a layer under a new id. | code |
| **split** | one | `by: 'islands'\|'tone'\|'item'` (islands) | Splits into pieces. | code |
| **reorder** | one | `to: 'front'\|'back'\|number` | Moves a layer in the stack. | code |
| **set-role** | any | `role: 'cut'\|'engrave'` | Changes which pass it is. | code |
| **straighten** | any (items) | `mode: 'long-axis'\|'edges'\|'level'` (long-axis), `snapDeg` (0.5) | Turns each item upright by rotating its frame transform. Idempotent: twice is the same as once. | code |
| **interpolate** (fill missing) | any | `method: 'hull'\|'mirror'\|'model'` (hull), `maxAddPct` (25) | Fills what a neighbour hid. `hull` is today's `complete`. `mirror` uses the item's symmetry, e.g. earrings come in pairs and bookmarks have frames. `model` asks Muse Image to imagine the hidden part, then code traces it. Holes are kept. | code / model |
| **fill** | any | `holes: 'all'\|'small'` (all), `maxHoleMm²` | Makes one solid outline (a backing). | code |
| **smooth** | any | `strength` 1–5 (2), `passes` 1–3 (1), `keepCorners` (true), `cornerDeg` (35) | See below. | code |
| **simplify** | any | `toleranceMm` (0.1) | Fewer points, same shape (Ramer–Douglas–Peucker). Helps engraving files. | code |
| **bolder / thinner** | any | `mm` (±0.3) | Offsets the outline by a distance in mm, so the change is the same for small and large items. | code |
| **detail** | any | `level` 1–5 | Today's tune slider: re-measures the layer from the photo. | code |
| **resize** | any (items) | `w?`, `h?` in mm or `scale?`; `keepAspect` (true) | Changes the item's frame → mm transform only. The geometry is untouched. | code |
| **enhance** | any (items) | `tier: 'auto'\|'S'..'XL'` (auto, one tier up), `resegment` (true) | See below. | model |
| **remove-colour / add-colour** | one | `colour` | Today's ops. | code |
| **draw** | one | `shape`, `mode: 'add'\|'erase'` | The line and circle tools. | code |
| **move** | any | `dxMm`, `dyMm` | Moves a layer. | code |
| **fit-to-board** *(later)* | any | `board: device` (from the device), `spacingMm` (3), `allowRotate` (true) | Nests the items' pieces onto the device's boards, to waste less material. | code |

**More actions** (added 2026-10-30):

| Action | Scope | Options (defaults) | What it does, and when it's needed |
|---|---|---|---|
| **flip** | item | `axis: 'x'\|'y'` (x) | Turns the item over in place. The item frame's `flipX` / `flipY` changes; the geometry doesn't. **When:** cutting from the back (laser scorch stays off the good face), iron-on vinyl (it must be cut mirrored), a kit part drawn the wrong way round. The run and Assemble show the face-down side. |
| **mirror** | item | `axis` (x), `pair` (true) | Makes a mirrored *copy* as a new item. **When:** the other earring of a pair, the left and right walls of a box, symmetric wings. With `pair`, the two become a `pair` group, so they are cut together. |
| **rotate** | item | `deg` (90), `snap` (true) | Turns the frame by an angle (straighten is the automatic version). |
| **align** | item or part | `to: 'centre'\|'left'\|'top'…`, `relativeTo: 'first'\|'backing'` | Lines things up. **When:** stacked art whose layers drifted, a set of charms laid out together. |
| **distribute** | item | `gapMm` (5) | Even spacing between items (a given layout, or before fit-to-board). |
| **quantity** | item | `qty` (2) | How many to make, e.g. 5 of the same charm. A count on the item, not 5 copies to edit; the cut plan places it `qty` times. |
| **offset** | part | `mm` (2), `as: 'grow'\|'new-part'` (grow) | Grows or shrinks an outline by a distance. `new-part` adds a border or backing behind it ("give the cat a 3 mm black border"). |
| **weld** | part | — | Unions pieces that touch or overlap, so they cut as one shape with no internal cut lines. Standard in paper craft (script lettering, overlapping petals). |
| **bridge** | part | `widthMm` (1), `per` (2) | Adds small tabs across a hole so a floating island (the middle of an O, a fretwork leaf) stays attached instead of falling out. Code finds the islands: a piece nested inside a hole. The chat warns when it sees them ("3 pieces would fall out of the Fox bookmark"). |
| **add-hole** | item | `diaMm` (3), `at: 'top'\|point` (top) | Adds a hanging hole: earring hook, ornament string, bookmark tassel. It's placed on the item's axis, inset from the edge by its diameter. |
| **rename / recolour** | part | `name` · `colour`, `material` | Recolouring or changing material changes which sheets it goes on (cut plan). |
| **group / ungroup** | item | `kind: 'pair'\|'set'`, `rule` | Pairs and sets, design/15. |

**Kerf** compensation (offsetting each cut by half the beam or blade width) is not an action. It belongs to the **cut profile** (design/15 §5), because it depends on the machine and material, not the design.

**Smooth.** This is the action you described:

1. Resample the outline evenly.
2. Find the corners: points where the turn is sharper than `cornerDeg` stay as anchors.
3. Fit **cubic Bézier segments** between neighbouring anchors (Schneider's curve fitting). Each segment is two end points plus two control points, which is your "two-point Bézier".
4. The fitting tolerance comes from `strength`: 1 = 0.05 mm, 5 = 0.6 mm at the item's real size.
5. `passes` runs Chaikin corner-cutting before the fit, for very jagged input.
6. The result is stored as Béziers.

**Guarantee:** the smoothed outline stays within `tolerance` of the original (a Hausdorff distance check). The step reports it, e.g. "≤ 0.2 mm from your shape".

**Downstream of smooth:** SVG export keeps the `C` curves. The G-code flattens them to `G1` segments at a 0.02 mm chord error, because GRBL has no cubic moves.

**Enhance.** Crop the item from the **original photo** at full resolution and upscale it to its target tier with a code resampler (Lanczos).

- The more important part is that, by default, it then **re-runs SAM on the crop**. SAM on a tight, upscaled crop gives a far finer mask than on the whole photo. The holes are then measured again (`woodPiece`).
- Upscaling alone adds no real detail; the re-measure is where the gain comes from.
- A Muse Image upscale can be the `model` variant later, if one is available.
- Enhance costs one SAM call per item, and the step shows it.

**Rules every action follows:**

1. Inputs and outputs are layer arrays.
2. Options are typed, with defaults and bounds.
3. Each produces a one-line summary with numbers.
4. Nothing outside the targets changes. `can()` and the tests check this.
5. Holes are preserved unless the action is about holes.
6. Items keep their own frame. Nothing is ever re-traced from the 0–1000 photo frame again.

## 7 · The chat: Spark calls the actions as tools

The registry is the tool list:

- Each `ActionDef` becomes one tool with its JSON schema.
- `/api/layer-op` becomes `/api/actions/plan`.
- Spark gets the user's words, the layers (id, number, name, item, role, % shows) and the selection.
- It returns a **plan**: an ordered list of calls `{ action, targets: LayerRef[], opts }`, plus one reply sentence.
- Code validates the plan against the schemas and runs it through `perform()` as one group.

Examples:

| Said | Plan |
|---|---|
| "smoothen the curves on the fox, a lot" | `smooth({item:'Fox bookmark'}, {strength:4})` |
| "merge all the engravings and make it bolder" | `merge({role:'engrave'})`, then `bolder({…result}, {mm:0.3})` (one undo) |
| "can you enhance the small earrings?" | `enhance({item:…}×n, {tier:'auto'})`. The chat says what it costs before running if it is more than, say, $0.05. |
| "undo" / "redo" / "do that again for the phoenix" | `undo()` / `redo()` / `again([{item:'Phoenix bookmark'}])` |

**Fast path first.** Each action's `says` patterns catch the common, unambiguous phrases ("undo", "delete layer 5", "merge layers 2-4") in code, with no model call, no cost and no wait. Only what they don't catch goes to Spark. Today's regexes move into the action definitions instead of being scattered through `app.svelte.ts`.

**Models reason, code does geometry.** Spark only picks actions, targets and options. It never emits coordinates. That is the PRD rule.

## 8 · The screen: buttons, icons, menus

- **Layer actions:** the row toolbar, the work-area toolbar and the right-click menu are generated from the registry: `label`, `icon`, `arity`, and `can()` for the disabled state with its reason.
- **Options:** a button runs with the defaults. A long press, or the "⋯" next to it, opens the action's options (sliders for strength and passes, mm fields for resize) built from its schema.
- **Everything is said in the chat:** a button press shows as "You: Smooth the Fox bookmark (strength 2)", then the step. That is the same as today, now in one place.
- **Undo and Redo** sit on the work-area toolbar. Each one's tooltip names its action ("Undo: merge 3 layers"). Shortcuts are ⌘Z and ⇧⌘Z, and "Again" is ⌘Y.

## 9 · The pipeline uses the actions too

The analysis stays as it is (Spark → SAM → measure). After it, the passes become a **recipe**: a saved list of action calls run as one group. For separate items:

```ts
const itemsRecipe = [
  { action: 'enhance',     refs: [{ all: true }], opts: { tier: 'auto' }, when: 'item below its tier' },
  { action: 'straighten',  refs: [{ all: true }] },
  { action: 'interpolate', refs: [{ all: true }], when: 'hiddenShare > 0.12' },
  { action: 'smooth',      refs: [{ role: 'cut' }], opts: { strength: 1 } },
];
```

**Benefits:**

- The passes can be undone ("undo the straighten").
- They are the same code as the buttons.
- A recipe can be reused: "do the same to these earrings". Later it can also be learned from what the user did to the last craft of the same kind.

## 10 · Where the code goes

```
domain/actions/            pure: types, registry, resolve(), each action's run(), geometry helpers
  types.ts  registry.ts  resolve.ts  history.ts (diff / apply / invert)
  merge.ts delete.ts … smooth.ts (bezier fit) resize.ts straighten.ts interpolate.ts enhance.ts
domain/geometry/           Geometry type (polyline | bezier loops), offset, union, hull, flatten, hausdorff
state/actions.svelte.ts    ActionState: perform / undo / redo / again, timeline steps, save
server/meta/actions-plan.ts Spark tool-calling over the registry (replaces layer-op.ts)
```

This keeps today's rules:

- Presentation calls state only.
- Model calls go through `MuseAgents`.
- `domain/` stays pure, so each action can be unit-tested without a browser.

## 11 · Tests every action must pass

The same checks are generated for every registered action:

- **Undo is identity:** run, then undo, gives back the doc you started with.
- **Redo:** run, undo, redo gives the same doc as just running it.
- **Only the targets change:** layers outside the targets are byte-identical afterwards.
- **Schema:** the defaults validate, and out-of-bounds options are refused with a reason.

Per action:

- **straighten** is idempotent.
- **smooth** stays within its Hausdorff tolerance and keeps its corners.
- **resize** keeps the aspect and reaches the mm it was asked for.
- **merge then split** gives back the pieces.
- **interpolate** adds no more than `maxAddPct` and keeps the holes.
- **Samples:** the e2e suite runs the four samples through recipes and chat phrases.

## 12 · Approach: build order

Each step leaves the app working.

1. **Ids and the history**, about 1 day.
   - Give every layer a stable id; migrate saved crafts (id from position on load).
   - Build `ActionState` (perform / undo / redo / again) and the Entry diff/apply.
   - Swap today's `checkpoint()` calls for it.
2. **Register what exists**, about 1 day.
   - Wrap today's operations as actions, unchanged inside: merge, delete, duplicate, split, straighten, interpolate (hull), fill, bolder/thinner/detail, remove/add colour, draw, move, set-role.
   - Generate the layer toolbars from the registry.
   - Move the regexes into each action's `says`.
3. **Frames per item**, about 1–2 days.
   - Each item gets a crop/rotation/scale transform and its tier.
   - Straighten and resize become transform edits.
   - Re-tracing happens per item in its own frame.
4. **New actions**, about 1–2 days.
   - smooth (Bézier fit, with curves carried through SVG and flattened for G-code), simplify, resize, enhance (crop, upscale, re-segment).
5. **Chat tool-calling**, about 1 day: `/api/actions/plan` with the registry as tools, plans as groups, a question when something is ambiguous.
6. **Recipes**, about half a day: the analysis passes become recipes.
7. **Later:** fit-to-board nesting, the model variants (interpolate with Muse Image, model upscale), and learning recipes from what the user did.

## Decisions (2026-10-30)

1. **Tier shape:** a rectangle matching the item's bounding box (square only when the item is square). The long edge is the tier.
2. **Enhance:** the model decides, per item: Spark's brief marks `needsEnhance` with a reason. The chat shows the step and its cost, and it can be undone.
3. **Groups:** a chat request that becomes several actions is undone as one group.

The craft document these actions work on (Craft → Items → Parts → Ops, with state classes and one repository) and the hand-off to the machine (the Cut plan) are designed in [15](15-craft-model-and-cut-plan.md). There, cut and engrave become ops on one part rather than separate layers, and the build order in §12 is folded into 15 §7.

## 10 · The clean-up pass, and the planner re-running a stage (2026-10-31)

**Clean-up** runs after the layers on every craft the action engine handles. It is one step in the chat and one undo:

| Action | What it does |
|---|---|
| `tidy` | Drops specks and pin-holes under 1 mm², and thin wire bits on the outline (an earring's hook, a bookmark's cord). The wire is removed by an opening of the outer outline only, so fretwork bars inside are never touched. One-piece pictures keep their outline as traced. |
| `repeat-pattern` | Holes that repeat (3 or more within 20 % in area and size) become identical copies of the median one, each placed where its original was. |
| `symmetrize` | An item within 4 % of mirror symmetry about its upright axis is made exactly symmetric, built from its left half. Others are left alone and named in the step. Separate items only. |
| `smooth` | Every layer, strength 2 (0.1 mm), one pass. A loop the fit can't follow keeps its traced shape. |

Speed: the Bézier fit samples a loop at most about 1500 times, `rasterisePaths` reads plain edge arrays, and the bridge flattens curves to half a photo unit. Together these keep the pass well under a second on the cat.

**The planner re-runs stages.** Besides the craft's actions, Spark is offered `remove-background`, `find-items {count}`, `regroup-colours {k}` and `clean-up`. They are offered only where they apply.
- A rebuilt breakdown runs its own passes (upright, hidden edges, clean-up), so those calls are not repeated.
- With `count`, the chat says when SAM finds a different number. It never pads.
- Anything the fixed phrases miss goes to the planner before being noted. When the planner answers in words, that answer is said instead of "Noted".

**Separate items that overlap** (fanned bookmarks): when the subject phrase returns fewer masks than items, each item is asked for by its own phrase. A mask is taken only if it is one item's size (not 1.8× or more) and not already another item's.

**Pairs by shape:** earrings, cufflinks and studs that Spark numbers rather than naming left and right are paired when two neighbours have the same size and cut area.
