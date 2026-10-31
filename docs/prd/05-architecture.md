# 05 — Architecture

## 5.1 Principles
1. **One new app, `app/`:** a SvelteKit 2 + Svelte 5 PWA styled with Rokkit + UnoCSS, deployed as a single Cloudflare Worker. Pages and server routes ship together.
2. **Thin server, fat pipeline:** SvelteKit `+server.ts` routes own the Meta API key, orchestration, budget and trace. The browser never sees the key.
3. **Object → Impl:** one device-agnostic **Object** (intent, mm dimensions, art, assembly intent); a **device adapter** turns it into an **Impl** (pieces, joints, layout, toolpaths, files). Switching device re-plans in code only, zero model calls.
4. **State vs presentation:** `*.svelte.ts` rune classes own every transition, side effect and async call; `*.svelte` components render props and fire events (no fetch, no store writes). Enforced by `bun run test:arch`.
5. **Web first** (laptop + phone browser) for the hackathon; a desktop shell is P2.
6. **Deterministic core:** geometry, measurement math, nesting and G-code are pure functions with unit tests.

## 5.2 System diagram
```
┌──────────────────────── Browser (app/ PWA · SvelteKit 2 + Svelte 5 + Rokkit) ────────────────────────┐
│ /snap Workshop · Scene/Plan/Art/Preview cards · /snap/canvas · Simulate · /snap/watch · /snap/batch  │
│ state/*.svelte.ts (flow, conversation, capture, design, playback, trace…) → components/*.svelte      │
│ Mic: browser SpeechRecognition (fallback) · speechSynthesis (local TTS) ──── fetch /api/* ──┐        │
└─────────────────────────────────────────────────────────────────────────────────────────────┼────────┘
                                                                                              ▼
┌──────────────────────── Cloudflare Worker `katachi` (SvelteKit server routes) ──────────────────┐
│ /api/gate    invite + 18+ → session      │ /api/scene    Spark analyse → SAM → measure (code)        │
│ /api/design  DesignSpec → Object → Impl  │ /api/segment  SAM 3.1 boxes/masks for a prompt            │
│ /api/art     Muse Image edit / generate  │ /api/preview  Muse Image responses                        │
│ /api/watch   burn clip → SAM + Spark     │ /api/batch    Wonder background jobs                      │
│ /api/convert photo → pieces proposal     │                                                           │
│ lib/server/meta: client · analyse · sam · convert   lib/server: guard (budget/invite) · trace ledger  │
│ lib/domain: schemas · measure · object · geometry · nesting   lib/devices: laser · simulator · stubs │
└──────────────┬────────────────────────────────────────────────────────────────────┬────────────────┘
               ▼                                                                    ▼
     api.meta.ai/v1 (Spark, Wonder, Image, SAM, Voice)              Supabase Postgres, schema `snap`
     localhost Glimmer (P1+, LM Studio/Ollama)                       sessions · invites · media (24 h TTL)
                                                                     scenes · objects · impls · trace_events · batch_jobs
```
Without `META_API_KEY` the server routes return clearly labelled demo fixtures, so the whole flow runs offline. The Voice Transcribe relay (R-CV-2) runs server-side in the same Worker; until it is wired, the mic uses browser SpeechRecognition.

## 5.3 Repository layout
```
katachi/
├── docs/prd/                     ← this PRD
├── app/                          ← the app
│   ├── rokkit.config.js  uno.config.js  svelte.config.js  wrangler.jsonc  worker-entry.js
│   ├── src/app.css  src/service-worker.ts
│   ├── src/routes/snap/          ← pages: Workshop, capture, canvas, convert, watch, batch, welcome
│   ├── src/routes/api/           ← server routes: scene, segment, design, art, preview, watch, batch, convert, gate
│   ├── src/lib/domain/           ← schemas.ts (zod), measure.ts, object.ts, geometry.ts, nesting.ts, convert.ts, eval.ts
│   ├── src/lib/devices/          ← types.ts, registry.ts, laser.ts, simulator.ts, cricut.ts, printer3d.ts, shrink.ts
│   ├── src/lib/state/            ← *.svelte.ts rune state classes
│   ├── src/lib/components/       ← presentation only (Rokkit)
│   ├── src/lib/server/           ← meta/ (client, analyse, sam, convert), guard.ts, trace.ts
│   ├── scripts/check-arch.mjs    ← state/presentation architecture test
│   └── tests/e2e/                ← Playwright
├── database/                     ← dbd-managed `snap` schema (DDL, policies, CSV imports, design.yaml)
├── supabase/                     ← local Supabase cluster config + bootstrap migration
└── samples/                      ← demo media (our own, non-personal) + caliper truth
```

