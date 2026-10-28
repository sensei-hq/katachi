<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Button } from '@rokkit/ui';
import { InputCheckbox, InputField } from '@rokkit/forms';
import StepScreen from '$lib/components/StepScreen.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import PhotoStage from '$lib/components/PhotoStage.svelte';
import { copy, gapChoices, gapRules } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
import { stepContext } from '$lib/state/step-context.svelte';
// D4 · Gap review (studio) · 05 · Gap fill guidance (phone)
const app = useApp();
const f = app.layers;
$effect(() => app.setScreen(app.title, `${copy.gaps.sub} · ${f.layers.length} layers`));
const ctx = stepContext(app, 'Gap rule', rule);
const go = () => void goto(resolve('/make/output'));
const card = $derived(f.gapCards.find((c) => c.n === f.selected.n) ?? f.gapCards[0] ?? { ...f.selected, solid: true });
</script>
{#snippet rule()}
  <InputField type="radio" name="rule" label={copy.gaps.rule} options={gapRules} value={gapRules.find((r) => r.id === f.gapRule)} onchange={(r: any) => f.setGapRule(r.id)} />
{/snippet}
{#snippet aside()}
  <InputField type="radio" name="gap" label="Fill the hidden area" options={gapChoices} value={f.currentGap} onchange={(g: any) => f.setGapChoice(g.id)} />
  <label class="flex items-center gap-3 cursor-pointer"><InputCheckbox variant="default" name="apply-all" value={f.applyAll} onchange={() => f.toggleApplyAll()} /><span>Use this for all {f.layers.length} layers</span></label>
{/snippet}
{#snippet actions()}
  <span class="flex-1 grid md:hidden"><Button style="outline" size="lg" label="Next layer" onclick={() => f.nextLayer()} /></span>
  <span class="flex-[1.3] grid md:flex-none"><Button variant="primary" size="lg" iconRight="i-solar:arrow-right-linear" label={copy.gaps.next} onclick={go} /></span>
{/snippet}
<svelte:head><title>Katachi · Gaps</title></svelte:head>
<StepScreen aside={ctx.wide ? undefined : aside} {actions} note={`${f.selected.hiddenPct}% of this layer is hidden behind the layers in front. The photo can’t show what’s there — how should I fill it?`}>
  <figure class="md:hidden relative m-0 h-[230px] rounded-lg overflow-hidden border border-paper-edge bg-paper-soft p-2">
    {#if app.stageImage && f.overlayForLayer(f.selected.n)}
      <PhotoStage image={app.stageImage} label={`L${f.selected.n} · ${f.selected.name} · ${card.solid ? 'filled solid' : 'left open'}`} overlays={[{ d: f.overlayForLayer(f.selected.n)!.d, tone: f.overlayForLayer(f.selected.n)!.tone, opacity: 0.55, hatch: !card.solid }]} />
    {:else}<LayeredScene layers={f.layers} mode="layer" selected={f.selected.n} label={`L${f.selected.n} · ${f.selected.name} · ${card.solid ? 'filled solid' : 'left open'}`} />{/if}
    <span class="absolute left-2.5 top-2.5 meta rounded-sm bg-paper px-2 py-0.5 border border-paper-edge">L{f.selected.n} · {f.selected.name} · {card.solid ? 'filled solid' : 'left open'}</span>
  </figure>
  <section aria-label="Gap review" class="lt-md:hidden flex flex-col gap-5">
    <header class="flex items-start justify-between gap-4">
      <div><h2 class="font-heading text-head font-normal tracking-display">Fill what the photo can’t see</h2><p class="text-ui text-ink-mute mt-1">Hatched = hidden behind the layers above. Click a card to switch between solid and open.</p></div>
      <p class="readout text-ink whitespace-nowrap mt-2">material {f.materialPct}% of {f.layers.length} full sheets</p>
    </header>
    <div class="grid grid-cols-3 lg:grid-cols-4 gap-4">
      {#each f.gapCards as c (c.n)}
        <div class="rounded-lg border border-paper-edge bg-paper-soft p-3 flex flex-col gap-2.5">
          <div class="aspect-square rounded-md overflow-hidden">{#if app.stageImage && f.overlayForLayer(c.n)}<PhotoStage image={app.stageImage} label={`L${c.n} ${c.name}, ${c.solid ? 'solid' : 'open'}`} overlays={[{ d: f.overlayForLayer(c.n)!.d, tone: f.overlayForLayer(c.n)!.tone, opacity: 0.55, hatch: !c.solid }]} />{:else}<LayeredScene layers={f.layers} mode="layer" selected={c.n} label={`L${c.n} ${c.name}, ${c.solid ? 'solid' : 'open'}`} />{/if}</div>
          <div class="flex items-center justify-between gap-2"><span class="text-body"><span class="meta mr-1.5">L{c.n}</span>{c.name}</span>
            <Button size="sm" style={c.solid ? 'default' : 'outline'} variant={c.solid ? 'primary' : 'default'} class="rounded-full font-mono" aria-pressed={c.solid} label={c.solid ? 'solid' : 'open'} aria-label={`L${c.n} ${c.name}: ${c.solid ? 'solid' : 'open'}`} onclick={() => f.toggleSolid(c.n)} /></div>
        </div>
      {/each}
    </div>
  </section>
</StepScreen>
