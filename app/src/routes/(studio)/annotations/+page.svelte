<script lang="ts">
import { Card, StatusList } from '@rokkit/ui';
import { useApp } from '$lib/state/context';
import { annotate } from '$lib/domain/craft/annotate';
const app = useApp();
app.setScreen('Annotations', 'checks on the open project before cutting');
// the craft's own checks; older layers without a craft still report what shows nothing
const notes = $derived.by(() => {
  const rows = annotate(app.craft.doc);
  if (rows.length) return rows;
  const layers = app.layers.layers;
  if (!layers.length) return [];
  return [
    { text: `${layers.length} layer${layers.length === 1 ? '' : 's'}`, status: 'info' as const },
    ...layers.filter((l) => Math.round(l.visiblePct) <= 0).map((l) => ({ text: `“${l.name}” shows nothing to cut`, status: 'warn' as const }))
  ];
});
const empty = $derived(!app.craft.doc.items.length && !app.layers.layers.length);
</script>
<svelte:head><title>Katachi · Annotations</title></svelte:head>
<div class="stage gap-4 p-4">
  {#if empty}
    <p class="text-ui text-ink-mute">Open a craft to see its checks — outlines, names, board fit and small parts.</p>
  {:else}
    <section aria-label="Annotations"><Card><StatusList items={notes} /></Card></section>
  {/if}
</div>