## 5.4 Key data contracts
- `SceneAnalysis`, `DesignSpec`, `BurnEvents`: defined once in **zod** (`src/lib/domain/schemas.ts`), exported as JSON Schema for Spark structured output and as TS types for state and components.
- `MeasureResult` (`src/lib/domain/measure.ts`) = `{ status:"measured", pxPerMm, targets:[{ objectId, kind:"diameter|wh", valueMm, wMm?, hMm?, confidence }] }` or `{ status:"needs-reference" }`.
- **Design → Object:** `designSpecToObject(spec): ObjectSpec` (`domain/geometry.ts`): parts expanded by qty, mm profiles, `SurfaceArt` placements (abstract ops `cut-through | engrave-surface | score-crease | draw-line | extrude-solid`), assumptions, assembly steps. No device geometry. Units are mm throughout.
- **Object → Impl:** `DeviceAdapter` (`devices/types.ts`) = `validate(obj)`, `plan(obj, target): ImplPlan`, `emit(plan): Artifact[]`, `preview(plan): PlaybackTimeline`, `estimate(plan)`. `Target = { adapterId, deviceId, materialId, thicknessMm }`. The laser adapter emits `design.gcode`, `design.svg` and `design.burn` (a JSON project file: version, name, device, pieces); Phase-2 adapters throw `Phase2Error` from `emit`.
- **Trace → Object:** potrace SVG string → closed, normalised paths → `SurfaceArt` on the target part with `op: engrave-surface`.

## 5.5 Measurement math (R-UN-3/4)
1. Reference mask → `minAreaRect` → long/short side in px. Card: px/mm = mean(long/85.60, short/53.98); aspect error > 6% → warn "shoot more top-down".
2. Fit target (round) → fitted ellipse → **minor axis** × 1/px_per_mm = diameter (perspective-robust for circles); rectangular → minAreaRect.
3. Confidence = f(aspect error, mask solidity, top-down score from Spark).

## 5.6 Security, privacy, compliance
- API key only on the server (Worker secret `META_API_KEY`); voice relayed server-side.
- Invite-code gate, 18+ attestation, per-session/day budget caps, kill switch (R-PL-2…5) in `lib/server/guard.ts`; demo invite codes seeded in `snap.invites`.
- Media: EXIF stripped, 24 h TTL (`snap.media.expires_at`). Free-credit usage may be used by Meta → public-demo notice; P2 Standard mode + privacy policy.
- Database: RLS on for every `snap` table, no policies in P1 (server service role only; the browser never talks to Supabase directly).
- Respect the Muse API ToS: no reselling access, label AI-generated previews ("AI preview").

## 5.7 Deployment (hackathon)
- One Cloudflare Worker (`app/wrangler.jsonc`, name `katachi`, custom domain `katachi.sensei-hq.com`) serves the PWA assets and the `/api/*` routes: `bun run deploy:dry` to validate, `bun run deploy` to ship.
- Database: Supabase Postgres, schema deployed and seeded with `dbd deploy -d $DATABASE_URL -e dev --scope snap` (`bun run db:deploy`).
- Demo laptop runs everything locally as a backup (`bun run dev` + local Glimmer).

## 5.8 Testing
- Unit (Vitest, specs beside the code): measurement math, schemas, Object expansion, nesting, the adapter contract suite run against every registered adapter, laser G-code/SVG, simulator timelines, state classes, guard and trace. Coverage gate 90% on `domain/`, `devices/`, `state/`.
- Architecture: `bun run test:arch` fails if a component or page calls `fetch` or imports `$lib/server`.
- E2E (Playwright, `tests/e2e/`): hero journey, impl switch, playback, gate and guard, Burn Watch, batch, convert.
- Golden + eval: `samples/*.jpg` → SceneAnalysis (tolerances) → DesignSpec → G-code bounding box; 10 photos with caliper-measured truth → accuracy table (`domain/eval.ts`, goes in the white paper).
