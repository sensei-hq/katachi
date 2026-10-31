# T5 · Sheet files: SVG and DXF export, SVG import (`app/src/lib/domain/files/`)

**Goal:** a cut plan's sheets become files a maker can open in their own software. A maker's own SVG (an original kit file) becomes a craft at exact geometry: no photo, no approximation. This is the precise path the castle needed ("import the original SVG / DXF").

## Files

- `files/svg.ts`:
  - `sheetToSvg(sheet: Sheet, opts?): string`;
  - `svgToCraft(svg: string, opts: { name: string; newId: () => string; mmPerUnit?: number }): CraftDoc`.
- `files/dxf.ts`: `sheetToDxf(sheet: Sheet): string`.
- Specs.

No other files.

## Export

- **SVG** (`sheetToSvg`):
  - Units are mm: `width="…mm" height="…mm"` and `viewBox` in mm.
  - One `<g>` per pass kind, in machine order, with ids `engrave`, `score`, `cut`.
  - Colours by convention (Glowforge, LightBurn and xTool read them): cut red `#FF0000` at stroke 0.1 mm, score blue `#0000FF`, engrave black fill `#000000`.
  - Closed paths end in `Z`.
  - Each part's paths are grouped in a `<g data-part="…">`.
- **DXF** (`sheetToDxf`):
  - AutoCAD R12 ASCII (the most compatible): `LWPOLYLINE` is fine, or `POLYLINE` / `VERTEX` / `SEQEND` for R12 strictness. Pick one and say which.
  - Layers `CUT`, `SCORE`, `ENGRAVE`. Units mm (`$INSUNITS` 4). Closed flag set on closed loops.
  - It must open in LibreCAD and import into Inkscape; check one by hand if you can, and say so in the hand-back.

## Import (`svgToCraft`)

- **Parsing:** `<path>`, `<polygon>`, `<polyline>`, `<rect>`, `<circle>` and `<ellipse>`, with `transform` on the elements and their groups (`matrix`, `translate`, `scale`, `rotate`). Path commands M L H V C S Q T A Z, absolute and relative. Arcs go to cubics.

  You may add **one** dependency for the path parsing if it is small and MIT (e.g. `svg-path-parser`, or `svgpath`, which also does transforms and arcs). Otherwise write it.
- **Units:** from `width`/`height` with mm, cm or in units and the `viewBox`, else `mmPerUnit` (default 25.4 / 96).
- **Kinds:** stroke red (or no fill with a red-ish stroke) → `cut`; blue → `score`; black or filled → `engrave`. Unknown colours → `cut`.
- **Pieces:** each connected outline, with its holes (even-odd nesting, `geo.depths`), becomes a **part** of one item `kind: '3d'`, `build: 'assembly'`. Engravings and scores inside a part's outline go to that part's ops.
- **Frame:** the item's frame is tier XL over the whole drawing, at the measured `pxPerMm`. Use `craft/index.ts` `frameSize`.
- **Output:** the result passes `craft/index.ts` `validate()`.

## Tests (at least)

- **Round trip:** a planned sheet (build one with `planCut` from a small `CraftDoc` fixture) → `sheetToSvg` → `svgToCraft` → `planCut` again gives the same loops within 0.01 mm, the same pass kinds, and the same part count.
- **Real-world SVG:** a `<g transform="translate(10,10) scale(2)">` with a `<rect>`, a `<circle>` with a hole (even-odd path) and a blue score line → 2 parts, the circle's part with 1 hole, the score inside the right part, at the right mm.
- **Units:** `width="100mm" viewBox="0 0 1000 1000"` gives 0.1 mm per unit; `in` and `cm` work too.
- **DXF:** the output parses back with a minimal reader in the test (count the entities per layer, closed flags, first vertex coordinates).

## Out of scope

- Screens and download buttons (Claude wires those to the Cut page).
- DXF import.
