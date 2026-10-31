# 13 · Separate items, cut plans, layer edits and undo

Status: built (2026-10-29). Follows 12. Checked end to end on the four samples (`tests/e2e/samples.spec.ts`,
`cat-sample.spec.ts`), with the Meta replies replayed and every code step running on the real photos.

## Separate items (bookmarks, earrings): fretwork and the two passes

**Holes and engraving** (`domain/layering.woodPiece`), per item, at full photo resolution, cropped to the item:

- **The surroundings** are measured in a ring just outside the item. A hole shows them, whether that is dark marble behind the bookmarks or pale cloth behind the earrings.
- **The wood** is one of the two tones inside the item. If the other tone is the surroundings showing through, the wood is the tone that isn't. Otherwise the lighter tone is the wood, because engraving is burnt darker.
- **Holes** are blobs that look like the surroundings or are dark. A small hole in shadow looks dark rather than like the cloth. Blobs are what survive an opening, which is sized to the item. Holes are kept on the region (`Region.holes`) and cut first, so reshaping or moving the outline keeps them.
- **Engraving** is thin dark lines that are not against a hole or the outer edge. Dark pixels there are the cut wall's shadow.
- **No empty layers:** an engraving layer is only made when it shows at least 0.5% of the photo. In heavy fretwork (more than 35% holes), anything under 4% is wall shadow and is not made into a layer.

**The passes** (`AppState.itemPasses`) run after the layers, each as a step in the chat:

1. **Align & straighten:** each item goes onto its own sheet, upright, turned along its long axis. The engraving turns with it. The step reports the turns, e.g. "Elephant 18.5°, Fox 11.7°".
2. **Interpolation:** items a neighbour lay over in the photo have bites in their outline (`hiddenShare` of the outline above 0.12). For each, the `complete` op fills the bite back from the outline's hull. Only the bite is filled; the item's own holes stay.

**Sizes** of separate items are measured as cut: upright, on their own sheet.

## 3D kits with a cut plan (castle)

- **Views:** Views shows the pictures you gave, in your order, until Muse has sorted them. It never shows stand-in drawings.
- **Reading the plan** (`domain/layering.readPlan`, job `layers.readPlan`, code only). When Muse marks a picture as a cut plan:
  - each framed sheet is found, and the frame's own edges are located;
  - sheets are named the way the plan groups them (A1–A4, B1–B7);
  - every region enclosed by the cut lines is labelled, and nesting decides what each region is: sheet edge → piece → hole → a piece inside the hole…;
  - red and green marks become engraving.

  Each sheet becomes a craft layer (engraving first, then the cut), sized at 300 mm by default.
- **Accuracy:** a low-resolution plan gives approximate outlines, and the chat says so. For a precise cut, import the original SVG or DXF. The castle plan (1588 × 1294 px) reads as 11 sheets and about 219 pieces.
- **Storage:** the plan (about 0.9 MB) is kept with the craft's heavy data in IndexedDB.
- **First message:** the chat no longer opens with "A layered picture…" for every upload. It waits for Analyze.

## Layer edits, by name or number, and undo

Said in the chat (applied before Muse is asked to interpret), or from the layer's own actions:

- **Delete the empty layers:** "remove the 0% layers" / "delete the empty layers".
- **Delete:** "delete layer 5", "delete this layer", "remove the X and Y layers", or the trash button on the layer.
- **Merge:** "merge layers 2 and 3", "merge layers 1-4", "merge the swirl drop left and the swirl drop right".
- **Merge a kind:** "merge all the engravings (into one layer)". For separate items this makes one engraving per item, so each item keeps its own sheet.
- **How names are matched:** a whole name said wins over shared words. A word inside a name ("Swirl **drop** left") is not a command.
- **Merges keep their kind:** a merged layer keeps its cut or engrave role, and its item when both layers belong to the same item.
- **Undo:** "undo" (or "undo that", "go back") or the toolbar's Undo button. Every stack edit, mask correction and automatic pass is checkpointed first. The last 30 edits in the session can be undone; switching crafts clears the list.
- **Suggestions:** the chat suggests "Remove the empty layers", and "Merge all the engravings into one layer" when an item has more than one engraving.

## Known limits

- The Cut page draws every plan sheet in full and takes a few seconds for a 22-pass kit. Simplifying the paths for display would make it faster.
- Holes smaller than about 3 px at full resolution (fine lattices) are missed.
