<script lang="ts">
import { Button, Card, ProgressBar, Toggle } from '@rokkit/ui';
import { InputField } from '@rokkit/forms';
import StepScreen from '$lib/components/StepScreen.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import SheetSvg from '$lib/components/SheetSvg.svelte';
import CutPreview from '$lib/components/CutPreview.svelte';
import LayerSwatch from '$lib/components/illustrations/LayerSwatch.svelte';
import { copy, gapRules, guide, type GapRule } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
import { stepContext } from '$lib/state/step-context.svelte';
import { saveFile } from '$lib/components/save-file';
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
const gapRuleOptions = gapRules.map((g) => ({ label: g.label, value: g.id }));
// the virtual run of the pass on the bed: blank sheet → engraving → cut → extra pieces vanish
const preview = $derived(f.previewFor(f.jobLayer.n));
// the hand-off: the craft laid out on sheets for this device (design/15 §5)
const plan = $derived(app.cutPlan);
const layouts = $derived(app.cutLayouts);
const warnings = $derived(plan?.sheets.flatMap((s) => s.warnings ?? []) ?? []);
function downloadAll() { const z = app.sheetsZip(); if (z) saveFile(z.name, 'application/zip', z.bytes); else app.exportSheets(); }
function downloadSheet(format: 'svg' | 'dxf') { const x = app.sheetDownload(f.jobLayer.n, format); if (x) saveFile(x.name, x.mime, x.text); }
</script>
{#snippet output()}
  <div class="flex flex-col gap-3">
    <InputField type="radio" name="device" label="Send to" options={app.devices} value={f.currentDevice} onchange={(d: any) => f.setDevice(d.id)} />
    {#if plan}
      <p class="eyebrow mt-1">Sheets</p>
      <Toggle options={layouts} value={f.cutLayout} label="How the parts go on sheets" class="chips" onchange={(v) => app.setCutLayout(v as typeof f.cutLayout)} />
      <p class="meta leading-snug" data-cut-plan data-sheets={plan.sheets.length}>{plan.sheets.length} sheet{plan.sheets.length === 1 ? '' : 's'} · {layouts.find((o) => o.value === f.cutLayout)?.hint}</p>
      {#if warnings.length}<ul class="meta text-warning-ink leading-snug list-disc pl-4" aria-label="Sheets that need attention">{#each warnings.slice(0, 3) as w (w)}<li>{w}</li>{/each}{#if warnings.length > 3}<li>and {warnings.length - 3} more</li>{/if}</ul>{/if}
      <div class="flex gap-2"><Button size="sm" style="outline" icon="i-solar:file-download-linear" label="This sheet · SVG" onclick={() => downloadSheet('svg')} /><Button size="sm" style="outline" label="DXF" onclick={() => downloadSheet('dxf')} /></div>
    {/if}
    <Card><dl class="divide-y divide-paper-edge -my-1">{#each rows as [k, v] (k)}<div class="flex justify-between gap-3 min-h-11 items-center"><dt>{k}</dt><dd class="readout text-ink text-right">{v}</dd></div>{/each}</dl></Card>
    {#if f.kind !== '3d'}
      <p class="eyebrow mt-1">Hidden parts</p>
      <Toggle options={gapRuleOptions} value={f.gapRule} label="Hidden parts" onchange={(v) => { f.setGapRule(v as GapRule); app.save(); }} />
      <p class="meta leading-snug">{gapRules.find((g) => g.id === f.gapRule)?.hint}</p>
    {/if}
    <p class="text-ui text-ink-mute mt-1">When the sheets are cut, Assemble walks you through putting them together.</p>
  </div>
{/snippet}
{#snippet actions()}
  <span class="flex-1 grid md:flex-none"><Button style="outline" size="lg" icon="i-solar:download-linear" label={ctx.wide ? 'Download .zip' : copy.output.export} onclick={downloadAll} /></span>
  <span class="flex-[1.3] grid md:flex-none"><Button variant="primary" size="lg" icon="i-solar:checklist-minimalistic-linear" label="Send to the cut queue" onclick={() => app.queueSheets()} /></span>
{/snippet}
<svelte:head><title>Katachi · Cut</title></svelte:head>
<StepScreen {actions} context={ctx.inline} note={guide.output.text}>
  <div class="flex flex-col gap-5">
    {#if cutting}
      <section aria-label="Cutting" class="rounded-lg border border-paper-edge bg-paper-soft p-4 grid gap-4 md:grid-cols-[280px_1fr] items-center">
        <div class="aspect-square rounded-md bg-paper border border-paper-edge p-3 grid-bed">{#if preview.cut}<CutPreview cut={preview.cut} engrave={preview.engrave} colour={preview.colour} mode={preview.mode} phase={f.job.phase === 'done' ? 'done' : f.job.phase} progress={f.job.progress} image={app.stageImage} label={`${preview.mode === 'engrave' ? 'Engraving' : 'Cutting'} ${f.jobLayer.name}: a virtual run on the bed`} />
          {:else if f.sheetFor(f.jobLayer.n)}<SheetSvg svg={f.sheetFor(f.jobLayer.n)!.svg} op={f.opFor(f.jobLayer.n)} sizeMm={f.sheetFor(f.jobLayer.n)!.sizeMm ?? 300} bbox={f.sheetFor(f.jobLayer.n)!.bbox} label={`Sheet ${pad(f.jobLayer.n)}, ${f.jobLayer.name}: traced cut paths`} />{:else}<LayeredScene layers={f.layers} mode="layer" selected={f.jobLayer.n} label={`Sheet ${pad(f.jobLayer.n)}, ${f.jobLayer.name}`} />{/if}</div>
        <div class="flex flex-col gap-3">
          {#if f.job.phase === 'done'}
            <p class="eyebrow">All sheets cut</p>
            <h2 class="font-heading text-title font-normal">{f.layers.length} sheets ready to stack</h2>
            <p class="text-ui text-ink-mute">Next: {app.assembly[1]?.title ?? 'assemble'}.</p>
            <span class="self-start"><Button size="sm" style="outline" icon="i-solar:play-circle-linear" label="Play the whole run again" onclick={() => void app.playRun()} /></span>
          {:else}
            <p class="eyebrow flex items-center justify-between gap-2"><span>{f.opFor(f.jobLayer.n) === 'engrave' ? 'Engrave' : 'Sheet'} {f.job.sheet} of {f.layers.length} · {f.currentDevice.label}</span><Button size="sm" style="ghost" icon="i-solar:play-circle-linear" label="Play the whole run" onclick={() => void app.playRun()} /></p>
            <h2 class="font-heading text-title font-normal">{f.jobLayer.name}</h2>
            {#if f.job.phase === 'feed'}
              <p class="flex items-center gap-2 text-body"><LayerSwatch colour={f.jobLayer.colour} size="sm" />{f.feedText} · {sheetSize}</p>
              <div class="flex gap-2"><Button variant="primary" icon="i-solar:play-linear" label={`${f.currentDevice.cta} sheet ${f.job.sheet}`} onclick={() => app.sendSheet()} /></div>
            {:else if f.job.phase === 'cutting'}
              <p class="text-ui text-ink-mute">Cutting… {f.job.progress}%</p>
              <ProgressBar value={f.job.progress} max={100} />
            {:else}
              <p class="text-body">{f.opFor(f.jobLayer.n) === 'engrave' ? 'Engraved. Leave the board where it is — the cut comes next.' : 'Did it cut cleanly? Lift the piece out, drop the extra bits, and check the small details.'}</p>
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
        {#each f.passOrder.map((n) => f.layers[n - 1]).filter(Boolean) as l (l.n)}
          {@const status = cutting ? f.sheetStatus(l.n) : 'waiting'}
          <div class="rounded-lg border bg-paper-soft p-2 md:p-3 flex flex-col gap-2 {status === 'current' ? 'border-accent' : 'border-paper-edge'}">
            <div class="relative aspect-square rounded-md bg-paper border border-paper-edge p-3 md:p-4">
              {#if f.sheetFor(l.n)}<SheetSvg svg={f.sheetFor(l.n)!.svg} op={f.opFor(l.n)} sizeMm={f.sheetFor(l.n)!.sizeMm ?? 300} bbox={f.sheetFor(l.n)!.bbox} label={`Sheet ${pad(l.n)}, ${l.name}: traced cut paths`} />{:else}<LayeredScene layers={f.layers} mode="layer" selected={l.n} label={`Sheet ${pad(l.n)}, ${l.name}`} />{/if}
              <span class="absolute left-2 top-2 w-2 h-2 rounded-full border border-accent" aria-hidden="true"></span>
              <span class="absolute right-2 top-2 w-2 h-2 rounded-full border border-accent" aria-hidden="true"></span>
              <span class="absolute left-2 bottom-2 w-2 h-2 rounded-full border border-accent" aria-hidden="true"></span>
            </div>
            <p class="flex items-center gap-2 text-ui"><LayerSwatch colour={l.colour} size="sm" /><span class="flex-1 truncate">{pad(l.n)} · {l.name}{#if f.build === 'engrave'}<span class="meta ml-1">{f.opFor(l.n) === 'engrave' ? 'engrave' : 'cut last'}</span>{/if}</span><span class="meta {status === 'cut' ? 'text-success' : ''}">{cutting ? statusText[status] : '.svg'}</span></p>
          </div>
        {/each}
      </div>
    </section>
  </div>
</StepScreen>
