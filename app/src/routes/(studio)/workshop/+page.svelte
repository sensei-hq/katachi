<script lang="ts">
import { resolve } from '$app/paths';
import { goto } from '$app/navigation';
import { Button, Toggle } from '@rokkit/ui';
import CraftCard from '$lib/components/craft/CraftCard.svelte';
import { layerSets } from '$lib/content/layers';
import { useApp } from '$lib/state/context';
// Home (docs/design/11): start a craft with a picture — Upload or Camera (or sketch it) — and your crafts below.
// Katachi works out what it is (layered art, flat pieces, a 3D object) from the picture; the chat does the rest.
const app = useApp();
$effect(() => app.setScreen('Home', 'start a craft or pick one up'));
const go = (path: string) => void goto(resolve(path as '/workshop'));
let files = $state<HTMLInputElement | null>(null);
let kitFile = $state<HTMLInputElement | null>(null);
// a maker's own kit file (SVG): exact pieces, straight to Cut
async function importKit(list: FileList | null) { const file = list?.[0]; if (!file) return; const to = await app.importKitFile(file); if (to) go(to); }
// Upload: pick the pictures, then Capture shows them (one, or several views of an object) ready to Analyze
async function upload(list: FileList | null) {
  if (!list?.length) return;
  // a picture can be anything (layered art, separate pieces, a 3D object): the chat does not guess before Analyze
  const n = list.length;
  app.startCraft('flat', { say: n > 1 ? `${n} pictures in. Press Analyze: I’ll work out what they show — one object from several sides (and any cut plan among them), or separate crafts.` : 'Your picture is in. Press Analyze: I’ll work out what it is — layered art, separate pieces or a 3D object — and break it down.' });
  await app.capture.uploadFiles([...list]);
  app.fileName = list[0]?.name;
  go('/capture');
}
const camera = () => { app.startCraft('flat', { say: 'Take one picture, or several from different sides of an object. Then press Analyze and I’ll work out what it is.' }); app.capture.setSource('camera'); go('/capture'); };
const sketch = () => go(app.startCraft('sketch'));
type Filter = 'all' | 'draft' | 'finished';
let filter = $state<Filter>('all');
const filters = [{ label: 'All', value: 'all' }, { label: 'In progress', value: 'draft' }, { label: 'Finished', value: 'finished' }];
const shown = $derived(app.projects.filter((p) => filter === 'all' || (filter === 'finished') === (p.status === 'finished')));
const openCraft = (id: string) => { app.open(id); go(app.resumePath); };
const ago = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const sample = layerSets.paper.layers;
</script>
<svelte:head><title>Katachi · Home</title></svelte:head>
<input bind:this={files} type="file" accept="image/*" multiple class="hidden" aria-label="Upload pictures" onchange={(e) => void upload(e.currentTarget.files)} />
<input bind:this={kitFile} type="file" accept=".svg,image/svg+xml" class="hidden" aria-label="Import a kit file (SVG)" onchange={(e) => void importKit(e.currentTarget.files)} />
<div class="mx-auto w-full max-w-[1180px] px-4 py-5 md:px-8 md:py-8 flex flex-col gap-8">
  <section aria-label="Start a craft" class="flex flex-col gap-4">
    <div><p class="eyebrow">New craft</p><h2 class="font-heading text-title md:text-head font-normal tracking-display mt-1">What are we making today?</h2>
      <p class="text-ui text-ink-mute mt-1">One picture of layered art or flat pieces — or several views of an object. Katachi works out the rest.</p></div>
    <div class="grid grid-cols-2 gap-3 md:gap-4 md:max-w-[720px]">
      <button type="button" class="group relative aspect-[4/3] md:aspect-[16/9] rounded-lg border border-paper-edge bg-paper-soft grid-bed grid place-items-center cursor-pointer hover:border-accent transition-colors" onclick={() => files?.click()} data-start="upload">
        <span class="flex flex-col items-center gap-2"><span class="i-solar:upload-linear text-head text-accent" aria-hidden="true"></span><span class="text-body text-ink font-medium">Upload</span><span class="meta">a photo, artwork or several views</span></span>
      </button>
      <button type="button" class="group relative aspect-[4/3] md:aspect-[16/9] rounded-lg border border-paper-edge bg-paper-soft grid-bed grid place-items-center cursor-pointer hover:border-accent transition-colors" onclick={camera} data-start="camera">
        <span class="flex flex-col items-center gap-2"><span class="i-solar:camera-linear text-head text-accent" aria-hidden="true"></span><span class="text-body text-ink font-medium">Camera</span><span class="meta">snap it now</span></span>
      </button>
    </div>
    <p class="text-ui text-ink-mute">or <button type="button" class="text-accent underline-offset-2 hover:underline cursor-pointer" onclick={sketch}>sketch it</button> · <button type="button" class="text-accent underline-offset-2 hover:underline cursor-pointer" onclick={() => kitFile?.click()}>import a kit file (SVG)</button> · or tell Katachi in the chat</p>
  </section>

  <section aria-label="Your crafts" class="flex flex-col gap-3">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><p class="eyebrow">Your crafts</p><h2 class="panel-title mt-1">{app.projects.length ? `${app.projects.length} saved` : 'Nothing here yet'}</h2></div>
      {#if app.projects.length}<Toggle options={filters} value={filter} showLabels label="Show" onchange={(v) => (filter = v as Filter)} />{/if}
    </div>
    {#if shown.length}
      <div class="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {#each shown as p (p.id)}
          {@const pr = app.progressOf(p)}
          <CraftCard name={p.name} image={p.image} progress={pr} finished={pr.finished} example={p.example} updated={ago(p.updatedAt)} fallback={sample}
            onOpen={() => openCraft(p.id)} onDelete={() => app.removeCraft(p.id)} />
        {/each}
      </div>
    {:else}
      <div class="rounded-lg border border-dashed border-paper-edge p-5 flex flex-col md:flex-row gap-4 md:items-center">
        <p class="flex-1 text-ui text-ink-mute">{app.projects.length ? 'Nothing matches this filter.' : 'Crafts you start are saved as you go and show up here — each with its own chat. Open the example to see a finished one.'}</p>
        {#if !app.projects.some((p) => p.example)}<Button style="outline" label="Open the example" onclick={() => { app.openExample(); go(app.resumePath); }} />{/if}
      </div>
    {/if}
  </section>
</div>
