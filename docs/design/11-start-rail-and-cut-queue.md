# 11 · A leaner start, the craft in the rail, and the cut queue

Status: built (2026-10-29). Follows 10. Supersedes the step tabs of 07 and the Home cards of 07 G4–G7.

## Why

The flow felt clunky:

- **Too many ways in.** Home had four starter cards plus a typed box, a Continue card and a separate Crafts gallery.
- **Steps were hard to move between.** The top step tabs only unlocked one at a time, so you could not get from Layers to Sheets without visiting Gaps.
- **Burn Watch, Work area and Batch sat in the rail** with or without a craft open, which confused the picture.

The landing page's story is the flow we want:

1. Capture (snap, upload or sketch)
2. Shape (what it is, the outline, the parts — worked out by Muse from the pictures)
3. Layers
4. Cut (each sheet previewed, then cut)
5. Assemble

The chat handles most of the interaction.

## Home = start + your crafts

- **"What are we making today?"** with two large tiles:
  - **Upload:** pick one picture, or several views of an object; Capture opens with them.
  - **Camera:** Capture opens on the camera.
  - A small *sketch it* link, or tell Katachi in the chat.
- **Muse decides the kind of craft.** The four "layered / 3D / remix / sketch" cards are gone: Muse works out layered artwork, flat pieces or a 3D object from the pictures.
- **Your crafts** sits below with its filter (All · In progress · Finished). `/crafts` redirects here.

## The rail

- **Always:** Home · Cut queue · (chat) · tools (Materials, Annotations, Settings).
- **With a craft open:** a group appears with its thumbnail (resumes it), then **Layers · Cut · Assemble**.
  - 3D crafts open Layers on their views.
  - Cut and Assemble are greyed out until the craft has its layers. After that every step opens directly; there is no walking through each step.
- **Phones:** the same items in the bottom nav.
- **Removed:**
  - the top step tabs (phones keep the step strip)
  - Burn Watch and Work area from the rail; their routes remain
- **Moving on** is a chat suggestion ("Cut the sheets", "Put it together") or a rail icon, never a scattered button.

## Each craft has its own chat

- The conversation is saved with the craft (IndexedDB, next to its traced paths).
- Opening a craft brings its chat back; a new craft starts a new chat.
- Model calls from another craft never land in the open craft's chat.

## Several pictures of one object

- Any number of pictures, in any order, extras allowed. For an object, two or more pictures are enough to Analyze.
- Muse Spark looks at them together (`/api/views`) and says, for each picture:
  - a **view** (front, back, left, right, top, base, ¾)
  - a **close-up**
  - a **cut plan** (a parts layout)
  - or other
- Close-ups and plans are kept as reference. Sides not seen are assumed from the ones that are.
- Spark also estimates the object's real size.
- The views page shows your pictures with their roles, and the views it sorted are the ones that get unfolded into parts.
- Tried on `samples/3D/castle`: four views at different angles plus a parts-layout sheet.

## Cut and the cut queue

- **Cut** (was Sheets) shows each sheet with its size, the device, the hidden-parts rule (Gaps folded in) and a virtual **Play the whole run**.
- **Send to the cut queue** (also offered as a chat suggestion and per layer) adds the craft's sheets in cutting order, engraving first.
- **The Cut queue** (`/queue`, was Batch) holds sheets from any craft and cuts one at a time, with you in the loop:
  1. feed the sheet in its colour
  2. send it
  3. watch the virtual run: blank sheet → engraving → the cut traced → the extra pieces vanish
  4. check it, then the next sheet
- You can move a sheet to the front or remove it.
- The queue is kept per user in localStorage, so it survives reloads. A run interrupted by a reload resumes at "feed".

## What it cost

- Every model call is kept per user in localStorage (`UsageLedger`): craft, model, action, cost, time and status (live / placeholder / failed).
- **The top bar** shows the open craft's live spend and its number of models (the user's total on Home).
- **Under the hood** breaks it down:
  - this craft by model
  - all your crafts by model
  - each craft
  - the recent calls, with JSON export
