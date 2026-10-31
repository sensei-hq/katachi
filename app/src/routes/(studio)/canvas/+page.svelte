<script lang="ts">
import { Button, Card, Toggle } from '@rokkit/ui';
import { InputField } from '@rokkit/forms';
import EditorToolbar from '$lib/components/editor/EditorToolbar.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import BirdhouseView from '$lib/components/illustrations/BirdhouseView.svelte';
import LayerSwatch from '$lib/components/illustrations/LayerSwatch.svelte';
import CutSheet from '$lib/components/CutSheet.svelte';
import type { Op } from '$lib/state/editor.svelte';
import { useApp } from '$lib/state/context';
// Work area (docs/design/07 G17): manual edits to the open craft's sheets. Pick a sheet, see it on the bed,
// rename it, change its material and its laser settings. Studio: toolbar · sheets | bed | sheet panel.
const app = useApp();
const f = app.layers;
const ed = app.editor;
const craft = $derived(app.project && app.project.reached >= 0 ? app.project : null);
const joined = $derived(f.kind === '3d');
const sheet = $derived(f.selected);
const pad = (n: number) => String(n).padStart(2, '0');
$effect(() => app.setScreen('Work area', craft ? `${app.title} · ${joined ? 'parts' : `sheet ${pad(sheet.n)} · ${sheet.name}`}` : 'open a craft to edit its sheets'));
const ops = [{ label: 'Cut', value: 'cut' }, { label: 'Engrave', value: 'engrave' }, { label: 'Score', value: 'score' }];
const sheetSize = $derived(f.set === 'paper' ? '12 × 12 in' : '300 × 300 mm');
</script>
<svelte:head><title>Katachi · Work area</title></svelte:head>
{#if !craft}
  <section aria-label="No craft open" class="mx-auto max-w-[520px] px-4 py-16 flex flex-col items-center gap-3 text-center">
    <span class="i-solar:pen-2-linear text-head text-ink-soft" aria-hidden="true"></span>
    <h2 class="panel-title">Nothing to edit yet</h2>
    <p class="text-ui text-ink-mute">The work area edits a craft's sheets by hand. Open a craft, or start one, and its sheets appear here.</p>
    <div class="flex gap-2.5"><Button variant="primary" label="Your crafts" href="/workshop" target="" /><Button style="outline" label="Start a craft" href="/workshop" target="" /></div>
  </section>
{:else}
  <div class="md:h-full flex flex-col md:min-h-0">
    <div class="lt-md:hidden"><EditorToolbar tool={ed.tool} zoomLabel={ed.zoomLabel} showGrid={ed.showGrid} statusLine={ed.statusLine} propsOpen={false}
      onTool={(t) => ed.setTool(t)} onZoomIn={() => ed.zoomIn()} onZoomOut={() => ed.zoomOut()} onToggleGrid={() => ed.toggleGrid()} onToggleProps={() => app.toggleChat()} /></div>
    <div class="flex-1 md:min-h-0 flex flex-col md:flex-row">
      <!-- sheets (or parts) of this craft -->
      <nav aria-label="Sheets" class="md:w-[240px] md:shrink-0 md:overflow-auto md:border-r md:border-paper-edge md:bg-paper-soft p-3 flex md:flex-col gap-1.5 overflow-x-auto">
        <p class="lt-md:hidden eyebrow px-1 pb-1">{joined ? 'Parts' : `${f.layers.length} sheets · back → front`}</p>
        {#if joined}
          {#each f.partRows as p (p.name)}<span class="shrink-0 rounded-md px-2.5 py-2 text-ui border border-paper-edge {p.ok ? 'text-ink' : 'text-warning-ink'}">{p.name}<span class="lt-md:hidden block meta">{p.ok ? p.size : p.missing}</span></span>{/each}
        {:else}
          {#each f.layers as l (l.n)}
            <button type="button" aria-current={l.n === sheet.n ? 'true' : undefined} onclick={() => f.selectLayer(l.n)}
              class="shrink-0 flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-ui cursor-pointer {l.n === sheet.n ? 'bg-paper-mute text-ink' : 'text-ink-mute hover:bg-paper-mute'}">
              <LayerSwatch colour={l.colour} size="sm" /><span class="font-mono text-micro">{pad(l.n)}</span><span class="truncate">{l.name}</span>
            </button>
          {/each}
        {/if}
      </nav>

      <!-- the bed -->
      <div class="flex-1 min-w-0 md:overflow-auto p-4 md:p-6 {ed.showGrid ? 'md:grid-bed' : ''}">
        <figure class="m-0 mx-auto relative rounded-lg border border-paper-edge bg-paper-soft p-4 aspect-square" style:width="min(100%, {Math.round(560 * ed.zoom / 100)}px)">
          {#if joined}<BirdhouseView view="front" label="Front part on the bed" />
          {:else}
            {@const cut = f.cutPathFor(sheet.n)}
            {#if cut}<CutSheet d={cut} colour={sheet.colour} image={app.stageImage} label={`Sheet ${pad(sheet.n)}, ${sheet.name}, on the bed: its traced cut`} />
            {:else}<LayeredScene layers={f.layers} mode="layer" selected={sheet.n} hidden={false} label={`Sheet ${pad(sheet.n)}, ${sheet.name}, on the bed`} />{/if}
            <span class="absolute left-3 top-3 w-2.5 h-2.5 rounded-full border border-accent" aria-hidden="true"></span>
            <span class="absolute right-3 top-3 w-2.5 h-2.5 rounded-full border border-accent" aria-hidden="true"></span>
            <span class="absolute left-3 bottom-3 w-2.5 h-2.5 rounded-full border border-accent" aria-hidden="true"></span>
          {/if}
          <figcaption class="absolute right-3 bottom-2 meta">{sheetSize}</figcaption>
        </figure>
        <p class="text-center meta mt-2">{f.cutPathFor(sheet.n) ? 'The traced cut for this sheet. Edit its shape on Layers (tools and sliders); details and laser settings save here.' : 'The cut appears here once Layers has traced this sheet.'}</p>
      </div>

      <!-- the selected sheet -->
      {#if !joined}
        <aside aria-label="Sheet" class="md:w-[300px] md:shrink-0 md:overflow-auto md:border-l md:border-paper-edge md:bg-paper-soft p-4 flex flex-col gap-3">
          <p class="eyebrow">Sheet {pad(sheet.n)}</p>
          {#key sheet.n}
            <InputField name="sheet-name" type="text" label="Name" value={sheet.name} onchange={(v: unknown) => f.renameLayer(sheet.n, String(v))} />
            <InputField name="sheet-material" type="text" label="Material" value={sheet.material} onchange={(v: unknown) => f.setLayerMaterial(sheet.n, String(v))} />
          {/key}
          <Card><dl class="divide-y divide-paper-edge -my-1">
            <div class="flex justify-between items-center min-h-10"><dt>Shows</dt><dd class="readout text-ink">{sheet.visiblePct}%</dd></div>
            <div class="flex justify-between items-center min-h-10"><dt>Hidden behind</dt><dd class="readout text-ink">{sheet.hiddenPct}%</dd></div>
          </dl></Card>
          <p class="eyebrow mt-1">Laser settings</p>
          <Toggle options={ops} value={ed.op} label="Operation" onchange={(v) => ed.setOp(v as Op)} />
          <InputField name="power" type="number" label="Power %" value={ed.params.power} onchange={(v: unknown) => ed.setParam('power', Number(v))} />
          <InputField name="speed" type="number" label="Speed mm/s" value={ed.params.speed} onchange={(v: unknown) => ed.setParam('speed', Number(v))} />
          <div class="flex gap-2 mt-auto pt-2">
            <span class="flex-1 grid"><Button style="outline" label="Layers" href="/make/layers" target="" /></span>
            <span class="flex-1 grid"><Button variant="primary" label="Sheets" iconRight="i-solar:arrow-right-linear" href="/make/output" target="" /></span>
          </div>
        </aside>
      {/if}
    </div>
  </div>
{/if}
