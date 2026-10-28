<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Button, StatusList, Toggle } from '@rokkit/ui';
import StepScreen from '$lib/components/StepScreen.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import PhotoStage from '$lib/components/PhotoStage.svelte';
import { copy } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
// 02 · Cutout (phone); in the studio it is the first half of Segment
const app = useApp();
const f = app.layers;
$effect(() => app.setScreen(app.title, copy.cutout.sub));
const views = [{ label: copy.cutout.original, value: 'original' }, { label: copy.cutout.cutout, value: 'cutout' }];
</script>
{#snippet aside()}
  <p class="eyebrow">Checks</p>
  <StatusList items={f.cutoutChecks} />
  <Button style="outline" size="sm" class="self-start" icon="i-solar:eraser-linear" label="Erase the shadow" />
{/snippet}
{#snippet actions()}
  <span class="flex-1 grid md:flex-none"><Button style="outline" size="lg" label={copy.cutout.touch} /></span>
  <span class="flex-[1.4] grid md:flex-none"><Button variant="primary" size="lg" label={copy.cutout.next} onclick={() => void goto(resolve('/make/segment'))} /></span>
{/snippet}
<svelte:head><title>Katachi · Cutout</title></svelte:head>
<StepScreen {aside} {actions} note={app.noteFor('cutout')}>
  <div class="flex flex-col gap-3 items-center md:h-full">
    <div class="md:order-first lt-md:order-last"><Toggle options={views} value={f.cutoutView} label="View" onchange={(v) => f.setCutoutView(v as 'original' | 'cutout')} /></div>
    <figure class="relative m-0 w-full max-w-[640px] aspect-square md:flex-1 md:max-h-[640px] rounded-lg overflow-hidden border border-paper-edge bg-paper-soft">
      <span class="absolute left-2.5 top-2.5 z-1 meta rounded-sm bg-paper px-2 py-0.5 border border-paper-edge">background removed · {f.outline.shape} outline</span>
      {#if app.stageImage && f.subjectPaths.length}
        <PhotoStage image={app.stageImage} label={`Your photo, background removed: ${app.title}`} overlays={f.cutoutView === 'cutout' ? [{ d: f.subjectD, tone: 'accent' as const, opacity: 0.35 }] : []} clipped={f.cutoutView === 'cutout'} />
      {:else if app.stageImage}
        <PhotoStage image={app.stageImage} label={`Your photo: ${app.title}`} />
      {:else}<LayeredScene layers={f.layers} mode={f.cutoutView} />{/if}
    </figure>
  </div>
</StepScreen>
