<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Button, Card, List, ProgressBar, Toggle } from '@rokkit/ui';
import StepScreen from '$lib/components/StepScreen.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import PhotoStage from '$lib/components/PhotoStage.svelte';
import LayerSwatch from '$lib/components/illustrations/LayerSwatch.svelte';
import { InputCheckbox } from '@rokkit/forms';
import { copy, gapChoices, type GapChoice } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
import { stepContext } from '$lib/state/step-context.svelte';
// D3 · Layer stack editor (studio) · 04 · Colour-graded layers (phone)
const app = useApp();
const f = app.layers;
$effect(() => app.setScreen(app.title, `${copy.layers.sub} · ${f.layers.length} layers`));
stepContext(app, 'Layer', inspector);
const items = $derived(f.layers.map((l) => ({ label: l.name, value: l.n, layer: l })));
const hidden = gapChoices.filter((g) => g.id !== 'draw').map((g) => ({ label: g.label.replace(' behind', '').replace('Let Katachi imagine it', 'Imagine').replace('Leave it open', 'Leave open'), value: g.id }));
const go = () => void goto(resolve('/make/gaps'));
const selLabel = $derived(`Layer ${f.selected.n}, ${f.selected.name}: ${[f.showSolid ? 'visible area solid' : 'outline only', f.showHidden ? 'hidden area hatched' : ''].filter(Boolean).join(', ')}`);
</script>
{#snippet inspector()}
  <div class="flex flex-col gap-3">
    <div><p class="eyebrow">Layer {f.selected.n}</p><h2 class="font-heading text-head font-normal tracking-display">{f.selected.name}</h2></div>
    <Card>
      <dl class="divide-y divide-paper-edge -my-1">
        <div class="flex justify-between items-center min-h-11"><dt>Colour</dt><dd class="flex items-center gap-2"><LayerSwatch colour={f.selected.colour} size="sm" /><span class="readout text-ink">{f.selected.colour}</span></dd></div>
        <div class="flex justify-between items-center min-h-11"><dt>Shows</dt><dd class="readout text-ink">{f.selected.visiblePct}%</dd></div>
        <div class="flex justify-between items-center min-h-11"><dt>Hidden</dt><dd class="readout text-ink">{f.selected.hiddenPct}%</dd></div>
        <div class="flex justify-between items-center min-h-11"><dt>Material</dt><dd class="text-ui">{f.selected.material}</dd></div>
      </dl>
    </Card>
    {#if f.selected.flag}<p class="text-ui text-warning-ink">{f.selected.flag}</p>{/if}
    <p class="eyebrow mt-1">Hidden area</p>
    <Toggle options={hidden} value={f.gapChoice} label="Hidden area" class="seg" onchange={(v) => f.setGapChoice(v as GapChoice)} />
    <p class="text-ui text-ink-mute">{f.currentGap.hint}</p>
    <p class="eyebrow mt-1">Depth</p>
    <ProgressBar value={f.selected.n} max={f.layers.length} />
    <p class="meta">{f.selected.n} of {f.layers.length} · {f.depthMm} mm from the back</p>
  </div>
{/snippet}
{#snippet viewToggles()}
  <div class="flex flex-wrap justify-center gap-x-6 gap-y-1 text-ui text-ink-mute">
    <label class="flex items-center gap-2 cursor-pointer"><InputCheckbox variant="default" name="show-solid" value={f.showSolid} onchange={() => f.toggleSolidView()} /><LayerSwatch colour={f.selected.colour} size="sm" />Shows as solid</label>
    <label class="flex items-center gap-2 cursor-pointer"><InputCheckbox variant="default" name="show-hidden" value={f.showHidden} onchange={() => f.toggleHiddenView()} />Hidden behind layers above</label>
  </div>
{/snippet}
{#snippet aside()}
  <span class="eyebrow">Stacked layers · {copy.layers.order}</span>
  <div class="flex flex-wrap gap-1 -mt-1.5" role="toolbar" aria-label="Layer tools">
    <span class="contents">
      <Button size="sm" style="ghost" icon="i-solar:copy-linear" label="Duplicate" onclick={() => f.duplicate(f.selected.n)} />
      <Button size="sm" style="ghost" icon="i-solar:layers-minimalistic-linear" label="Merge down" title="Merge with the layer in front" disabled={!f.canMergeDown(f.selected.n)} onclick={() => f.mergeDown(f.selected.n)} />
      <Button size="sm" style="ghost" icon="i-solar:scissors-linear" label="Split" title={f.canSplit(f.selected.n) ? 'Split into its islands' : 'One piece — splitting by tone needs the real photo masks'} disabled={!f.canSplit(f.selected.n)} onclick={() => f.split(f.selected.n)} />
    </span>
  </div>
  <Card class="overflow-hidden">
    <List {items} value={f.selected.n} label="Layer stack, back to front" onselect={(v) => f.selectLayer(Number(v))}>
      {#snippet itemContent(proxy)}
        {@const l = proxy.get('layer')}
        <span class="flex items-center gap-3 w-full py-1">
          <span class="w-8 h-8 shrink-0 rounded-sm bg-paper-mute" aria-hidden="true"><LayeredScene layers={f.layers} mode="layer" selected={l.n} label="" /></span>
          <span class="flex-1 min-w-0 text-left"><span class="block text-body text-ink truncate">{l.name}</span><span class="lt-md:hidden meta whitespace-nowrap">{l.visiblePct}% shows · {l.hiddenPct}% hidden</span></span>
          <span class="md:hidden w-14 h-1 rounded-full bg-paper-mute overflow-hidden" aria-hidden="true"><span class="block h-full bg-ink-soft" style:width="{Math.min(100, l.visiblePct * 3)}%"></span></span>
          <span class="md:hidden meta w-10 text-right">{l.visiblePct}%</span>
          <span class="lt-md:hidden"><LayerSwatch colour={l.colour} size="sm" /></span>
        </span>
      {/snippet}
    </List>
  </Card>
  <div class="lt-md:hidden aspect-square rounded-lg border border-paper-edge bg-paper p-2"><LayeredScene layers={f.layers} mode="stack" label="Exploded stack, back to front" /></div>
{/snippet}
{#snippet actions()}
  <span class="flex-1 grid md:flex-none"><Button target="" href="/canvas" style="outline" size="lg" icon="i-solar:pen-2-linear" label="Edit in work area" /></span>
  <span class="flex-[1.3] grid md:hidden"><Button variant="primary" size="lg" label={copy.layers.next} onclick={go} /></span>
  <span class="lt-md:hidden"><Button variant="primary" size="lg" iconRight="i-solar:arrow-right-linear" label="Review all gaps" onclick={go} /></span>
{/snippet}
<svelte:head><title>Katachi · Layers</title></svelte:head>
<StepScreen {aside} {actions} note={app.noteFor('layers')}>
  <figure class="md:hidden relative m-0 h-[214px] rounded-lg overflow-hidden border border-paper-edge bg-paper-soft p-2">
    {#if app.stageImage && f.overlays.length}
      <PhotoStage image={app.stageImage} label={selLabel} overlays={f.overlays.map((o, i) => ({ d: o.d, tone: o.tone, opacity: i === f.selected.n - 1 ? 0.75 : 0.15 }))} />
    {:else}<LayeredScene layers={f.layers} mode="layer" selected={f.selected.n} solid={f.showSolid} hidden={f.showHidden} label={selLabel} />{/if}
    <span class="absolute left-2.5 top-2.5 meta rounded-sm bg-paper px-2 py-0.5 border border-paper-edge">L{f.selected.n} · {f.selected.name}</span>
    <span class="absolute right-2.5 bottom-2.5 flex flex-col items-end gap-1">
      <span class="meta rounded-sm bg-paper px-2 py-0.5 border border-paper-edge flex items-center gap-1.5"><LayerSwatch colour={f.selected.colour} size="sm" />visible {f.selected.visiblePct}%</span>
      <span class="meta rounded-sm bg-paper px-2 py-0.5 border border-paper-edge">hidden {f.selected.hiddenPct}%</span>
    </span>
  </figure>
  <div class="lt-md:hidden h-full flex flex-col items-center gap-3">
    <figure class="m-0 flex-1 min-h-0 w-full max-w-[640px] rounded-lg overflow-hidden border border-paper-edge bg-paper-soft">{#if app.stageImage && f.overlays.length}<PhotoStage image={app.stageImage} label={selLabel} overlays={f.overlays.map((o, i) => ({ d: o.d, tone: o.tone, opacity: i === f.selected.n - 1 ? 0.75 : 0.15 }))} />{:else}<span class="block h-full p-4"><LayeredScene layers={f.layers} mode="layer" selected={f.selected.n} solid={f.showSolid} hidden={f.showHidden} label={selLabel} /></span>{/if}</figure>
    {@render viewToggles()}
  </div>
  <div class="md:hidden mt-3">{@render viewToggles()}</div>
</StepScreen>
