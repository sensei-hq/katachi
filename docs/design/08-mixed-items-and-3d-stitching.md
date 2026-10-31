# 08 · Mixed multi-object photos + 3D six-view stitching

Status: implemented 2026-10-28 (mixed items end-to-end; stitch v1 as
`domain/stitch.ts` wired through `layers.unfold`). Models perceive; code
measures and builds geometry — same rule as doc 01.

## A. One photo, several objects, some layered

A photo can hold N finished objects. Some are single-layer cuts (a bookmark),
some are themselves stacked (a layered cat ornament next to two bookmarks).
One global "stack vs single" decision is wrong; the unit of classification
is the **item**.

Pipeline:

1. **Classify (Spark, S2).** `ImageBrief.arrangement = multiple-items`, and
   `brief.items[]` carries one entry per separate object, left→right, each
   with its **own** `arrangement` (`stacked` | `single-item`) and, when
   stacked, its own internal `regions[]` (back→front). Bought accessories
   (tassels, cords, hoops) stay `likelyBought` and are never cut.
2. **Instance separation (SAM, code-matched).** One generic SAM call with
   `subjectPrompt` returns every instance mask at once (verified: 5/5 on
   bookmarks). Instances sorted by box-x match items in Spark's left→right
   order. Per-item positional prompts are *not* used for separation — SAM
   ignores them stochastically.
3. **Per-item internals (SAM, scoped).** For a `stacked` item, each internal
   region phrase is segmented on the full photo; the accepted mask is the
   decoded mask whose centre falls inside the item's box (others are other
   items' parts). A `single-item` item needs no internal call: its instance
   mask is its outline.
4. **Layers = flattened item layers.** `planLayers` emits, per item: one
   layer for a single item; one layer per internal region for a stacked
   item. Every layer carries `regionId` (its mask + photo colour) and
   `itemName`. Sheets are one per layer as usual; Gaps hidden-% only
   applies within a stacked item (single items: 0%).
5. **Assembly groups by item.** Single item → "Cut X". Stacked item →
   lay-out + add-sheet steps for its layers only, then the next item.
   Bought parts are attached last.

Failure modes: an item whose instance mask is missing keeps its box
outline; an internal region with no scoped mask falls back to the item
outline (labelled in the trace, never silently).

## B. 3D object from six views

The six photos are **one object seen six times**, not six objects — the
bookmarks instance trick does not transfer. The stitcher is code
(`domain/stitch.ts`), fed by SAM silhouettes:

1. **Silhouette per view (SAM).** Each captured view is segmented with the
   subject prompt; the mask box (0–1000 coords) gives that face's aspect
   ratio and coverage. No view → that face is guessed and flagged.
2. **Registration (code).** Front box gives W:H, a side box gives D:H, top
   gives W:D. Shared edges must agree: H from front vs side within 15%,
   else a warning is recorded and the front wins. Opposite views with
   near-equal ratios are marked symmetric (cut ×1, use twice).
3. **Scale (code).** The longest reconstructed dimension is set to the
   craft's target size (outline `sizeMm`, default 300 mm); a size
   reference in frame, when present, replaces this in a later slice.
4. **Panels (code).** Six panels (front, back, left, right, top, base)
   sized from W×D×H; joined-edge dimensions are reduced by material
   thickness so panels fit *between* their neighbours.
5. **Joinery (code).** An edge-pairing table joins: base↔front/back/left/
   right, top↔front/back/left/right, and the four vertical corners — each
   with the chosen kind (finger / tabs / butt) and 90° angle. Finger/tab
   tooth geometry is generated at export time from thickness + kerf; the
   table is the contract it is generated from.
6. **Sheets + assembly.** Each panel becomes a layer whose sheet is its
   rectangle at cut size (art cutouts from a view are a later slice);
   assembly steps follow the join table: base, front/back, sides, top.

Checks that must hold (unit-tested): consistent views reproduce the input
ratios in mm; a missing side is guessed from its opposite with a warning;
an inconsistent height pair warns and keeps the front; every panel edge
that must join appears exactly once in the join table.
