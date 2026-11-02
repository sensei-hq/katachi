<script lang="ts">
import { Card, Toggle } from '@rokkit/ui';
import StepScreen from '$lib/components/StepScreen.svelte';
import BirdhouseView from '$lib/components/illustrations/BirdhouseView.svelte';
import PlanSheet from '$lib/components/PlanSheet.svelte';
import { joinery, type Joinery } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
import { stepContext } from '$lib/state/step-context.svelte';
// Layers for a 3D object: the pictures you gave (any number, any order) as Muse sorted them — which side each
// shows; close-ups and cut plans are kept as reference — and the parts the views unfold into, beside the chat.
const app = useApp();
const f = app.layers;
const media = $derived(app.capture.media);
// until Muse has sorted them (or if it could not), the pictures show in the order you gave them
const sorted = $derived(f.pictures.length
  ? f.pictures.map((p) => ({ ...p, url: media[p.index - 1]?.url })).filter((p) => p.url)
  : media.filter((m) => m.url).map((m, i) => ({ index: i + 1, kind: 'unsorted', angle: 'unknown', note: '', url: m.url })));
const label = (p: { kind: string; angle: string }) => p.kind === 'view' ? (p.angle === 'three-quarter' ? '¾ view' : p.angle) : p.kind === 'plan' ? 'cut plan' : p.kind === 'detail' ? 'close-up' : p.kind === 'unsorted' ? 'sorting…' : 'other';
$effect(() => app.setScreen(app.title, `${sorted.length || f.done.length} pictures · ${f.done.length} sides seen`));
const ctx = stepContext(app, 'Parts', parts);
// a kit read from its cut plan: every sheet drawn as read, to check before cutting (pick one to see it large)
const kit = $derived(app.kitSheets);
let open = $state(0);
// a kit with a cut plan: its sheets (read from the plan); otherwise the parts the views unfold into
const rows = $derived<[string, string, boolean][]>(f.plan.length ? f.plan.map((s) => [`Sheet ${s.name}`, `${s.pieces} pieces · ${s.sizeMm[0]} × ${s.sizeMm[1]} mm`, true]) : f.partRows.map((p) => [p.name, p.ok ? p.size : p.missing, p.ok]));
const missing = $derived(f.views.filter((v) => !v.ok));
const joins = joinery.map((j) => ({ label: j.label, value: j.id }));
</script>
{#snippet parts()}
  <div class="flex flex-col gap-3">
    <p class="eyebrow">{f.plan.length ? `Sheets · from your cut plan · ${f.plan.reduce((a, s) => a + s.pieces, 0)} pieces` : `Parts · ${f.objectSpec ? `${f.objectSpec.wMm} × ${f.objectSpec.dMm} × ${f.objectSpec.hMm} mm` : 'from the views'}`}</p>
    <Card><dl class="divide-y divide-paper-edge -my-1">{#each rows as [k, v, ok] (k)}<div class="flex justify-between gap-3 min-h-11 items-center"><dt>{k}</dt><dd class="readout text-right {ok ? 'text-ink' : 'text-warning-ink'}">{v}</dd></div>{/each}</dl></Card>
    {#if !f.plan.length}<p class="eyebrow mt-1">Joinery</p>
    <Toggle options={joins} value={f.joinery} label="Joinery" class="chips" onchange={(v) => f.setJoinery(v as Joinery)} />{/if}
  </div>
{/snippet}
<svelte:head><title>Katachi · Views</title></svelte:head>
<StepScreen context={ctx.inline} note={missing.length ? `Not seen: ${missing.map((v) => v.label.toLowerCase()).join(', ')} — I’ll assume symmetry, or add a picture.` : 'Every side is in.'}>
  <section aria-label="Views" class="flex flex-col gap-5">
    <header class="lt-md:hidden"><h2 class="font-heading text-head font-normal tracking-display">Your pictures, sorted</h2>
      <p class="text-ui text-ink-mute mt-1">Any number, any order: Katachi works out which side each one shows and keeps close-ups and cut plans as reference.{missing.length ? ` Not seen: ${missing.map((v) => v.label.toLowerCase()).join(', ')}.` : ''}</p></header>
    {#if sorted.length}
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {#each sorted as p (p.index)}
          <figure class="m-0 rounded-lg border border-paper-edge bg-paper-soft p-2 flex flex-col gap-2" aria-label={`Picture ${p.index}: ${label(p)}`} data-picture={p.kind}>
            <img src={p.url} alt="" class="aspect-[4/3] w-full object-cover rounded-md bg-paper-mute" />
            <figcaption class="flex items-center gap-2"><span class="meta rounded-full border px-2 py-0.5 {p.kind === 'view' ? 'border-accent text-accent' : 'border-paper-edge'}">{label(p)}</span><span class="meta truncate">{p.note}</span></figcaption>
          </figure>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-6 gap-1.5 md:grid-cols-3 md:gap-4">
        {#each f.views as v (v.id)}
          <div aria-label={`${v.label}: ${v.ok ? 'matched' : 'needed'}`} class="rounded-lg border border-paper-edge bg-paper-soft p-1.5 md:p-3 flex flex-col gap-2">
            <span class="lt-md:hidden aspect-[4/3] rounded-md overflow-hidden {v.ok ? '' : 'border border-dashed border-ink-faint bg-paper grid place-items-center text-center'}">
              {#if v.ok}<BirdhouseView view={v.id} />{:else}<span class="text-ui text-ink-mute">Waiting for a photo</span>{/if}
            </span>
            <span class="text-body lt-md:text-micro">{v.label}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if kit.length}
      <section aria-label="Kit sheets" class="flex flex-col gap-3" data-kit-sheets={kit.length}>
        <header><h2 class="font-heading text-title font-normal">The kit, sheet by sheet</h2>
          <p class="text-ui text-ink-mute mt-1">Read from your cut plan: {kit.length} sheets, about {kit.reduce((a, k) => a + k.pieces, 0)} pieces. Check each before cutting — the outlines come from the picture, so they are approximate; import the kit’s SVG to cut exactly.</p></header>
        {#if kit[open]}
          <figure class="m-0 rounded-lg border border-paper-edge bg-paper p-3 flex flex-col gap-2" aria-label={`Sheet ${kit[open].name}, large`}>
            <div class="aspect-square max-h-[60vh] w-full"><PlanSheet passes={kit[open].passes} view={kit[open].view} label={`Sheet ${kit[open].name}: ${kit[open].pieces} pieces`} /></div>
            <figcaption class="meta">Sheet {kit[open].name} · {kit[open].pieces} pieces · {kit[open].sizeMm[0]} × {kit[open].sizeMm[1]} mm · cut lines in colour, engraving shaded</figcaption>
          </figure>
        {/if}
        <div class="grid grid-cols-4 gap-2 md:grid-cols-6">
          {#each kit as k, i (k.name)}
            <button type="button" class="rounded-md border bg-paper-soft p-1.5 flex flex-col gap-1 text-left {i === open ? 'border-accent' : 'border-paper-edge'}" aria-label={`Show sheet ${k.name}`} aria-pressed={i === open} onclick={() => (open = i)}>
              <span class="aspect-square w-full"><PlanSheet passes={k.passes} view={k.view} label={`Sheet ${k.name}`} /></span>
              <span class="meta">{k.name} · {k.pieces}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
    {#if missing.length && sorted.length}<p class="meta">Not seen: {missing.map((v) => v.label.toLowerCase()).join(' · ')} — assumed from the sides that are.</p>{/if}
  </section>
</StepScreen>
