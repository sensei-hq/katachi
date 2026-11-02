<script lang="ts">
import SiteShell from '$lib/components/site/SiteShell.svelte';
import { privacy, updated } from '$lib/content/site';
// Privacy policy (public): the hosted hackathon demo, in plain words.
</script>
<svelte:head><title>Katachi · Privacy policy</title></svelte:head>
<SiteShell>
  <article class="py-10 md:py-14 max-w-[70ch]">
    <p class="eyebrow">Katachi demo</p>
    <h1 class="font-heading text-display font-normal tracking-display mt-2">Privacy policy</h1>
    <p class="meta mt-2">Last updated {updated}</p>
    {#each privacy as s (s.title)}<section class="mt-8"><h2 class="panel-title">{s.title}</h2><p class="mt-2 text-ink-mute">{s.body}</p></section>{/each}
  </article>
</SiteShell>
