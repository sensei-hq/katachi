<script lang="ts">
import { Button, Toggle } from '@rokkit/ui';
import StepScreen from '$lib/components/StepScreen.svelte';
import PhotoStage from '$lib/components/PhotoStage.svelte';
import ExplodedPhoto from '$lib/components/ExplodedPhoto.svelte';
import CutSheet from '$lib/components/CutSheet.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import LayerSwatch from '$lib/components/illustrations/LayerSwatch.svelte';
import { copy } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
// Layers · the breakdown. Analyze lands here from Capture: the background goes, the items are found and each
// is split into layers, live — the work area fills in as the chat says what Katachi is thinking, doing and done.
// The work area is the editor: its toolbar holds the tools, the view and the selected layer's sliders. A layer's
// own actions (show only, hide, quote, duplicate, merge, split, delete) float by its row when it is selected. Every
// action is said in the chat with the layer quoted, then lands there as a step; next steps are chat suggestions.
const app = useApp();
const f = app.layers;
$effect(() => app.setScreen(app.title, f.layers.length ? `${f.items.length} item${f.items.length === 1 ? '' : 's'} · ${f.layers.length} layers` : 'breaking it down'));
const sel = $derived(f.selected);
const hidden = $derived(f.layers.length ? app.hiddenItems() : []);
// pairs and sets found at Layers (by name, else by shape): each item says its pair, and partners are listed together
const groupOf = $derived.by(() => {
  const doc = app.craft.doc, out: Record<string, { name: string; kind: string; at: number; with: string[] }> = {};
  doc.groups.forEach((g, at) => {
    const names = g.items.map((id) => doc.items.find((i) => i.id === id)?.name).filter((n): n is string => Boolean(n));
    for (const n of names) out[n] = { name: g.name, kind: g.kind, at, with: names.filter((o) => o !== n) };
  });
  return out;
});
const listed = $derived([...f.items].sort((a, b) => (groupOf[a.name]?.at ?? Infinity) - (groupOf[b.name]?.at ?? Infinity)));
const tune = $derived(sel.tune ?? { detail: 3, weight: 0 });
const allHidden = $derived(f.layers.length > 0 && f.layers.every((l) => !f.isLayerVisible(l.n)));
// the stage: every visible layer as a hairline, the selected one showing the photo itself inside its mask;
// outside the subject the background is gone (checkerboard)
const layerOverlays = $derived(f.layers.filter((l) => f.isLayerVisible(l.n) || (f.view === 'only' && l.n === sel.n)).map((l) => ({ l, o: f.overlayForLayer(l.n) })).filter((x) => x.o)
  .map(({ l, o }) => ({ d: o!.d, tone: o!.tone, colour: o!.colour, focus: l.n === sel.n, ...(l.n === sel.n ? { sheet: f.cutPathFor(l.n) } : {}) })));
