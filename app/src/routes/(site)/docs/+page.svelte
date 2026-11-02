<script lang="ts">
import SiteShell from '$lib/components/site/SiteShell.svelte';
import { reveal } from '$lib/components/site/reveal';
import { actionGroups, docs } from '$lib/content/site';
// Docs (public): using Katachi, step by step, and what to say in the chat.
</script>
<svelte:head><title>Katachi · Docs</title></svelte:head>
<SiteShell>
  <div class="py-10 md:py-14 grid gap-10 md:grid-cols-[200px_minmax(0,1fr)]">
    <nav aria-label="On this page" class="lt-md:hidden sticky top-20 self-start flex flex-col gap-1.5">
      <p class="eyebrow mb-1">On this page</p>
      {#each docs as d (d.id)}<a href={`#${d.id}`} class="text-ui text-ink-mute hover:text-ink">{d.title}</a>{/each}
    </nav>
    <article class="flex flex-col gap-10">
      <header use:reveal><p class="eyebrow">Docs</p><h1 class="font-heading text-display font-normal tracking-display mt-2">Using Katachi</h1><p class="mt-3 text-lede text-ink-mute">From a photo to cut files, one step at a time. Every step can be undone.</p></header>
      {#each docs as d (d.id)}
        <section id={d.id} use:reveal class="scroll-mt-20"><h2 class="section-title">{d.title}</h2>{#each d.body as p (p)}<p class="mt-3 text-ink-mute max-w-[68ch]">{p}</p>{/each}</section>
      {/each}
      <section use:reveal aria-label="Actions"><h2 class="section-title">Every action</h2><p class="mt-3 text-ink-mute">The chat and the buttons call the same actions.</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">{#each actionGroups as g (g.title)}<div class="rounded-lg border border-paper-edge bg-paper-soft p-4 flex gap-3"><span class="{g.icon} text-accent text-2xl shrink-0" aria-hidden="true"></span><div><h3 class="font-heading text-lede">{g.title}</h3><p class="text-ui text-ink-mute">{g.list}</p></div></div>{/each}</div>
      </section>
    </article>
  </div>
</SiteShell>
