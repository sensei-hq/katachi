<script lang="ts">
import { Button, Card } from '@rokkit/ui';
import { useApp } from '$lib/state/context';
import { money, totalsOf, type UsageTotals } from '$lib/state/usage.svelte';
// Under the hood: what every Meta model call cost — for the open craft and for all your crafts — by model, and
// the calls themselves. Kept in this browser for your invite code, so it survives reloads.
const app = useApp();
$effect(() => app.setScreen('Under the hood', 'every model call, its cost and time'));
const craftId = $derived(app.project && app.project.reached >= 0 ? app.project.id : null);
const craft = $derived(craftId ? app.usage.totals(craftId) : null);
const all = $derived(app.usage.totals());
const byCraft = $derived(app.projects.map((p) => ({ name: p.name, t: totalsOf(app.usage.forCraft(p.id)) })).filter((x) => x.t.calls));
const recent = $derived([...(craftId ? app.usage.forCraft(craftId) : app.usage.entries)].reverse().slice(0, 40));
const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function download() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(app.usage.entries, null, 2)])); a.download = 'katachi-usage.json'; a.click(); }
</script>
{#snippet breakdown(title: string, t: UsageTotals)}
  <Card class="p-4 flex flex-col gap-3">
    <div class="flex items-baseline justify-between gap-3"><h2 class="panel-title">{title}</h2><p class="readout text-ink">{money(t.costUsd)}{#if t.estUsd}<span class="meta"> + est. {money(t.estUsd)} placeholders</span>{/if}</p></div>
    {#if t.calls}
      <table class="w-full text-ui" aria-label={`${title} by model`}>
        <thead><tr class="meta text-left"><th class="font-normal py-1">Model</th><th class="font-normal text-right">Calls</th><th class="font-normal text-right">Time</th><th class="font-normal text-right">Cost</th></tr></thead>
        <tbody>{#each t.byModel as m (m.model)}<tr class="hair-t"><td class="py-1.5">{m.model}</td><td class="text-right readout">{m.calls}</td><td class="text-right readout">{(m.ms / 1000).toFixed(1)} s</td><td class="text-right readout text-ink">{money(m.costUsd)}{#if m.estUsd}<span class="meta block">est. {money(m.estUsd)}</span>{/if}</td></tr>{/each}</tbody>
      </table>
    {:else}<p class="text-ui text-ink-mute">No model calls yet.</p>{/if}
  </Card>
{/snippet}
<svelte:head><title>Katachi · Under the hood</title></svelte:head>
<div role="region" aria-label="Under the hood" class="mx-auto w-full max-w-[1000px] px-4 py-5 md:px-8 md:py-8 flex flex-col gap-5">
  <div class="grid gap-4 md:grid-cols-2">
    {#if craft}{@render breakdown(`This craft · ${app.title}`, craft)}{/if}
    {@render breakdown('All your crafts', all)}
  </div>
  {#if byCraft.length > 1}
    <Card class="p-4"><h2 class="panel-title mb-2">By craft</h2>
      <ul class="flex flex-col">{#each byCraft as c (c.name)}<li class="flex justify-between gap-3 py-1.5 hair-t text-ui"><span class="truncate">{c.name}</span><span class="readout text-ink">{money(c.t.costUsd)} · {c.t.calls} calls</span></li>{/each}</ul>
    </Card>
  {/if}
  <Card class="p-4 flex flex-col gap-2">
    <div class="flex items-center justify-between gap-3"><h2 class="panel-title">{craft ? 'Calls for this craft' : 'Recent calls'}</h2><Button size="sm" style="outline" icon="i-solar:download-linear" label="Export .json" onclick={download} /></div>
    <ul class="flex flex-col" aria-label="Model calls">
      {#each recent as e, i (i)}
        <li class="flex items-center gap-3 py-1.5 hair-t text-ui"><span class="meta w-16 shrink-0">{time(e.at)}</span><span class="w-32 shrink-0 text-ink">{e.model}</span><span class="flex-1 min-w-0 truncate text-ink-mute">{e.action}</span><span class="readout text-right whitespace-nowrap {e.status === 'failed' ? 'text-danger' : ''}">{e.status === 'placeholder' ? 'est. ' : ''}{money(e.costUsd)} · {e.ms} ms</span></li>
      {:else}<li class="text-ui text-ink-mute">No calls yet.</li>{/each}
    </ul>
  </Card>
</div>
