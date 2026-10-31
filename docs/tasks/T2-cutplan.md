# T2 · Cut plan: profiles, `planCut`, and the queue adapter (`app/src/lib/domain/cutplan`)

**Goal:** turn a craft (`CraftDoc`, design/15) into sheets for one device + material (`CutProfile`), and adapt each sheet to what the cut queue and its animation consume today. This must reproduce today's behaviour exactly for the default layout, so the screens can switch to it unchanged (task L3).

## Files

- `cutplan/profiles.ts`: `defaultProfiles: CutProfile[]` and `profileFor(device: DeviceId, material: string): CutProfile`.
- `cutplan/plan.ts`: `planCut(craft: CraftDoc, profile: CutProfile, rev?: number): CutPlan`.
- `cutplan/queue.ts`: `toQueueInput(sheet: Sheet, craft: CraftDoc, profile: CutProfile): NewQueueItem`. Import the type `NewQueueItem` from `state/queue.svelte.ts`; type-only imports are allowed.
- Spec files for each.

## Profiles (copy today's values)

**Devices:**

- `cricut`: blade, mat 304.8 × 304.8 mm (12 × 12 in), margin 5, spacing 3, kerf 0.
- `xtool`: laser, bed 300 × 300, kerf 0.15.
- `glowforge`: laser, bed 495 × 279, kerf 0.2.
- `file`: blade, board 304.8 × 304.8.

**Settings:** feed and power from `domain/toolpath.ts` `program()` defaults (cut: feed 600, power 900, 1 pass; engrave: feed 3000, power 250, 1 pass; score: feed 1500, power 400, 1 pass). Blade machines ignore power.

**Default `layout`:** `'one-part-per-sheet'`. `profileFor` picks the device's profile and sets the material.

## `planCut`, layout by layout

**Frame → mm, for every op's geometry** (`craft/types.ts` `Frame`):

1. Flatten with `geo.toLoops(g, 0.05 * pxPerMm)`.
2. Build a matrix with `geo`:
   1. rotate by `frame.fromSource.rotateDeg` about the item's frame centre;
   2. apply `flipX` / `flipY` about the same centre;
   3. scale by `1 / pxPerMm`;
   4. translate so the part's bbox (in mm) sits at (`marginMm`, `marginMm`).

**Per layout:**

- **`one-part-per-sheet`:** one sheet per part, in item order then `z` order.
  - The sheet's passes are the part's ops: engrave and score first, then cuts, inner loops (holes) before outer loops (`geo.depths`).
  - `sizeMm` = the part's bbox + 2 × margin.
  - `name` = `${item.name} · ${part.name}`, or `part.name` if the craft has one item.
  - `colour` / `material` come from the part.
  - `forStep = { itemId, z: part.z }`.
- **`one-item-per-sheet`:** all of an item's parts on one sheet, overlaid as in the item (the bookmark case: engraving + cut together).
- **`groups-together`:**
  - The items of a `pair` / `set` group with rule `same-sheet` share sheets. Use `domain/nesting.ts` `nestParts` (shelf packing) on the parts' mm bboxes, with `spacingMm`, inside `board − 2 × margin`.
  - If they don't fit, spill onto more sheets. A `pair` is never split across sheets: when one pair doesn't fit, it gets its own sheet.
  - Items not in a group are laid out as in `one-part-per-sheet`.
- **`given`:** throw `Error('layout "given" lands with the kit layout')`; it comes later.
- **`nest`:** same, `('fit to board lands later')`.
- **`qty`:** an item with `qty > 1` is placed `qty` times. In `one-part-per-sheet` that means `qty` sheets, `name` suffixed `(1 of 3)`.
- **Ids:** sheet ids are deterministic: `${partId}` or `${groupId}:${k}`, with `:${copy}` for qty. `n` is 1-based in order.
- **Material:** a sheet never mixes materials. In `groups-together`, parts of different materials go on different sheets.

## Queue adapter

`toQueueInput` returns exactly today's `NewQueueItem` fields:

- `craftId`, `craftName`
- `layer`: the sheet's `n`
- `name`, `material`
- `op`: `'engrave'` when every pass is engrave/score, else `'cut'` (today's queue has one op per sheet; a mixed sheet reports `'cut'` and its passes list every op in order)
- `colour`
- `machine`: from the profile
- `cut`: the SVG `d` of all passes, in mm, `geo.toSvgD`-style polylines
- `shapes`: all passes' `shapesMm`, in pass order
- `sheetMm`: `sheet.sizeMm`

This lets `CutRun` and the queue's program panel run unchanged.

## Tests (at least)

Build small `CraftDoc` fixtures in the spec (a helper `craftOf(...)`). Cover:

- **Cat-like:** 1 item × 4 parts, cut only → 4 sheets, z order back → front, each sized bbox + 10.
- **Bookmark-like:** 2 items × 1 part (engrave + cut with a hole). In one-part-per-sheet: 2 sheets, passes in the order engrave, hole cut, outline cut. In one-item-per-sheet: the same.
- **Rotate / flip:** a 10 × 40 frame turned 90° → a sheet 50 × 20 (with margins). `flipX` mirrors the passes, and winding is kept (use `geo.transform`).
- **Pair:** two 30 × 60 earrings in a `pair` group, `groups-together`, on a 300 × 300 board → 1 sheet with 2 placements, spacing respected, no overlap.
- **Spill:** 20 earrings in a `set` with `same-sheet` on a small board → several sheets, every placement inside its board.
- **`qty: 3`** → 3 sheets.
- **Materials:** gold vs black parts never share a sheet.
- **`toQueueInput`:** for the cat-like craft, matches today's shapes: `cut` starts with `M`, `shapes` are in mm inside `sheetMm`, `op` is `cut`.

## Out of scope

- Screens, state, persistence.
- Kerf compensation: leave a `// kerf: applied by the program, later` note.
- The `given` and `nest` layouts.
