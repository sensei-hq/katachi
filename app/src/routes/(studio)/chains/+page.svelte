<script lang="ts">
import { useApp } from '$lib/state/context';
import ChainBuilder from '$lib/components/gallery/ChainBuilder.svelte';
import ChainCard from '$lib/components/gallery/ChainCard.svelte';
const app = useApp();
app.setScreen('Chains', 'Several actions as one undoable step');
$effect(() => { void app.gallery.load(); });
</script>
<svelte:head><title>Katachi · Chains</title></svelte:head>
<div class="stage md:max-w-[1080px] gap-6 p-4">
  {#if !app.gallery.canRun}
    <p class="text-ui text-ink-mute">Run a chain on the open craft, or say its name in the chat.</p>
  {/if}
  <section aria-label="Chains">
    <h2 class="text-ui font-medium">Chains</h2>
    <p class="text-ui text-ink-mute mb-3">Run here, or say the name in the chat.</p>
    <div class="grid gap-3 md:grid-cols-2">
      {#each app.gallery.chainList as c (c.id)}<ChainCard gallery={app.gallery} chain={c} />{/each}
      <ChainBuilder gallery={app.gallery} />
    </div>
  </section>
</div>
