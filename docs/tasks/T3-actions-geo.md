# T3 · Geometry actions as `ActionDef`s (`app/src/lib/domain/actions/defs`)

**Start after T1 lands.** Implement these actions against the contract in `domain/actions/types.ts`, one file each in `actions/defs/`, exporting `const <name>: ActionDef<Opts>`:

- `flip`, `mirror`, `rotate`, `quantity`
- `smooth`, `simplify`, `offset`, `weld`, `bridge`
- `add-hole`, `align`, `distribute`

The registry, `perform`, history and chat wiring are task L2/L4 (Claude). You only write pure definitions.

## Each action

- **`run` is pure.** It returns *whole* changed `ItemDoc`s (deep-copied, never mutated in place), plus new items and groups, plus a one-line `summary` with numbers.
- **Targets are ids:** a part id for `scope: 'part'`, an item id for `scope: 'item'`. They are already resolved.
- **`can()`** returns a short human reason when the action can't run. Examples:
  - "Pick two or more layers to merge";
  - "This layer has no islands to bridge".
- **`schema`:** JSON schema for the options, with `minimum` / `maximum`. **`defaults`** are the ones in design/14 §6.
- **`says`:** regexes for the obvious phrasings, with named groups for options. For example, `/\bflip\b.*\b(?<axis>horizontal|vertical)/i` maps horizontal → x and vertical → y.
- **`hint`:** one sentence for the chat model, e.g. "Turn an item over in place (cut from the back, iron-on vinyl)."
- **`kind: 'code'`** for all of these.
- **`ctx.newId()`** supplies new ids. Never use `Math.random` or `crypto` directly.

## Specifics

- **`flip`** (item; `axis`): toggles `frame.flipX` / `flipY`. Geometry unchanged. Summary: "Flipped the Fox bookmark left-to-right (cut face down)".
- **`mirror`** (item; `axis`, `pair` = true):
  - New item: a deep copy with new ids for the item, parts and ops; name `${name} (mirrored)`.
  - Geometry transformed with `geo.flip` about the frame centre (it's a new shape, not a flag).
  - With `pair`, add a `GroupDoc { kind: 'pair', rule: 'same-sheet' }`, or add it to the item's existing pair group.
  - `select` the new item.
- **`rotate`** (item; `deg` = 90, `snap`): adds to `frame.fromSource.rotateDeg`, normalised to (−180, 180]. With `snap`, round to 0.5°.
- **`quantity`** (item; `qty` 1–99): sets `item.qty`.
- **`smooth`** (part; `strength` 1–5 = 2, `passes` 1–3 = 1, `keepCorners` = true, `cornerDeg` = 35):
  - The tolerance in mm comes from strength: [0.05, 0.1, 0.2, 0.35, 0.6]. Convert to frame px with `item.frame.pxPerMm`.
  - Apply `geo.smooth` to every op of the part (cut and engrave).
  - The `detail` reports `geo.hausdorff` in mm: "within 0.18 mm of your shape".
- **`simplify`** (part; `toleranceMm` = 0.1).
- **`offset`** (part; `mm` = 2, `as` = grow | new-part):
  - `grow`: offset the cut op.
  - `new-part`: add a new part at `z` = min z − 1 (behind), with a cut op = offset of the union of the part's cuts. Named "Border", material and colour from the options or the part.
- **`weld`** (part): `geo.weld` on the cut op. The summary counts loops before and after.
- **`bridge`** (part; `widthMm` = 1, `per` = 2): `geo.bridge` on the cut op. `can()` is false when `geo.islands` is empty. The summary is "3 islands bridged — nothing falls out".
- **`add-hole`** (item; `diaMm` = 3, `at` = top):
  - Find the cut part with the lowest z (the outline).
  - Place a circle (as 4 cubic segments) on the item's long axis, `diaMm` inset from the top edge of the outline (top = smallest y after the frame's rotation).
  - Subtract it from that part's cut op (`geo.difference`).
  - `can()` is false if the hole would come within 1 mm of the edge.
- **`align`** (item or part; `to`, `relativeTo` = first): moves bounding boxes. Item: change `frame.fromSource.box`. Part: translate its ops' geometry.
- **`distribute`** (item; `gapMm`): even gaps along x, keeping order.

## Tests

One spec per action, using a fixture builder (`actions/defs/fixtures.ts`: `craftOf({ items: [...] })` with simple squares, rings and "O" shapes in frame px, `pxPerMm` = 4).

Every action:

- leaves untargeted items deep-equal to the input;
- leaves the input craft unmutated (`structuredClone` before, `toEqual` after);
- refuses out-of-range options through `can()` or schema validation.

Specific:

- **`flip` twice** = the original.
- **`mirror`:** the bbox is the same size, the geometry is mirrored, the pair group is created, ids are all new.
- **`smooth`** keeps the area within 3% and hausdorff within tolerance.
- **`bridge`** leaves no islands.
- **`add-hole`** reduces the area by π r² within 2%.
- **`quantity`** is bounded 1–99.

## Out of scope

- merge / delete / split / straighten / interpolate / resize / enhance and the colour ops: Claude, since they touch the analysis state.
- Registry, history, chat.
