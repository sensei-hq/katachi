<script lang="ts">
import { Button, Card, ProgressBar } from '@rokkit/ui';
import { InputField } from '@rokkit/forms';
import StepScreen from '$lib/components/StepScreen.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import SheetSvg from '$lib/components/SheetSvg.svelte';
import LayerSwatch from '$lib/components/illustrations/LayerSwatch.svelte';
import { copy, guide } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
import { stepContext } from '$lib/state/step-context.svelte';
// D6 · Output + device (studio) · 07 · Stack & cut (phone). Cutters take one sheet at a time:
// feed the sheet's material, send it, watch it cut, check it, then the next sheet.
const app = useApp();
const f = app.layers;
$effect(() => app.setScreen(app.title, `${copy.output.sub} · ${f.layers.length} sheets`));
const ctx = stepContext(app, 'Output', output);
const rows = $derived<[string, string][]>([['Format', f.currentDevice.format], ['Settings', f.currentDevice.settings], ['Time', f.currentDevice.time]]);
const pad = (n: number) => String(n).padStart(2, '0');
const sheetSize = $derived(f.set === 'paper' ? '12 × 12 in' : '300 × 300 mm');
const cutting = $derived(f.currentDevice.id !== 'file');
const statusText = { cut: 'cut', current: 'next', waiting: '' } as const;
</script>
{#snippet output()}
  <div class="flex flex-col gap-3">
    <InputField type="radio" name="device" label="Send to" options={app.devices} value={f.currentDevice} onchange={(d: any) => f.setDevice(d.id)} />
    <Card><dl class="divide-y divide-paper-edge -my-1">{#each rows as [k, v] (k)}<div class="flex justify-between gap-3 min-h-11 items-center"><dt>{k}</dt><dd class="readout text-ink text-right">{v}</dd></div>{/each}</dl></Card>
    <p class="text-ui text-ink-mute mt-1">When the sheets are cut, Assemble walks you through putting them together.</p>
  </div>
{/snippet}
{#snippet actions()}
  <span class="flex-1 grid md:flex-none"><Button style="outline" size="lg" icon="i-solar:download-linear" label={ctx.wide ? 'Download .zip' : copy.output.export} onclick={() => app.exportSheets()} /></span>
  <span class="flex-[1.3] grid md:flex-none"><Button target="" href="/make/assemble" variant={f.job.phase === 'done' || !cutting ? 'primary' : 'default'} style={f.job.phase === 'done' || !cutting ? 'default' : 'outline'} size="lg" iconRight="i-solar:arrow-right-linear" label="Assemble" /></span>
{/snippet}
<svelte:head><title>Katachi · Output</title></svelte:head>
<StepScreen {actions} context={ctx.inline} note={guide.output.text}>
  <div class="flex flex-col gap-5">
    {#if cutting}
      <section aria-label="Cutting" class="rounded-lg border border-paper-edge bg-paper-soft p-4 grid gap-4 md:grid-cols-[180px_1fr] items-center">
        <div class="aspect-square rounded-md bg-paper border border-paper-edge p-3">{#if f.sheetFor(f.jobLayer.n)}<SheetSvg svg={f.sheetFor(f.jobLayer.n)!.svg} sizeMm={f.sheetFor(f.jobLayer.n)!.sizeMm ?? 300} label={`Sheet ${pad(f.jobLayer.n)}, ${f.jobLayer.name}: traced cut paths`} />{:else}<LayeredScene layers={f.layers} mode="layer" selected={f.jobLayer.n} label={`Sheet ${pad(f.jobLayer.n)}, ${f.jobLayer.name}`} />{/if}</div>
        <div class="flex flex-col gap-3">
          {#if f.job.phase === 'done'}
            <p class="eyebrow">All sheets cut</p>
            <h2 class="font-heading text-title font-normal">{f.layers.length} sheets ready to stack</h2>
            <p class="text-ui text-ink-mute">Next: {app.assembly[1]?.title ?? 'assemble'}.</p>
          {:else}
            <p class="eyebrow">Sheet {f.job.sheet} of {f.layers.length} · {f.currentDevice.label}</p>
            <h2 class="font-heading text-title font-normal">{f.jobLayer.name}</h2>
            {#if f.job.phase === 'feed'}
              <p class="flex items-center gap-2 text-body"><LayerSwatch colour={f.jobLayer.colour} size="sm" />{f.feedText} · {sheetSize}</p>
              <div class="flex gap-2"><Button variant="primary" icon="i-solar:play-linear" label={`${f.currentDevice.cta} sheet ${f.job.sheet}`} onclick={() => app.sendSheet()} /></div>
            {:else if f.job.phase === 'cutting'}
              <p class="text-ui text-ink-mute">Cutting… {f.job.progress}%</p>
              <ProgressBar value={f.job.progress} max={100} />
            {:else}
              <p class="text-body">Did it cut cleanly? Peel the sheet and check the small details.</p>
              <div class="flex flex-wrap gap-2">
                <Button style="outline" icon="i-solar:refresh-linear" label="Cut again" onclick={() => f.recut()} />
                <Button variant="primary" iconRight="i-solar:arrow-right-linear" label={f.job.sheet < f.layers.length ? 'Looks good — next sheet' : 'Looks good — finish'} onclick={() => f.confirmCut()} />
              </div>
            {/if}
          {/if}
        </div>
      </section>
    {/if}
    <section aria-label="Sheets" class="flex flex-col gap-4">
      <header class="lt-md:hidden flex items-start justify-between gap-4">
        <div><h2 class="font-heading text-head font-normal tracking-display">{f.layers.length} sheets · {sheetSize}</h2><p class="text-ui text-ink-mute mt-1">Each sheet has 3 registration holes (accent) so the stack lines up on pins.</p></div>
        <p class="readout text-ink whitespace-nowrap mt-2">{app.title.toLowerCase().replace(/\s+/g, '-')}_L01–L{pad(f.layers.length)}</p>
      </header>
      <div class="grid grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {#each f.layers as l (l.n)}
          {@const status = cutting ? f.sheetStatus(l.n) : 'waiting'}
          <div class="rounded-lg border bg-paper-soft p-2 md:p-3 flex flex-col gap-2 {status === 'current' ? 'border-accent' : 'border-paper-edge'}">
            <div class="relative aspect-square rounded-md bg-paper border border-paper-edge p-3 md:p-4">
              {#if f.sheetFor(l.n)}<SheetSvg svg={f.sheetFor(l.n)!.svg} sizeMm={f.sheetFor(l.n)!.sizeMm ?? 300} label={`Sheet ${pad(l.n)}, ${l.name}: traced cut paths`} />{:else}<LayeredScene layers={f.layers} mode="layer" selected={l.n} label={`Sheet ${pad(l.n)}, ${l.name}`} />{/if}
              <span class="absolute left-2 top-2 w-2 h-2 rounded-full border border-accent" aria-hidden="true"></span>
              <span class="absolute right-2 top-2 w-2 h-2 rounded-full border border-accent" aria-hidden="true"></span>
              <span class="absolute left-2 bottom-2 w-2 h-2 rounded-full border border-accent" aria-hidden="true"></span>
            </div>
            <p class="flex items-center gap-2 text-ui"><LayerSwatch colour={l.colour} size="sm" /><span class="flex-1 truncate">{pad(l.n)} · {l.name}</span><span class="meta {status === 'cut' ? 'text-success' : ''}">{cutting ? statusText[status] : '.svg'}</span></p>
          </div>
        {/each}
      </div>
    </section>
  </div>
</StepScreen>
