<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Button, Card } from '@rokkit/ui';
import { InputCheckbox } from '@rokkit/forms';
import StepScreen from '$lib/components/StepScreen.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import PhotoStage from '$lib/components/PhotoStage.svelte';
import BirdhouseView from '$lib/components/illustrations/BirdhouseView.svelte';
import { guide } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
// Step 5 · Assemble (docs/design/07 G15): the craft's instructions one at a time, ticked off, then Save craft
// (finished, with its layers, instructions and chat notes).
const app = useApp();
const f = app.layers;
const steps = $derived(app.assembly);
const at = $derived(Math.min(f.assembleAt, steps.length - 1));
const step = $derived(steps[at]);
const finished = $derived(app.project?.status === 'finished');
const joined = $derived(f.kind === '3d');
$effect(() => app.setScreen(app.title, `assemble · step ${at + 1} of ${steps.length}${finished ? ' · saved' : ''}`));
const views = ['front', 'right', 'back', 'left', 'top'] as const;
const pad = (n: number) => String(n).padStart(2, '0');
</script>
{#snippet aside()}
  <p class="eyebrow">{joined ? 'Joined parts' : 'Stacked layers'} · {steps.length} steps</p>
  <ol class="flex flex-col gap-1">
    {#each steps as s, i (i)}
      <li>
        <button type="button" aria-current={i === at ? 'step' : undefined} onclick={() => f.openAssembleStep(i)}
          class="w-full text-left flex gap-2.5 items-start rounded-md px-2 py-2 cursor-pointer {i === at ? 'bg-paper-mute' : 'hover:bg-paper-mute'}">
          <span class="font-mono text-micro pt-0.5 {f.assembled.includes(i) ? 'text-success' : i === at ? 'text-accent' : 'text-ink-faint'}">{#if f.assembled.includes(i)}<span class="i-solar:check-read-linear" aria-label="done"></span>{:else}{pad(i + 1)}{/if}</span>
          <span class="text-ui {i === at ? 'text-ink' : 'text-ink-mute'}">{s.title}</span>
        </button>
      </li>
    {/each}
  </ol>
  <p class="eyebrow mt-2">Your notes to Katachi</p>
  {#if f.notes.length}
    <ul class="flex flex-col gap-1.5">{#each f.notes as n, i (i)}<li class="text-ui"><span class="meta">{n.layer ?? n.step}</span><span class="block text-ink-mute">{n.text}</span></li>{/each}</ul>
  {:else}<p class="text-ui text-ink-faint">None yet. Anything you tell Katachi on a step is kept here with the craft.</p>{/if}
{/snippet}
{#snippet actions()}
  {#if finished}
    <span class="flex-1 grid md:flex-none"><Button style="outline" size="lg" label="Start another" onclick={() => void goto(resolve('/workshop'))} /></span>
    <span class="flex-[1.4] grid md:flex-none"><Button variant="primary" size="lg" icon="i-solar:check-circle-linear" label="Saved · open crafts" onclick={() => void goto(resolve('/crafts'))} /></span>
  {:else}
    <span class="flex-1 grid md:flex-none"><Button target="" href="/make/output" style="outline" size="lg" label="Back to sheets" /></span>
    <span class="flex-[1.4] grid md:flex-none"><Button variant="primary" size="lg" icon="i-solar:diskette-linear" label="Save craft" onclick={() => app.finishCraft()} /></span>
  {/if}
{/snippet}
<svelte:head><title>Katachi · Assemble</title></svelte:head>
<StepScreen {aside} {actions} note={guide.assemble.text} label="Assembly steps">
  <div class="mx-auto w-full max-w-[720px] flex flex-col gap-4">
    {#if finished}
      <p role="status" class="flex items-center gap-2 rounded-md border border-paper-edge bg-paper-soft px-3 py-2 text-ui text-success"><span class="i-solar:check-circle-linear" aria-hidden="true"></span>Saved to your crafts with {steps.length} steps and {f.notes.length} notes.</p>
    {/if}
    <figure class="m-0 relative aspect-[4/3] md:aspect-[16/10] rounded-lg overflow-hidden border border-paper-edge bg-paper-soft">
      {#if joined}<BirdhouseView view={views[Math.min(at, views.length - 1)]} label={step.title} />
      {:else if app.stageImage && f.overlays.length}<PhotoStage image={app.stageImage} label={step.title} overlays={f.overlays.filter((_, i) => !step.layer || i < step.layer).map((o) => ({ d: o.d, tone: o.tone, opacity: 0.5 }))} />
      {:else}<span class="absolute inset-0 p-4 flex justify-center"><span class="h-full max-w-full aspect-square"><LayeredScene layers={step.layer ? f.layers.filter((l) => l.n <= step.layer!) : f.layers} mode={step.layer ? 'layer' : 'full'} selected={step.layer ?? 0} hidden={false} label={step.title} /></span></span>{/if}
      <figcaption class="absolute left-2.5 top-2.5 meta rounded-full bg-paper-soft border border-paper-edge px-2.5 py-1">Step {at + 1} of {steps.length}</figcaption>
    </figure>
    <Card class="p-4 flex flex-col gap-3">
      <h2 class="font-heading text-title font-normal">{step.title}</h2>
      <p class="text-body text-ink-mute">{step.detail}</p>
      <div class="flex flex-wrap items-center gap-2.5">
        <label class="flex items-center gap-2 cursor-pointer text-ui flex-1"><InputCheckbox variant="default" name="step-done" value={f.assembled.includes(at)} onchange={() => f.toggleAssembled(at)} />Done</label>
        <Button style="ghost" icon="i-solar:camera-linear" label="Picture it finished" title="Muse Image renders the finished piece" onclick={() => app.renderFinished()} />
        <Button style="ghost" icon="i-solar:alt-arrow-left-linear" label="Previous" disabled={at === 0} onclick={() => f.openAssembleStep(at - 1)} />
        <Button style="outline" iconRight="i-solar:alt-arrow-right-linear" label="Next" disabled={at >= steps.length - 1} onclick={() => { if (!f.assembled.includes(at)) f.toggleAssembled(at); f.openAssembleStep(at + 1); }} />
      </div>
    </Card>
  </div>
</StepScreen>
