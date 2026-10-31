# T2 review (Claude, 2026-10-30)

**Status:** accepted.

## Checked

**Contracts:** unchanged. 15 cutplan tests pass, and the whole app's unit tests pass with T2 in.

**On real shapes:** two earrings in a pair, laid out `groups-together` on the xTool bed, go on 1 sheet with 2 placements. The passes are hole, hole, outline, outline: holes before outlines, as asked.

**Judgment calls, both agreed:**

- **One cut pass per loop,** ordered by depth. It keeps holes first even across parts, and the queue's program builds per pass anyway.
- **Pairs stay together** across sheet breaks (pack, then flush); **sets spill freely** through `nestParts`.

## Note for L3 (Claude, not a T2 change)

`one-part-per-sheet` places each part at its own bounding box, which is right for cutting. Assemble needs the parts *registered* (stacked art lines up layer on layer), so Assemble will draw from the item frame, not from the sheets' placements.
