<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Button, Card, Switch, Toggle } from '@rokkit/ui';
import StepScreen from '$lib/components/StepScreen.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import PhotoStage from '$lib/components/PhotoStage.svelte';
import { copy, refineTools, type RefineTool, type SegmentView } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
// D2 · Segment + pick regions (studio) · 03 · Objects (phone)
const app = useApp();
const f = app.layers;
$effect(() => app.setScreen(app.title, copy.segment.sub));
const fill: Record<string, string> = { muted: 'bg-ink-soft', warn: 'bg-warning', accent: 'bg-accent', ok: 'bg-success', ink: 'bg-ink' };
const ring: Record<string, string> = { muted: 'border-ink-soft', warn: 'border-warning', accent: 'border-accent', ok: 'border-success', ink: 'border-ink' };
const views = [{ label: 'Masks', value: 'masks' }, { label: 'Cutout', value: 'cutout' }, { label: 'Original', value: 'original' }];
const tools = refineTools.map((t) => ({ label: t.label, value: t.id }));
</script>
{#snippet aside()}
  <section aria-label="Regions" class="flex flex-col gap-2.5">
    <p class="flex justify-between items-center"><span class="eyebrow">Regions</span><span class="meta">{f.kept.length} of {f.regions.length} kept</span></p>
    <Card>
      <ul class="divide-y divide-paper-edge -my-1">
        {#each f.regions as r (r.id)}
          <li class="flex items-center gap-2.5 min-h-[54px] py-1.5">
            <span class="w-3.5 h-3.5 shrink-0 rounded-sm border-2 {ring[r.tone]} {r.on ? fill[r.tone] : ''}" aria-hidden="true"></span>
            <span class="flex-1 min-w-0"><span class="block text-body">{r.name}</span><span class="meta">{r.pct}% · {r.note}</span></span>
            <Switch value={r.on} options={[{ label: r.name, value: false }, { label: r.name, value: true }]} onchange={() => f.toggleRegion(r.id)} />
          </li>
        {/each}
      </ul>
    </Card>
  </section>
  <div class="lt-md:hidden flex flex-col gap-2.5 mt-1.5">
    <p class="eyebrow">Refine</p>
    <Toggle options={tools} value={f.refineTool} label="Refine" class="chips cols-2" onchange={(v) => f.setRefineTool(v as RefineTool)} />
  </div>
  <Card class="lt-md:hidden mt-auto">
    <p class="eyebrow mb-1.5">Background</p>
    <p class="flex justify-between text-ui"><span>{copy.segment.background}</span><span class="meta text-success">removed</span></p>
    <p class="flex justify-between text-ui"><span>Outline</span><span class="meta text-ink">circle · Ø 300?</span></p>
  </Card>
{/snippet}
{#snippet actions()}
  <span class="flex-1 grid md:hidden"><Button style="outline" size="lg" label="Draw a region" /></span>
  <span class="flex-[1.4] grid md:flex-none"><Button variant="primary" size="lg" iconRight="i-solar:arrow-right-linear" label={copy.segment.next} onclick={() => void goto(resolve('/make/layers'))} /></span>
{/snippet}
<svelte:head><title>Katachi · Objects</title></svelte:head>
<StepScreen {aside} {actions} note={app.noteFor('segment')}>
  <div class="flex flex-col gap-3 items-center md:h-full">
    <div class="lt-md:hidden"><Toggle options={views} value={f.segmentView} label="Show" onchange={(v) => f.setSegmentView(v as SegmentView)} /></div>
    <figure class="relative m-0 w-full max-w-[640px] aspect-square md:flex-1 md:max-h-[640px] rounded-lg overflow-hidden border border-paper-edge bg-paper-soft">
      <span class="absolute left-2.5 top-2.5 z-1 meta rounded-sm bg-paper px-2 py-0.5 border border-paper-edge">{f.kept.length} of {f.regions.length} kept · {f.keptPct}% of image</span>
      {#if app.stageImage && f.overlays.length}
        <PhotoStage image={app.stageImage} label={`Your photo with the SAM regions: ${app.title}`} overlays={f.segmentView === 'original' ? [] : f.overlays.filter((o) => f.segmentView === 'masks' || o.on).map((o) => ({ d: o.d, tone: o.tone, opacity: o.on ? 0.45 : 0.07, outlineOnly: !o.on }))} />
      {:else if app.stageImage}
        <PhotoStage image={app.stageImage} label={`Your photo: ${app.title}`} />
      {:else if f.segmentView === 'masks'}<LayeredScene layers={f.layers} mode="regions" regions={f.regions} label="Regions found in the image, tinted by kind" />
      {:else}<LayeredScene layers={f.layers} mode={f.segmentView} />{/if}
    </figure>
  </div>
</StepScreen>
