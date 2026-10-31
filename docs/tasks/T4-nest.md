# T4 · Fit to board: the `nest` layout (`app/src/lib/domain/cutplan/nest.ts`)

**Goal:** implement `layout: 'nest'` in `planCut`. Parts are packed onto as few boards as possible, to waste less material. Today `planCut` throws `'fit to board lands later'` for it.

## Files

- `cutplan/nest.ts`: `nestOnBoards(parts: NestInput[], board, opts): NestResult`.
- A wiring change in `cutplan/plan.ts`: route `nest` to a `planNest(...)`, keeping every other layout unchanged.
- Specs for both.

No other files.

## Contract

- **Input:** `NestInput { partId, itemId, loopsMm: Pt[][] (outline + holes, at the origin), material, colour, qty, groupId?, keepTogether? }`.
- **Output:** per sheet, placements `{ partId, itemId, at, rotateDeg }` that the existing `Placement` type can hold. Passes are built the same way `planParts` does (engrave/score first, then holes, then outlines), shifted to each placement.

**Rules:**

- **Packing:** bottom-left fill on the parts' *outlines*, not just their bounding boxes. Rasterise each part at 1 mm (or 0.5 mm when the board is small) on an occupancy grid, dilated by `spacingMm`.
  - Try rotations 0/90/180/270, plus 45° steps when `allowRotate` is set (rotation is allowed by default).
  - Place the largest parts first.
  - A part may sit inside another part's *hole* if it fits (earrings in a bookmark's cut-out). The grid handles this for free: holes are empty cells.
- **Inside the board:** every placement stays within `board − 2 × marginMm`.
- **Materials:** a sheet never mixes materials (as in T2). Different materials go on different sheets.
- **Pairs and sets:** a `pair` group (`rule: 'same-sheet'`) is placed together or not at all (as in T2). Sets may spill.
- **Deterministic:** the same input gives the same output. No `Math.random`; tie-break by part id.
- **Speed:** 50 earrings on a 300 × 300 board in under 1 s in Node.

## Tests (at least)

- **Rectangles:** 20 rectangles of 50 × 30 on a 300 × 300 board, margin 5 → 1 sheet; no two placements overlap (check with the occupancy grid); all inside the margin.
- **Rotation:** an L-shaped part and its 180°-rotated twin nest into roughly one bounding box (the combined bbox area is under 1.3 × the sum of the two parts' areas).
- **Parts inside holes:** a 200 × 200 ring (hole 150 × 150) plus a 100 × 100 square → 1 sheet, with the square's placement inside the hole.
- **Pairs:** pairs are never split across sheets; materials never mix.
- **Determinism:** two runs give deep-equal output.
- **`planCut` with `layout: 'nest'`:** passes per sheet are in machine order (engrave, holes, outlines); `qty: 3` places 3 copies.

## Out of scope

- Arbitrary-angle rotation.
- True no-fit-polygon nesting (the grid is enough).
- Screens.
