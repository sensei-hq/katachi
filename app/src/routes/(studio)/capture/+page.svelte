<script lang="ts">
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Button, Toggle } from '@rokkit/ui';
import CameraView from '$lib/components/capture/CameraView.svelte';
import MediaStage from '$lib/components/capture/MediaStage.svelte';
import SlotStrip from '$lib/components/capture/SlotStrip.svelte';
import SketchPad from '$lib/components/capture/SketchPad.svelte';
import JourneyStrip from '$lib/components/JourneyStrip.svelte';
import { journeyStrip } from '$lib/content/journey';
import { captureModes, captureSources, demoFrame } from '$lib/content/capture';
import { useApp } from '$lib/state/context';
// The first step of a project: one shot, or six sides of an object, from the camera or uploads.
const app = useApp();
const c = $derived(app.capture);
$effect(() => app.setScreen(app.project?.name || 'New craft', c.mode === 'single' ? 'capture · snap, upload or sketch' : 'capture · 3D object, 6 sides'));
let camera = $state<{ grab: () => string | null } | null>(null);
let pad = $state<{ grab: () => string | null; clear: () => void } | null>(null);
let inked = $state(false);
const strip = journeyStrip('/capture');
let files = $state<HTMLInputElement | null>(null);
let firstName = $state<string | undefined>(app.fileName);

function useSketch() { const url = pad?.grab(); if (!url) return; c.capture(url, 'sketch'); pad?.clear(); announce(); }
function shoot() { const side = c.current?.label ?? 'photo'; c.capture(camera?.grab() ?? demoFrame(side.toLowerCase()), 'camera'); announce(); }
async function readAll(list: FileList | null) { firstName ??= list?.[0]?.name; await c.uploadFiles([...(list ?? [])]); announce(); }
function announce() {
  if (!c.done) return;
  app.flow.conversation.say(c.mode === 'single' ? (c.source === 'sketch' ? 'Nice sketch. Analyze it and I’ll find the shapes and turn them into layers.' : 'Got the photo. Analyze it and I’ll remove the background, find the items and split each into layers.') : `${c.media.length} views in. Analyze them and I’ll work out which side each shows, then unfold it into flat parts.`);
}
async function useThese() {
  await app.startFromCaptureMedia(firstName);
  await goto(resolve(app.resumePath as '/workshop'));
}
</script>
<svelte:head><title>Katachi · Capture</title></svelte:head>
<input bind:this={files} type="file" accept="image/*" multiple class="hidden" aria-label="Upload images" onchange={(e) => void readAll(e.currentTarget.files)} />
{#if strip}<div class="md:hidden"><JourneyStrip step={strip} /></div>{/if}
<!-- fits the viewport: controls · the stage (fills) · shutter / continue · the captured slots as a footer -->
<div class="mx-auto w-full max-w-[480px] md:max-w-[960px] h-[calc(100dvh-9.5rem)] md:h-full p-4 md:p-6 flex flex-col gap-3">
  <div class="flex flex-wrap items-center gap-2">
    <Toggle options={captureModes} value={c.mode} showLabels label="Shots" onchange={(v) => c.setMode(v as 'single' | 'multi')} />
    <Toggle options={captureSources} value={c.source} showLabels label="Source" onchange={(v) => c.setSource(v as 'camera' | 'upload' | 'sketch')} />
    <span class="flex-1"></span>
    <Button style={c.showGrid ? 'default' : 'ghost'} variant={c.showGrid ? 'primary' : 'default'} size="sm" icon="i-solar:hashtag-square-linear" aria-label="Toggle 3×3 grid" aria-pressed={c.showGrid} onclick={() => c.toggleGrid()} />
  </div>
  <div class="flex-1 min-h-0">
    <MediaStage url={c.shown?.url ?? ''} alt={c.shown ? `${c.shown.label} view` : ''} prompt={c.viewing ? `${c.viewing.label} · tap Retake to shoot again` : c.source === 'sketch' && !c.done ? '' : c.prompt} showGrid={c.showGrid}>
      {#if c.source === 'camera'}<CameraView bind:this={camera} />
      {:else if c.source === 'sketch' && !c.done}<SketchPad bind:this={pad} onDrawn={(v) => (inked = v)} />
      {:else if !c.done}<div class="absolute inset-0 grid place-items-center"><Button size="lg" icon="i-solar:gallery-linear" label={c.mode === 'single' ? 'Choose a photo' : 'Choose images'} onclick={() => files?.click()} /></div>{/if}
    </MediaStage>
  </div>
  <div class="shrink-0 flex items-center justify-center gap-6 min-h-16">
    {#if c.source === 'sketch' && !c.done}
      <Button size="lg" style="outline" icon="i-solar:check-circle-linear" label={c.mode === 'single' ? 'Use this sketch' : `Use as ${c.current?.label.toLowerCase() ?? 'view'}`} disabled={!inked} onclick={useSketch} />
    {/if}
    {#if c.source === 'camera' && c.current}
      <button type="button" aria-label="Take photo" class="w-16 h-16 grid place-items-center rounded-full ring-3 ring-ink" onclick={shoot}><span class="w-12 h-12 rounded-full bg-ink"></span></button>
    {/if}
    {#if c.media.length}<Button variant="primary" size="lg" disabled={!c.done} icon="i-solar:magic-stick-2-linear" label={c.mode === 'single' ? (app.project?.kind === 'ref' ? 'Continue' : 'Analyze') : `Analyze ${c.media.length} views`} onclick={() => void useThese()} />{/if}
  </div>
  <footer class="shrink-0 hair-t pt-2">
    <SlotStrip slots={c.slots} selected={c.viewingId} currentId={c.current?.id ?? null} onSelect={(id) => c.view(c.slots.find((s) => s.id === id)?.url ? id : null)} onRetake={(id) => c.retake(id)} />
  </footer>
</div>