const exploded = $derived(f.layers.filter((l) => f.isLayerVisible(l.n)).map((l) => ({ n: l.n, name: l.name, d: f.overlayForLayer(l.n)?.d ?? '', sheet: f.cutPathFor(l.n), colour: l.colour })).filter((l) => l.d));
// separate items: the photo shows through each item's own outline (from SAM), not the colour-based background pass,
// which on a tray of wood on cloth keeps only fragments; one shape per item, so overlapping items don't cancel
const many = $derived(f.imageBrief?.arrangement === 'multiple-items');
const itemShapes = $derived(many ? f.layers.filter((l) => l.role !== 'engrave').map((l) => f.overlayForLayer(l.n)?.d ?? '').filter(Boolean) : []);
// before the layers land: the outline (background removed), then the items / colour groups found
const pendingOverlays = $derived(f.overlays.length ? f.overlays.map((o) => ({ d: o.d, tone: o.tone, colour: o.colour, outlineOnly: true })) : []);
const stageLabel = $derived(allHidden && f.view !== 'only' ? 'Every layer hidden: your photo' : f.layers.length ? `Layer ${sel.n}, ${sel.name}: ${f.view === 'only' ? 'only this layer' : 'the photo inside its mask'}` : f.subjectPaths.length ? 'Your photo, background removed' : 'Your photo');
const tools = [
  { id: 'pick', icon: 'i-solar:cursor-linear', label: 'Pick a layer' },
  { id: 'area', icon: 'i-solar:square-dashed-linear', label: 'Select an area' },
  { id: 'move', icon: 'i-solar:move-circle-linear', label: 'Grab and move' },
  { id: 'line', icon: 'i-solar:pen-2-linear', label: 'Draw a line' },
  { id: 'circle', icon: 'i-solar:add-circle-linear', label: 'Draw a circle' }
] as const;
const views = [{ label: 'All layers', value: 'all' }, { label: 'This layer', value: 'only' }, { label: 'Its sheet', value: 'cut' }, { label: 'Exploded', value: 'exploded' }];
const builds = [{ label: 'Stacked', value: 'stacked' }, { label: 'Inlay', value: 'inlay' }, { label: 'Engrave + cut', value: 'engrave' }];
const buildHint = { stacked: 'Each layer includes the ones in front of it, on a solid backing in the back colour.', inlay: 'Each colour is its own piece; they fit together on the backing (the whole outline).', engrave: 'One board: the inner colours are engraved first, then the outline is cut.' } as const;
// a drag on the photo (view state only; what it means is applied through AppState.layerAction)
let drag = $state<{ x0: number; y0: number; x: number; y: number } | null>(null);
function pointer(kind: 'down' | 'move' | 'up', x: number, y: number) {
  if (!f.layers.length) return;
  if (kind === 'down') { drag = { x0: x, y0: y, x, y }; return; }
  if (!drag) return;
  if (kind === 'move') { drag = { ...drag, x, y }; return; }
  const d = drag; drag = null;
  const moved = Math.hypot(d.x - d.x0, d.y - d.y0) > 4;
  if (f.tool === 'pick') { const n = f.layerAt(x, y); if (n) f.selectLayer(n); }
  else if (f.tool === 'area') f.setArea(moved ? { x1: d.x0, y1: d.y0, x2: d.x, y2: d.y } : null);
  else if (f.tool === 'move' && moved) void app.layerAction(sel.n, { kind: 'move', dx: Math.round(d.x - d.x0), dy: Math.round(d.y - d.y0) });
  else if (f.tool === 'line' && moved) void app.layerAction(sel.n, { kind: 'shape', mode: f.drawMode, shape: { type: 'line', x1: d.x0, y1: d.y0, x2: d.x, y2: d.y, width: f.strokeWidth } });
  else if (f.tool === 'circle' && moved) void app.layerAction(sel.n, { kind: 'shape', mode: f.drawMode, shape: { type: 'circle', cx: d.x0, cy: d.y0, r: Math.round(Math.hypot(d.x - d.x0, d.y - d.y0)) } });
}
const selD = $derived(f.layers.length ? app.layerPath(sel.n) : '');
const box = $derived(drag && f.tool === 'area' ? { x: Math.min(drag.x0, drag.x), y: Math.min(drag.y0, drag.y), w: Math.abs(drag.x - drag.x0), h: Math.abs(drag.y - drag.y0) } : f.area ? { x: f.area.x1, y: f.area.y1, w: f.area.x2 - f.area.x1, h: f.area.y2 - f.area.y1 } : null);
let detail = $state(3), weight = $state(0);
$effect(() => { detail = tune.detail; weight = tune.weight; });
const sendTune = () => void app.layerAction(sel.n, { kind: 'tune', detail, weight });
let merging = $state(false);
$effect(() => { void sel.n; merging = false; });
</script>
{#snippet toolPreview()}
  {#if box}<rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" class="text-accent" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" />{/if}
  {#if drag && f.tool === 'move' && selD}<path d={selD} transform="translate({drag.x - drag.x0} {drag.y - drag.y0})" fill="none" class="text-accent" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />{/if}
  {#if drag && f.tool === 'line'}<line x1={drag.x0} y1={drag.y0} x2={drag.x} y2={drag.y} class="text-accent" stroke="currentColor" stroke-opacity="0.6" stroke-width={f.strokeWidth} stroke-linecap="round" />{/if}
  {#if drag && f.tool === 'circle'}<circle cx={drag.x0} cy={drag.y0} r={Math.hypot(drag.x - drag.x0, drag.y - drag.y0)} class="text-accent" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />{/if}
{/snippet}
{#snippet toolbar()}
  <!-- the work area's toolbar: tools, the view, and the selected layer's sliders (its actions float by its row) -->
  <div role="toolbar" aria-label="Layer tools" class="flex flex-nowrap w-max md:w-auto md:flex-wrap items-center gap-x-1 gap-y-1.5 rounded-lg border border-paper-edge bg-paper px-2 py-1.5">
    {#each tools as t (t.id)}
      <Button size="sm" style={f.tool === t.id ? 'default' : 'ghost'} variant={f.tool === t.id ? 'primary' : 'default'} icon={t.icon} title={t.label} aria-label={t.label} aria-pressed={f.tool === t.id} onclick={() => f.setTool(t.id)} />
    {/each}
    {#if f.tool === 'line' || f.tool === 'circle'}
      <Button size="sm" style="ghost" icon={f.drawMode === 'add' ? 'i-solar:add-circle-linear' : 'i-solar:eraser-linear'} label={f.drawMode === 'add' ? 'Adds' : 'Cuts'} title="Switch between adding to the layer and cutting out of it" onclick={() => f.setDrawMode(f.drawMode === 'add' ? 'erase' : 'add')} />
      {#if f.tool === 'line'}<label class="flex items-center gap-1.5 meta">Width<input type="range" min="2" max="60" value={f.strokeWidth} class="w-20 text-accent" aria-label="Line width" oninput={(e) => f.setStrokeWidth(Number(e.currentTarget.value))} /></label>{/if}
    {/if}
    {#if f.tool === 'area' && f.area}
      <Button size="sm" style="outline" icon="i-solar:magic-stick-3-linear" label="Smooth" onclick={() => void app.layerAction(sel.n, { kind: 'smoothArea', box: f.area!, strength: 2 })} />
      <Button size="sm" style="outline" label="Reduce jitter" onclick={() => void app.layerAction(sel.n, { kind: 'smoothArea', box: f.area!, strength: 3 })} />
    {/if}
    <Button size="sm" style="ghost" icon="i-solar:undo-left-round-linear" title={app.canUndo ? `Undo: ${app.undoLabel}` : 'Nothing to undo'} aria-label="Undo" disabled={!app.canUndo} onclick={() => app.undoLast()} />
    <Button size="sm" style="ghost" icon="i-solar:undo-right-round-linear" title={app.canRedo ? `Redo: ${app.actions.undone.at(-1)?.summary}` : 'Nothing to redo'} aria-label="Redo" disabled={!app.canRedo} onclick={() => app.redoLast()} />
    <span class="w-px h-5 bg-paper-edge mx-1.5"></span>
    <Toggle options={views} value={f.view} label="View" class="seg" onchange={(v) => { f.setView(v as 'all' | 'only' | 'exploded' | 'cut'); app.save(); }} />
    <span class="w-px h-5 bg-paper-edge mx-1.5"></span>
    <label class="flex items-center gap-1.5 meta" title="Blocky (1) to fine (5): how closely the selected layer follows the photo">Blocky<input type="range" min="1" max="5" step="1" bind:value={detail} class="w-20 text-accent" aria-label="Detail, blocky to fine" onchange={sendTune} />Fine</label>
    <label class="flex items-center gap-1.5 meta ml-2" title="Thinner (-3) to bolder (+3)">Weight<input type="number" min="-3" max="3" step="1" bind:value={weight} class="w-12 rounded-sm border border-paper-edge bg-paper px-1 py-0.5 text-ui text-ink" aria-label="Weight, thinner to bolder" onchange={sendTune} /></label>
  </div>
{/snippet}
{#snippet layerActions()}
  <!-- floats by the selected layer's row: the actions for that layer only -->
  <div role="toolbar" aria-label="Layer actions" class="flex items-center justify-end gap-0.5 border-t border-paper-edge px-1 py-0.5" data-layer-actions>
    <Button size="sm" style="ghost" icon="i-solar:eye-scan-linear" title="Show only this layer" aria-label="Show only this layer" onclick={() => void app.layerAction(sel.n, { kind: 'only' })} />
    <Button size="sm" style="ghost" icon={f.isLayerVisible(sel.n) ? 'i-solar:eye-closed-linear' : 'i-solar:eye-linear'} title={f.isLayerVisible(sel.n) ? 'Hide this layer' : 'Show this layer'} aria-label={f.isLayerVisible(sel.n) ? 'Hide' : 'Show'} onclick={() => void app.layerAction(sel.n, { kind: f.isLayerVisible(sel.n) ? 'hide' : 'show' })} />
    <Button size="sm" style="ghost" icon="i-solar:reply-linear" title="Quote this layer in the chat" aria-label="Quote this layer in the chat" onclick={() => app.quoteLayer(sel.n)} />
    <Button size="sm" style="ghost" icon="i-solar:copy-linear" title="Duplicate this layer" aria-label="Duplicate this layer" onclick={() => void app.layerAction(sel.n, { kind: 'duplicate' })} />
    <Button size="sm" style={merging ? 'default' : 'ghost'} icon="i-solar:layers-minimalistic-linear" title="Merge with another layer" aria-label="Merge with…" aria-expanded={merging} disabled={f.layers.length < 2} onclick={() => (merging = !merging)} />
    <Button size="sm" style="ghost" icon="i-solar:scissors-linear" title={app.canSplit(sel.n) ? 'Split into its pieces' : 'One piece — nothing to split'} aria-label="Split" disabled={!app.canSplit(sel.n)} onclick={() => void app.layerAction(sel.n, { kind: 'split' })} />
    <Button size="sm" style="ghost" icon="i-solar:trash-bin-minimalistic-linear" title="Delete this layer" aria-label="Delete this layer" disabled={f.layers.length < 2} onclick={() => void app.layerAction(sel.n, { kind: 'remove' })} />
    <Button size="sm" style="ghost" icon="i-solar:checklist-minimalistic-linear" title="Add this sheet to the cut queue" aria-label="Add to the cut queue" onclick={() => app.queueSheets([sel.n])} />
  </div>
  {#if merging}
    <div role="menu" aria-label="Merge with" class="absolute right-1 top-full mt-1 z-20 w-56 rounded-md border border-paper-edge bg-paper p-1 shadow-lg">
      <p class="meta px-2 py-1">Merge {sel.name} with…</p>
      {#each f.layers.filter((l) => l.n !== sel.n) as l (l.n)}
        <button type="button" role="menuitem" class="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui text-ink hover:bg-paper-soft" onclick={() => { merging = false; void app.layerAction(sel.n, { kind: 'mergeWith', other: l.n }); }}><LayerSwatch colour={l.colour} size="sm" />{l.name}</button>
      {/each}
    </div>
  {/if}
{/snippet}
{#snippet aside()}
  {#if f.layers.length && f.items.length === 1}
    <section aria-label="How it is built" class="flex flex-col gap-1.5 pb-2 hair-b">
      <span class="eyebrow">How it’s built</span>
      <Toggle options={builds} value={f.build} label="How it is built" class="seg" onchange={(v) => app.setBuild(v as 'stacked' | 'inlay' | 'engrave')} />
      <p class="meta leading-snug">{buildHint[f.build]}</p>
    </section>
  {/if}
  {#if f.layers.length && f.pieceSize}
    <section aria-label="Real size" class="flex flex-col gap-1.5 pb-2 hair-b">
      <span class="eyebrow">Real size</span>
      <div class="flex items-center gap-2 text-ui">
        <label class="flex items-center gap-1.5"><span class="meta">W</span><input type="number" min="10" step="1" value={f.pieceSize.wMm} class="w-18 rounded-sm border border-paper-edge bg-paper px-1.5 py-0.5 text-ui text-ink" aria-label="Width in mm" onchange={(e) => app.setSize(Number(e.currentTarget.value), 'w')} /></label>
        <span class="meta">×</span>
        <label class="flex items-center gap-1.5"><span class="meta">H</span><input type="number" min="10" step="1" value={f.pieceSize.hMm} class="w-18 rounded-sm border border-paper-edge bg-paper px-1.5 py-0.5 text-ui text-ink" aria-label="Height in mm" onchange={(e) => app.setSize(Number(e.currentTarget.value), 'h')} /></label>
        <span class="meta">mm</span>
      </div>
      <p class="meta leading-snug">{f.sizeBasis ? `Muse’s estimate: ${f.sizeBasis}.` : 'A photo has no scale — set the size you want.'} Proportions stay as in your photo.</p>
    </section>
  {/if}
  <span class="eyebrow">{f.items.length > 1 ? `${f.items.length} items` : 'Layers'} · {copy.layers.order}</span>
  {#if !f.layers.length}
    <p class="text-ui text-ink-mute">{app.working ? `${app.working}…` : 'No layers yet — say “remove the background” in the chat to try again.'}</p>
    <div class="flex flex-col gap-2" aria-hidden="true">{#each [0, 1, 2] as i (i)}<span class="h-11 rounded-md bg-paper-mute {app.working ? 'animate-pulse' : 'opacity-50'}"></span>{/each}</div>
  {/if}
  {#each listed as item (item.name)}
    <section aria-label={`Item: ${item.name}`} class="flex flex-col gap-1">
      {#if f.items.length > 1}{@const z = f.itemSize(item.name)}{@const g = groupOf[item.name]}<p class="text-ui text-ink font-medium truncate">{item.name}<span class="meta ml-1.5">{item.layers.length} layer{item.layers.length === 1 ? '' : 's'}{z ? ` · ${z.wMm} × ${z.hMm} mm` : ''}</span></p>
        {#if g}<p class="meta text-accent truncate" data-item-group={g.name}>{g.name} · {g.kind === 'pair' ? `with ${g.with[0]}` : `a set of ${g.with.length + 1}`}</p>{/if}
        {#if hidden.includes(item.name)}<p class="meta text-warning-ink">Partly hidden by a neighbour in the photo — say “complete the hidden edges of the {item.name}”</p>{/if}{/if}
      <ul aria-label={f.items.length > 1 ? `${item.name} layers` : 'Layer stack, back to front'} class="flex flex-col gap-1.5">
        {#each item.layers as l (l.n)}
          {@const o = f.overlayForLayer(l.n)}
          <li class="relative rounded-md border {l.n === sel.n ? 'border-accent bg-paper shadow-sm' : 'border-transparent hover:bg-paper'}" data-layer-row={l.n}>
            <button type="button" class="w-full flex items-center gap-2.5 px-1.5 py-1 text-left" aria-pressed={l.n === sel.n} onclick={() => f.selectLayer(l.n)}>
              <span class="w-9 h-9 shrink-0 rounded-sm overflow-hidden bg-paper-mute {f.isLayerVisible(l.n) ? '' : 'opacity-40'}" aria-hidden="true">{#if app.stageImage && o}<PhotoStage image={app.stageImage} label="" overlays={[{ d: o.d, tone: o.tone, colour: o.colour }]} spotlight />{:else}<span class="grid place-items-center h-full"><LayerSwatch colour={l.colour} /></span>{/if}</span>
              <span class="flex-1 min-w-0"><span class="block text-ui text-ink leading-snug line-clamp-2 {f.isLayerVisible(l.n) ? '' : 'text-ink-soft'}">{l.name}</span><span class="meta whitespace-nowrap">{l.visiblePct}% shows · {l.hiddenPct}% hidden</span></span>
              {#if !f.isLayerVisible(l.n)}<span class="i-solar:eye-closed-linear w-4 h-4 text-ink-soft shrink-0" title="Hidden" aria-label="Hidden"></span>{/if}
            </button>
            {#if l.n === sel.n}{@render layerActions()}{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}
{/snippet}
<svelte:head><title>Katachi · Layers</title></svelte:head>
<StepScreen {aside} label="Items and layers">
  <div class="flex flex-col gap-3 md:h-full">
    {#if f.layers.length}<div class="overflow-x-auto -mx-1 px-1">{@render toolbar()}</div>{/if}
    <figure class="relative m-0 h-[300px] md:h-auto md:flex-1 md:min-h-0 w-full rounded-lg overflow-hidden border border-paper-edge bg-paper-soft" data-work-area>
      {#if app.stageImage}
        {#if f.layers.length && f.view === 'cut'}
          {@const pc = f.pieceFor(sel.n)}
          <div class="h-full p-4 flex flex-col gap-2 items-center"><div class="flex-1 min-h-0 w-full"><CutSheet d={pc.d} colour={sel.colour} aspect={pc.sheetMm[0] / pc.sheetMm[1]} flipped={sel.flipped} label={`Layer ${sel.n}, ${sel.name}: the sheet it is ${f.opFor(sel.n) === 'engrave' ? 'engraved' : 'cut'} from`} /></div>
            <p class="meta">{f.opFor(sel.n) === 'engrave' ? 'Engraved' : 'Cut'} · {pc.sheetMm[0]} × {pc.sheetMm[1]} mm · {f.separateItems ? `its own sheet${pc.turn ? `, turned ${Math.abs(pc.turn)}° upright` : ', upright'}` : sel.n === 1 ? 'the backing: the whole outline' : f.build === 'stacked' ? 'includes the layers in front of it' : 'just its own piece'}</p></div>
        {:else if f.layers.length && f.view === 'exploded'}
          <ExplodedPhoto image={app.stageImage} layers={exploded} selected={sel.n} />
        {:else if f.layers.length}
          <PhotoStage image={app.stageImage} label={stageLabel} overlays={allHidden && f.view !== 'only' ? [] : layerOverlays} subject={many ? itemShapes : f.subjectD} subjectOpacity={many ? 0.6 : 0.3} only={f.view === 'only'} dim={allHidden && f.view !== 'only'} extra={toolPreview} onpointer={pointer} />
        {:else if f.subjectPaths.length && many}
          <!-- separate items: the whole photo while SAM 3.1 outlines them, then their outlines on it -->
          <PhotoStage image={app.stageImage} label={pendingOverlays.length ? 'Your photo, the items found' : 'Your photo, finding the items'} overlays={pendingOverlays} />
        {:else if f.subjectPaths.length}
          <PhotoStage image={app.stageImage} label={stageLabel} overlays={pendingOverlays.length ? pendingOverlays : [{ d: f.subjectD, tone: 'accent' }]} clipped={!pendingOverlays.length} />
        {:else}
          <PhotoStage image={app.stageImage} label={stageLabel} />
        {/if}
      {:else if f.layers.length}<span class="block h-full p-4"><LayeredScene layers={f.layers} mode={f.view === 'exploded' ? 'stack' : 'layer'} selected={sel.n} solid hidden label={f.view === 'exploded' ? 'Exploded stack, back to front' : `Layer ${sel.n}, ${sel.name}: the layer on its own`} /></span>
      {:else}<div class="grid place-items-center h-full text-center p-6"><p class="text-ui text-ink-mute">No photo yet — capture one first.</p></div>{/if}
      {#if app.working}
        <figcaption class="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-paper-edge bg-paper px-3 py-1 text-ui text-ink shadow-sm" aria-live="polite"><span class="i-solar:refresh-linear animate-spin w-3.5 h-3.5 text-accent" aria-hidden="true"></span>{app.working}</figcaption>
      {/if}
    </figure>
    {#if allHidden && f.view !== 'only'}<p class="meta text-center">Every layer is hidden — show one to see it on your photo.</p>{/if}
  </div>
</StepScreen>
