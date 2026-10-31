<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { onDestroy } from 'svelte';
import { Button, Card } from '@rokkit/ui';
import { InputCheckbox } from '@rokkit/forms';
import StepScreen from '$lib/components/StepScreen.svelte';
import BirdhouseView from '$lib/components/illustrations/BirdhouseView.svelte';
import StackStage from '$lib/components/illustrations/StackStage.svelte';
import CutSheet from '$lib/components/CutSheet.svelte';
import { useApp } from '$lib/state/context';
// Assemble (design/12), after the cut queue. Stacked crafts: a big card with the empty outline and Play · Replay ·
// speed · Prev · Next — each cut sheet lifts off its card below, in its own colour, and lands on the one before
// it while its card lights up with the instruction, until the finished piece appears. 3D crafts keep the step list.
const app = useApp();
const f = app.layers;
const steps = $derived(app.assembly);
const finished = $derived(app.project?.status === 'finished');
const joined = $derived(f.kind === '3d');
const pad = (n: number) => String(n).padStart(2, '0');
// one card per layer, with the instruction for it; sheets in their own colour
// separate items (bookmarks): each on its own sheet, upright, in its own cell; its engraving lands on it
const itemNames = $derived([...new Set(f.layers.map((l) => l.itemName ?? ''))]);
const layerSteps = $derived(f.layers.map((l) => {
  const pc = f.pieceFor(l.n);
  return { l, step: steps.find((s) => s.layer === l.n) ?? { title: l.name, detail: '' }, d: f.separateItems ? pc.d : f.cutPathFor(l.n), aspect: f.separateItems ? pc.sheetMm[0] / pc.sheetMm[1] : f.aspect || 1 };
}));
const sheets = $derived(layerSteps.map((x) => ({ d: x.d, colour: x.l.colour, ...(f.separateItems ? { cell: itemNames.indexOf(x.l.itemName ?? ''), aspect: x.aspect, engrave: x.l.role === 'engrave' } : {}) })));
const cut = $derived(app.project ? app.queue.cutLayers(app.project.id) : []);
const intro = $derived(steps[0]);
const outro = $derived(steps.at(-1));
// playback (view state; the step reached is kept with the craft)
let placed = $state(Math.max(0, Math.min(f.assembleAt, f.layers.length)));
let settle = $state(1), finale = $state(0), flying = $state(-1), playing = $state(false), speed = $state(1);
let stage = $state<StackStage | null>(null);
let cards = $state<HTMLElement | null>(null);
const current = $derived(placed === 0 ? null : layerSteps[placed - 1]);
$effect(() => app.setScreen(app.title, `assemble · ${placed} of ${f.layers.length} layers${finished ? ' · saved' : ''}`));
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let raf = 0, hold = 0;
/** the next sheet lifts off its card and lands on the stack */
function place(k: number) {
  placed = k + 1; settle = 0; f.openAssembleStep(k + 1);
  const thumb = cards?.querySelectorAll('[data-card-sheet]')[k] as HTMLElement | undefined;
  const to = stage?.target(k);
  if (reduce || !thumb || !to || !thumb.animate || !sheets[k]?.d) { settle = 1; return; }
  flying = k;
  const fr = thumb.getBoundingClientRect();
  const fly = document.createElement('canvas'), d = devicePixelRatio || 1;
  fly.width = to.w * d; fly.height = to.h * d;
  Object.assign(fly.style, { position: 'fixed', left: `${to.x}px`, top: `${to.y}px`, width: `${to.w}px`, height: `${to.h}px`, pointerEvents: 'none', zIndex: '50', transformOrigin: '0 0', filter: 'drop-shadow(0 10px 14px color-mix(in oklab, var(--ink) 35%, transparent))' });
  const g = fly.getContext('2d');
  if (g) { g.scale((d * to.w) / 1000, (d * to.h) / 1000); g.fillStyle = sheets[k].colour; g.fill(new Path2D(sheets[k].d), 'evenodd'); }
  document.body.appendChild(fly);
  const sc = fr.width / to.w, dx = fr.left - to.x, dy = fr.top - to.y;
  fly.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.9 },
    { transform: `translate(${dx * 0.45}px, ${Math.min(dy, 0) - 60}px) scale(${(sc + 1) / 2}) rotate(-4deg)`, opacity: 1, offset: 0.55 },
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 }
  ], { duration: 1100 / speed, easing: 'cubic-bezier(.3,.7,.25,1)' }).onfinish = () => { fly.remove(); flying = -1; settle = 0; };
}
function tick() {
  if (playing) {
    if (flying >= 0) { /* in the air */ }
    else if (settle < 1) settle = Math.min(1, settle + 0.04 * speed);
    else if (placed < f.layers.length) { hold += 0.024 * speed; if (hold > 1) { hold = 0; place(placed); } }
    else if (finale < 1) { finale = Math.min(1, finale + 0.01 * speed); if (finale >= 1) { playing = false; f.openAssembleStep(steps.length - 1); } }
  }
  raf = requestAnimationFrame(tick);
}
$effect(() => { raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); });
onDestroy(() => cancelAnimationFrame(raf));
function play() { if (placed >= f.layers.length && finale >= 1) { placed = 0; finale = 0; hold = 1; } playing = !playing; }
function replay() { if (flying >= 0) return; placed = 0; settle = 1; finale = 0; hold = 1; playing = true; }
function prev() { if (flying >= 0) return; playing = false; finale = 0; placed = Math.max(0, placed - 1); settle = 1; f.openAssembleStep(placed); }
function next() { if (flying >= 0) return; playing = false; if (placed < f.layers.length) place(placed); else finale = 1; }
const speeds = [0.5, 1, 2];
const where = (i: number, n: number) => (i === 0 ? 'back' : i === n - 1 ? 'front' : 'middle');
const views = ['front', 'right', 'back', 'left', 'top'] as const;
const at3d = $derived(Math.min(f.assembleAt, steps.length - 1));
</script>
{#snippet saveActions()}
  {#if finished}
    <Button style="outline" label="Start another" onclick={() => void goto(resolve('/workshop'))} />
    <Button variant="primary" icon="i-solar:check-circle-linear" label="Saved · your crafts" onclick={() => void goto(resolve('/workshop'))} />
  {:else}<Button variant="primary" icon="i-solar:diskette-linear" label="Save craft" onclick={() => app.finishCraft()} />{/if}
{/snippet}
<svelte:head><title>Katachi · Assemble</title></svelte:head>
{#if !joined}
  <div class="mx-auto w-full max-w-[1180px] px-4 py-4 md:px-6 md:py-6 flex flex-col gap-4">
    {#if finished}<p role="status" class="flex items-center gap-2 rounded-md border border-paper-edge bg-paper-soft px-3 py-2 text-ui text-success"><span class="i-solar:check-circle-linear" aria-hidden="true"></span>Saved to your crafts with {steps.length} steps and {f.notes.length} notes.</p>{/if}
    <section aria-label="Putting it together" class="grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] rounded-lg border border-paper-edge bg-paper-soft overflow-hidden">
      <figure class="relative m-0 aspect-square max-h-[64vh] w-full bg-paper border-b md:border-b-0 md:border-r border-paper-edge">
        <StackStage bind:this={stage} {sheets} {placed} {settle} hidden={flying} {finale} aspect={f.aspect || 1} label={finale > 0.5 ? 'The finished piece' : `${placed} of ${f.layers.length} layers placed`} />
        <figcaption class="absolute left-3 top-3 meta rounded-full border border-paper-edge bg-paper px-3 py-1 text-ink" aria-live="polite">{finale > 0.5 ? 'The finished piece' : `${placed} of ${f.layers.length} layers placed`}</figcaption>
      </figure>
      <div class="p-5 flex flex-col gap-3 min-w-0">
        <p class="eyebrow">Step {placed} of {f.layers.length}</p>
        <h2 class="font-heading text-head font-normal tracking-display">{finale > 0.5 ? (outro?.title ?? 'Finish') : current ? `${placed} · ${current.l.name}` : (intro?.title ?? 'Lay out the sheets')}</h2>
        <p class="text-body text-ink-mute max-w-[56ch]">{finale > 0.5 ? (outro?.detail ?? '') : current ? current.step.detail : (intro?.detail ?? '')}</p>
        {#if current && !cut.includes(current.l.n) && app.queue.items.some((i) => i.craftId === app.project?.id)}<p class="meta text-warning-ink">This sheet has not been cut in the queue yet.</p>{/if}
        <div class="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <Button variant="primary" icon={playing ? 'i-solar:pause-linear' : 'i-solar:play-linear'} label={playing ? 'Pause' : placed >= f.layers.length && finale >= 1 ? 'Play again' : 'Play'} onclick={play} />
          <Button style="outline" icon="i-solar:restart-linear" label="Replay" onclick={replay} />
          <span class="inline-flex rounded-md border border-paper-edge overflow-hidden" role="group" aria-label="Speed">{#each speeds as s (s)}<button type="button" class="px-2.5 py-1 text-ui {speed === s ? 'bg-ink text-paper' : 'text-ink-mute'}" aria-pressed={speed === s} onclick={() => (speed = s)}>{s}×</button>{/each}</span>
          <Button style="ghost" icon="i-solar:alt-arrow-left-linear" label="Prev" onclick={prev} />
          <Button style="ghost" iconRight="i-solar:alt-arrow-right-linear" label="Next" onclick={next} />
        </div>
        <div class="flex flex-wrap gap-2 pt-1">{@render saveActions()}</div>
      </div>
    </section>
    <section aria-label="Layers to stack" bind:this={cards} class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
      {#each layerSteps as x, i (x.l.n)}
        <article aria-label={`Layer ${i + 1}: ${x.l.name}`} aria-current={i === placed - 1 ? 'step' : undefined}
          class="rounded-lg border bg-paper-soft p-2.5 grid grid-cols-[72px_minmax(0,1fr)] gap-2.5 items-start transition-transform {i === placed - 1 ? 'border-accent -translate-y-0.5' : 'border-paper-edge'} {i < placed - 1 ? 'opacity-75' : ''}">
          <span class="w-[72px] h-[72px] rounded-md bg-paper p-1" data-card-sheet>{#if x.d}<CutSheet d={x.d} colour={x.l.colour} aspect={x.aspect} label="" small />{/if}</span>
          <div class="min-w-0 flex flex-col gap-1">
            <p class="eyebrow">{f.separateItems ? `${x.l.itemName} · ${x.l.role === 'engrave' ? 'engrave' : 'cut'}` : `Layer ${i + 1} · ${where(i, layerSteps.length)}`}{app.queue.items.some((q) => q.craftId === app.project?.id) ? (cut.includes(x.l.n) ? ' · cut' : ' · not cut yet') : ''}</p>
            <h3 class="text-ui font-medium text-ink">{x.l.name}</h3>
            <p class="text-ui text-ink-mute">{x.step.detail}</p>
          </div>
        </article>
      {/each}
    </section>
  </div>
{:else}
  <StepScreen note="Put it together, one step at a time." label="Assembly steps">
    <div class="mx-auto w-full max-w-[720px] flex flex-col gap-4">
      <figure class="m-0 relative aspect-[4/3] md:aspect-[16/10] rounded-lg overflow-hidden border border-paper-edge bg-paper-soft">
        <BirdhouseView view={views[Math.min(at3d, views.length - 1)]} label={steps[at3d].title} />
        <figcaption class="absolute left-2.5 top-2.5 meta rounded-full bg-paper-soft border border-paper-edge px-2.5 py-1">Step {at3d + 1} of {steps.length}</figcaption>
      </figure>
      <Card class="p-4 flex flex-col gap-3">
        <h2 class="font-heading text-title font-normal">{pad(at3d + 1)} · {steps[at3d].title}</h2>
        <p class="text-body text-ink-mute">{steps[at3d].detail}</p>
        <div class="flex flex-wrap items-center gap-2.5">
          <label class="flex items-center gap-2 cursor-pointer text-ui flex-1"><InputCheckbox variant="default" name="step-done" value={f.assembled.includes(at3d)} onchange={() => f.toggleAssembled(at3d)} />Done</label>
          <Button style="ghost" icon="i-solar:alt-arrow-left-linear" label="Previous" disabled={at3d === 0} onclick={() => f.openAssembleStep(at3d - 1)} />
          <Button style="outline" iconRight="i-solar:alt-arrow-right-linear" label="Next" disabled={at3d >= steps.length - 1} onclick={() => { if (!f.assembled.includes(at3d)) f.toggleAssembled(at3d); f.openAssembleStep(at3d + 1); }} />
        </div>
        <div class="flex flex-wrap gap-2">{@render saveActions()}</div>
      </Card>
    </div>
  </StepScreen>
{/if}
