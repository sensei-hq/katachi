<p align="center">
  <img src="katachi.svg" alt="The Katachi mark: a K made of an ink bar and three stacked layers" width="128" height="128">
</p>

<h1 align="center">Katachi</h1>

<p align="center"><em>形 · shape, form</em> — Snap → Make</p>

> **Show it. Say it. Burn it.**
> Point your phone at a sketch and an object and say what you want. Katachi turns it into a measured, cut-ready design, a photoreal preview and laser G-code, then watches the burn.

Katachi is a voice-first workshop buddy for people who own a desktop laser cutter, vinyl cutter, or (later) a 3D printer but are blocked by the design step. Instead of spending an evening in a vector editor measuring mugs and tracing sketches by hand, you snap a photo, say what you want, and Katachi measures the real world, traces the art, designs the parts with joints, shows you a preview and a full on-screen simulation of the cut — then outputs machine-ready files.

Built for the **Meta Global AI Developer Hackathon** (Oct 26 – Nov 4, 2026), Indie track, theme *Build for Your World*. This repo contains only work built during the event (see [What was built during the hackathon](#what-was-built-during-the-hackathon)). Product requirements are the single source of truth in [`docs/prd/`](docs/prd/README.md); the implementation plan and tracked checklist live in [`docs/plans/`](docs/plans/2026-10-27-snap-make-phase1-plan.md) with per-stage specs in [`docs/roadmap/`](docs/roadmap/README.md).

## Why "Katachi"

**形 (katachi)** is Japanese for *shape* or *form*: the form a thing takes. That is the whole job. You show Katachi a picture of something that inspires you (layered paper art, a fretwork bookmark, a tray of earrings, a wooden castle kit), and it finds the shapes inside it: the layers, the pieces, the holes and the engraving. It turns them into forms you can actually cut, on paper with a blade cutter or on wood with a laser.

**The mark** is a K drawn with what Katachi makes:

- **The ink bar on the left** is the stroke a cutter follows.
- **The three diamonds** are three sheets stacked in an isometric view, the layered piece every craft becomes:
  - **charcoal** `#25282D`: card, and the ink;
  - **birch** `#D8AE82`: plywood;
  - **paper** `#DDD8D0`.

Together they read as a K, and as a stack of cut layers. The same three colours are fixed brand tokens in the app (see `app/src/lib/components/KatachiMark.svelte`), in light and dark themes alike.

**The names it has had:**

1. **Burn-E** was a laser-only design tool.
2. **Snap → Make** was the hackathon feature: from a photo to cut-ready parts.
3. **Katachi** is the product once it covered paper and wood, layered art, separate items and 3D kits. *Snap → Make* stays as the one-line description of what it does.

## Links

| | |
|---|---|
| Live demo | https://katachi.sensei-hq.com (invite code shared privately) |
| Code | https://github.com/sensei-hq/katachi |
| Hackathon | [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon) · [event page on Cerebral Valley](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) · [submission](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit) |
| Meta Model API | [Product page](https://developer.meta.com/ai/products/meta-model-api/) · [Build with Muse Spark](https://developer.meta.com/ai/resources/blog/build-with-muse-spark/) · [dev.meta.ai](https://dev.meta.ai/) · base URL `https://api.meta.ai/v1` |
| Product docs | [PRD](docs/prd/README.md) · [Plan](docs/plans/2026-10-27-snap-make-phase1-plan.md) · [Roadmap](docs/roadmap/README.md) · [Submission package](docs/submission/README.md) |
| Stack | [SvelteKit](https://svelte.dev/docs/kit) · [Rokkit](https://www.npmjs.com/package/@rokkit/ui) · [UnoCSS](https://unocss.dev/) · [Cloudflare Workers](https://developers.cloudflare.com/workers/) · [Supabase](https://supabase.com/docs) |

## What was built during the hackathon

Everything in this repository was built during the Meta Global AI Developer Hackathon (Oct 26 – Nov 4, 2026): the PRD, plan and roadmap, the `snap` database schema, the Supabase config and the app in `app/`. The commit history starts on day 2.

## How it works

Each Meta model does the job it is uniquely best at, and plain code does what must be exact — **models perceive, reason and imagine; code measures and builds geometry. The LLM never emits raw coordinates.**

| Step | Model / code | What happens |
|---|---|---|
| Listen | Muse Voice Transcribe (+ browser speech fallback) | Push-to-talk with maker-vocabulary biasing; live captions |
| See | Muse Spark 1.3 | Identifies the sketch, the fit target, and the reference (credit card / paper / ruler) in your photo |
| Measure | SAM 3.1 + code | Pixel-exact masks; scale (px/mm) from the reference; dimensions computed in code, never guessed |
| Plan | Muse Spark 1.3 → deterministic geometry | Intent becomes a `DesignSpec`, then a device-agnostic **Object** (parts, dimensions, art, assembly logic) |
| Imagine | Muse Image | Cleans your sketch into laser-friendly line art (3 variants) and renders a photoreal preview |
| Make | Device adapter (code) | You pick the target — Laser, Cricut, 3D printer — and Katachi generates the **Impl**: pieces, joints, layout, toolpaths, files |
| Simulate | Simulator adapter (code) | Watch the fabrication play back on a virtual bed and the flat pieces assemble — no device needed |
| Watch | Spark + SAM 3.1 (video) | Burn Watch analyses a recorded clip and flags flare-ups, smoke, or a shifted workpiece |
| Batch | Muse Wonder | Background production plans for batches (e.g. 40 personalised ornaments) |

The design flow is **Object → Impl**: one measured design, many fabrication targets. The same coaster-and-holder design becomes finger-jointed plywood pieces on a laser, a scored folded blank on a Cricut, or extruded solids on a 3D printer. Laser (Longer Ray 5) is fully implemented today; Cricut and 3D printing sit behind the same adapter interface as Phase 2 stubs (planning and simulation work, file export is labelled Phase 2).

## Try it

**Live demo:** https://katachi.sensei-hq.com — enter your invite code (shared privately) and the three ticks at the gate. Live Muse Spark scene analysis is enabled on the server.

```bash
cd app
bun install
bun run dev        # http://127.0.0.1:5174 (set SNAP_INVITE_CODES in app/.env)
```

- Gate: http://127.0.0.1:5174/ — a code from `SNAP_INVITE_CODES`, the three ticks, enter. Every page and `/api/*` needs the signed session it sets.
- Home: http://127.0.0.1:5174/workshop — say or type what you're making, or pick **Layered picture · 3D object · Remix · Sketch it**; then Capture → Shape → Layers → Sheets → Assemble → **Save craft**. Crafts: `/crafts` · Burn Watch: `/watch` · Wonder batch: `/batch`. The flow is specified in [docs/design/07](docs/design/07-ux-journey-review.md).

Meta calls need a server-side key: copy `app/.env.example` to `app/.env` and set `META_API_KEY`. Without it, the server serves clearly-labelled demo fixtures so the whole flow still runs offline. The key never reaches the browser.

## Code organization

```
katachi/
├── app/                 # The Snap → Make PWA (SvelteKit 2 + Svelte 5 + Rokkit). Start here.
│   └── src/
│       ├── routes/      # / (gate) · (studio): workshop (New / Open) → capture → make/{import, cutout, segment, layers,
│       │                # gaps, output, views, reference} · scene → plan → art → preview → canvas · watch, batch, hood, …
│       │                # + server routes (/api/scene|design|art|preview|watch|batch|gate) owning the API key
│       ├── lib/domain/  # Pure, tested core: zod schemas (SceneAnalysis/DesignSpec), measurement math,
│       │                # ObjectSpec + templates, deterministic geometry, nesting
│       ├── lib/devices/ # Device adapters: laser (full: G-code/SVG/.burn), simulator (playback),
│       │                # cricut + printer3d (Phase 2 stubs) behind one interface + contract tests
│       ├── lib/state/   # Svelte rune state classes (*.svelte.ts): one AppState (useApp()) holds flow, layers, editor, …
│       ├── lib/components/ # Presentation only (Rokkit components): props in, events out — no fetch, no store writes.
│       ├── lib/design/  # Zen-Sumi palette + token spec pinned to the design mock
│       ├── lib/content/ # copy and fixtures only (sections, layers flow, materials)
│       └── lib/server/  # Server-only: Meta clients, budget/invite guard, cost/trace ledger.
├── database/            # dbd-managed schema (files are the source of truth)
│   ├── ddl/table/<schema>/<table>.ddl   # one file per table (snap, staging)
│   ├── ddl/procedure/staging/import_*.ddl
│   ├── policies/<schema>/<table>.sql    # RLS lives here, not in table DDL
│   ├── import/staging/*.csv             # seed data → staging tables → import procedures → loader.sql
│   └── design.yaml                      # `dbd deploy -d $DATABASE_URL -e dev --scope snap` deploys + seeds
├── supabase/            # Local Supabase cluster config (katachi-snap) + bootstrap migration mirror
├── docs/
│   ├── prd/             # Product requirements (source of truth), journeys, model orchestration, screens
│   ├── roadmap/         # Stage specs 00–10 for unattended implementation until handoff gates
│   ├── plans/           # Executing plan + checklist tracked to closure
│   └── submission/      # Hackathon package tracker (video, deck, white paper)
└── samples/             # Photo/eval capture set with caliper truth (accuracy table)
```

The design mockups (`mockups/`, `docs/mockups/`) and the sample photo set (`docs/sample/`) stay local and are gitignored: they include third-party reference images and design-system assets this repo has no rights to publish.

```text
```

The layout is responsive from one route tree: below 1024 px a phone column (app bar with back, the page, an icon nav docked at the bottom with Katachi opening as a sheet); from 1024 px (tablet landscape and up) a studio with the icon rail, a top bar, the work in the middle and the Katachi column (the page's context card above the chat) or the editor's properties on the right. The image → layers screens follow the artboards in `mockups/desktop` (six step tabs, controls on the left) and `mockups/mobile` (seven-step strip, one column, actions docked above the nav).

State and presentation are deliberately separated: **state classes (`*.svelte.ts`) own every transition and side effect; components only render props and fire events.** That is enforced by an architecture test (`bun run test:arch`), not just convention; the same test rejects raw colours, inline colour styles and emoji icons in presentation code, so every screen uses Rokkit components and named tokens (see [`docs/prd/07-design-language.md`](docs/prd/07-design-language.md)).

## Development

All commands run from `app/` and are defined in its `package.json` — no ad-hoc runners:

| Task | Command |
|---|---|
| Develop | `bun run dev` |
| Lint + typecheck | `bun run lint` · `bun run check` |
| Unit tests | `bun run test` (`test:unit:watch` to watch) |
| Coverage (90% gate on domain/devices/state) | `bun run test:coverage` |
| E2E (Playwright) | `bun run test:e2e` |
| Full local gate | `bun run verify` · everything incl. build + e2e: `bun run verify:full` |
| Database (from `database/`) | `bun run db:inspect` · `bun run db:deploy` · `bun run db:import` |
| Deploy (Cloudflare Worker) | `bun run deploy:dry` to validate · `bun run deploy` |
| Version bump (bumpp) | `bun run bump patch\|minor\|major` — bumps `package.json`, commits `release: vX.Y.Z` and tags it; push with `git push --follow-tags` |

The running version (`vX.Y.Z · commit`) shows in Settings → About, at the foot of the studio rail and in the landing footer, and is served at `/api/version`.

Development is test-driven: failing test first, then implementation, with a Playwright suite covering the hero journey, playback-without-a-device, device switching, the invite/budget gate, Burn Watch, and batch. Auth is intentionally absent in Phase 1 (invite code + 18+ attestation); Kavach + Supabase Auth arrive in Phase 2 with saved projects and subscriptions.

## Roadmap

- **Phase 1 (hackathon):** voice → measure → design → art/preview → simulate → G-code, Burn Watch (recorded), Wonder batch demo, Under-the-hood model/cost trace. Draft submission Nov 2, final Nov 3.
- **Phase 2:** Supabase auth + projects, Cricut and 3D-printer file export, Web Serial machine streaming with auto-pause, more templates.
- **Later:** multi-photo measurement, material calibration from test burns, CNC/3D-print toolpaths, hands-free capture on Meta glasses.

See [`docs/prd/08-roadmap.md`](docs/prd/08-roadmap.md) for the full plan and [`docs/roadmap/`](docs/roadmap/README.md) for how the build is staged.
