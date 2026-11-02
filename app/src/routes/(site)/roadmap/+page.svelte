<script lang="ts">
import SiteShell from '$lib/components/site/SiteShell.svelte';
import { reveal } from '$lib/components/site/reveal';
import { roadmap, status } from '$lib/content/site';
// Roadmap (public): where Katachi stands and what comes next.
</script>
<svelte:head><title>Katachi · Roadmap</title></svelte:head>
<SiteShell>
  <div class="py-10 md:py-14 flex flex-col gap-12">
    <header use:reveal><p class="eyebrow">Roadmap</p><h1 class="font-heading text-display font-normal tracking-display mt-2">From prototype to maker’s tool</h1><p class="mt-3 text-lede text-ink-mute max-w-[60ch]">Katachi is a hackathon prototype: the hard part, seeing what to cut, works. This is what comes next.</p></header>
    <section aria-label="Where it stands" class="grid gap-4 md:grid-cols-2">
      <div use:reveal class="rounded-lg border border-paper-edge bg-paper-soft p-5"><h2 class="panel-title text-success">Works today</h2><ul class="mt-3 list-disc pl-5 flex flex-col gap-2 text-ink-mute">{#each status.works as w (w)}<li>{w}</li>{/each}</ul></div>
      <div use:reveal={100} class="rounded-lg border border-paper-edge bg-paper-soft p-5"><h2 class="panel-title text-warning-ink">Not there yet</h2><ul class="mt-3 list-disc pl-5 flex flex-col gap-2 text-ink-mute">{#each status.gaps as g (g)}<li>{g}</li>{/each}</ul></div>
    </section>
    <ol class="relative flex flex-col gap-10 border-l border-paper-edge pl-6">
      {#each roadmap as r, i (r.when)}
        <li use:reveal={i * 80} class="relative">
          <span class="absolute -left-[31px] top-2 w-3 h-3 rounded-full {i === 0 ? 'bg-accent' : 'bg-paper-edge'}" aria-hidden="true"></span>
          <h2 class="section-title {i === 0 ? 'text-accent' : ''}">{r.when}</h2><p class="meta">{r.span}</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">{#each r.items as it (it.title)}<div class="rounded-lg border border-paper-edge bg-paper-soft p-4"><h3 class="font-heading text-lede">{it.title}</h3><p class="mt-1 text-ui text-ink-mute">{it.body}</p></div>{/each}</div>
        </li>
      {/each}
    </ol>
  </div>
</SiteShell>
