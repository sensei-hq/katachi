<script lang="ts">
import type { Layer } from '$lib/content/layers';
import LayeredScene from './illustrations/LayeredScene.svelte';
import ExplodedLayers from './illustrations/ExplodedLayers.svelte';
// Landing hero: your picture → Muse models split it into cut layers → the finished, stacked piece.
// Studio: three panels in a row with the models on the arrows. Phones: the same story top to bottom — your picture,
// the models on a down arrow, the exploded stack, the models again, the finished piece.
let { layers }: { layers: Layer[] } = $props();
const see = ['Muse Spark', 'SAM 3.1'];
const make = ['Muse Image', 'Code'];
const caption = 'Muse Spark sees what it is · SAM 3.1 cuts out each region · Muse Image fills what hides behind · code sizes the sheets';
</script>
{#snippet chips(list: string[])}
  <ul class="flex flex-row flex-wrap justify-center md:flex-col gap-1.5 items-center">
    {#each list as c (c)}<li class="meta rounded-full border border-paper-edge bg-paper-soft px-2.5 py-1 text-ink-mute">{c}</li>{/each}
  </ul>
{/snippet}
<figure class="m-0 flex flex-col gap-3">
  <div class="grid grid-cols-[1fr] md:grid-cols-[minmax(0,0.75fr)_auto_minmax(0,1.4fr)_auto_minmax(0,0.75fr)] items-center gap-2 md:gap-3">
    <div class="flex flex-col gap-2 items-center" data-hero-step="picture">
      <div class="w-[52%] md:w-full aspect-square rounded-lg overflow-hidden border border-paper-edge bg-paper-soft"><LayeredScene {layers} mode="original" label="Your picture: layered paper art in a hoop" /></div>
      <span class="eyebrow">Your picture</span>
    </div>
    <div class="flex flex-col items-center gap-2 py-1 md:py-0" data-hero-step="see"><span class="md:hidden i-solar:arrow-down-linear text-title text-ink-soft" aria-hidden="true"></span><span class="lt-md:hidden i-solar:arrow-right-linear text-title text-ink-soft" aria-hidden="true"></span>{@render chips(see)}</div>
    <div class="flex flex-col gap-2 items-center">
      <div class="w-full max-w-[400px] mx-auto"><ExplodedLayers {layers} /></div>
      <span class="eyebrow">{layers.length} cut layers</span>
    </div>
    <div class="flex flex-col items-center gap-2 py-1 md:py-0" data-hero-step="make"><span class="md:hidden i-solar:arrow-down-linear text-title text-ink-soft" aria-hidden="true"></span><span class="lt-md:hidden i-solar:arrow-right-linear text-title text-ink-soft" aria-hidden="true"></span>{@render chips(make)}</div>
    <div class="flex flex-col gap-2 items-center" data-hero-step="finished">
      <div class="w-[52%] md:w-full aspect-square rounded-lg overflow-hidden border border-paper-edge bg-paper-soft"><LayeredScene {layers} mode="full" label="The finished piece, stacked and framed" /></div>
      <span class="eyebrow">Cut &amp; assembled</span>
    </div>
  </div>
  <figcaption class="text-ui text-ink-mute text-center max-w-[60ch] mx-auto">{caption}</figcaption>
</figure>
