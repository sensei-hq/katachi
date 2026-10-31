# 12 · The cutting program, the cut queue and Assemble

Status: built (2026-10-29), from the agreed mockup ("Katachi Cut & Assemble" artifact). Follows 11.

## The flow

Layers → Cut (preview every sheet, the device, the hidden parts) → **Cut queue** → **Assemble**.

- When the user says "send it to the cut queue" (chat, the Cut screen, or a layer's own actions), every sheet goes into the queue in cutting order, with engraving first.
- The rail's Cut queue icon shows how many sheets are waiting, and pulses when sheets were just added.

## The cutting program (`domain/toolpath.ts`)

Until now Katachi produced only vector outlines. Each sheet now becomes the moves a machine follows:

- **Units:** the traced shapes, in 0–1000 photo units, are mapped to mm with the craft's real size and the photo's shape (`toMm`).
- **Order:** inner shapes and holes are cut first, the outer outline last, so the piece does not shift while it is cut. The next shape is always the nearest one, and each shape starts at its point nearest the tool.
- **Moves:**
  - travel moves with the tool up (`travel`)
  - cuts along every edge (`cut`)
  - totals for cut length, travel length and number of shapes
- **The program text** has one line per move:
  - **Laser:** G-code, GRBL dialect. `G21 G90`, `M4 S0` (power follows speed), `G0` to travel, `G1 … F S` to cut, then `M5`. Engraving uses a faster feed and lower power.
  - **Blade cutter (paper):** plotter moves (`UP MOVE x, y` / `DOWN CUT x, y`). Cricut itself takes SVG in Design Space and runs its own blade moves; these lines show the same path in the same order.
- **Download:** the Cut queue offers each sheet's program as a download (`.gcode` for a laser, `.txt` for a blade cutter).

**Machine:** the craft's device decides it. The Cricut is a blade cutter; the xTool and the Glowforge are lasers. The material Muse sees picks the default device: paper and card go to the blade cutter, wood and acrylic to the laser. The Cut queue always talks about the machine that actually cuts the sheet: a mat and blade for paper, the bed and beam for a laser.

## The Cut queue (`/queue`)

**Layout:**

- **Left:** the work frame, which is the machine bed — a 12 × 12 in mat with its inch grid, or a laser's honeycomb. It also has the speed control (1×, 2×, 6×) and the cutting program panel (Hide / Show, download), which highlights the current line.
- **Right:** the queue, which scrolls on its own. Each card shows the sheet in its colour. A waiting sheet can be moved to the front or removed.
- **Bottom of the right column:** short guidance (e.g. "Stick Gold cardstock on the mat, top-left corner, and load the mat. Then press Start.") and the **Start** button.

**A run** (`QueueState`, kept per user in localStorage):

1. **waiting:** the sheet slides onto the mat in its colour.
2. **running:** the tool follows the program. Travel moves are dashed and the cut is drawn as the head moves. For a laser the head is a beam glow; for a blade cutter it is a blade marker. The run takes about 14 s at 1×.
3. **Pause / Resume.**
4. **weeding:** the waste around and inside the piece falls away. Engraving passes skip this step.
5. **cut:** the piece goes to Assemble. **Next sheet** (pressed by you, after loading the next one) or **Again**.

A reload in the middle of a run puts that sheet back to "load the sheet".

## Assemble (`/make/assemble`, stacked crafts)

- **A big card:** the empty outline of the piece on the left. On the right, the step for the layer being placed, with Play / Pause, Replay, speed (0.5×, 1×, 2×), Prev / Next and Save craft.
- **Below:** one card per layer: the cut sheet in its colour, "Layer n · back / middle / front", its name and its instruction. If the queue was used, a card says whether its sheet has been cut yet.
- **Play:** each sheet lifts off its own card below, arcs up onto the stage and lands exactly in place on the one before it, while its card lights up. When all layers are placed, the stack settles with its depth: the finished piece is the cut layers, not the photo. Separate items land each in its own cell.
- **Saving:** the step reached is saved with the craft.
- **3D crafts** keep the step-by-step list for now.
