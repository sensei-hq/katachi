<script lang="ts">
import { resolve } from '$app/paths';
import { useApp } from '$lib/state/context';
import ActionCard from '$lib/components/gallery/ActionCard.svelte';
const app = useApp();
app.setScreen('Actions', 'Every edit, what it does, and what to say');
$effect(() => { void app.gallery.load(); });
</script>
<svelte:head><title>Katachi · Actions</title></svelte:head>
<div class="stage md:max-w-[1080px] gap-6 p-4">
  <p class="text-ui text-ink-mute">Demos and example asks work anywhere. <a class="underline" href={resolve('/chains')}>Chains</a> run several as one step.</p>
  {#each app.gallery.groups as g (g.id)}
    <section aria-label={g.label}>
      <h2 class="text-ui font-medium">{g.label}</h2>
      <p class="text-ui text-ink-mute mb-3">{g.blurb}</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each g.actions as a (a.id)}<ActionCard def={a} demo={app.gallery.demos[a.id]} />{/each}
      </div>
    </section>
  {/each}
</div>
