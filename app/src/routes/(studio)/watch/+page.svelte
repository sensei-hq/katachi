<script lang="ts">
import { onMount } from 'svelte';
import { Button, Card, List, Message, ProgressBar } from '@rokkit/ui';
import { useApp } from '$lib/state/context';
import WatchFeed from '$lib/components/illustrations/WatchFeed.svelte';
import LayeredScene from '$lib/components/illustrations/LayeredScene.svelte';
import CutSheet from '$lib/components/CutSheet.svelte';
import CutPreview from '$lib/components/CutPreview.svelte';
// Burn Watch: the craft's cuts as a list, like Sheets: each cut's status, Send (the next sheet) or Watch, and
// Download .zip. The stage shows the selected cut's clip, alerts and events. No craft open: the demo clip.
const app = useApp();
const watch = app.watch;
const f = app.layers;
const craft = $derived(app.project && app.project.reached >= 0 ? app.project : null);
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const tone = (e: { kind: string; note: string }) => /flare/i.test(e.kind + e.note) ? 'bg-danger' : /smoke/i.test(e.kind + e.note) ? 'bg-warning' : 'bg-success';
const items = $derived(watch.events.map(e => ({ label: e.note, value: String(e.atSec), at: clock(e.atSec), tone: tone(e) })));
const onStage = $derived(craft && watch.sheet != null ? f.layers.find((l) => l.n === watch.sheet) ?? null : null);
const cutText = (n: number) => {
  const s = f.sheetStatus(n);
  if (s === 'cut') return 'cut';
  if (s === 'current') return f.job.phase === 'cutting' ? `cutting ${f.job.progress}%` : f.job.phase === 'verify' ? 'check it' : 'next';
  return 'waiting';
};
// the virtual run on the bed for the cut on stage: the current one moves with the job, done ones show the piece
const stagePhase = (n: number) => { const st = f.sheetStatus(n); return st === 'cut' ? 'done' : st === 'current' ? (f.job.phase === 'done' ? 'done' : f.job.phase) : 'feed'; };
const watchText = (n: number) => { const a = watch.alertsOn(n); return a == null ? '' : a === 0 ? 'clean' : `${a} alert${a > 1 ? 's' : ''}`; };
$effect(() => app.setScreen('Burn Watch', craft ? `${app.title} · ${f.layers.length} cuts · ${f.currentDevice.label}` : `demo clip · ${clock(watch.clipSec)}`));
onMount(() => { if (!craft) void watch.load(); });
</script>
<svelte:head><title>Katachi · Burn Watch</title></svelte:head>
<div class="mx-auto w-full max-w-[1180px] px-4 py-4 md:px-6 md:py-6 grid gap-4 {craft ? 'md:grid-cols-[360px_minmax(0,1fr)]' : ''}">
  {#if craft}
    <section aria-label="Cuts" class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <div><p class="eyebrow">{f.layers.length} cuts · {f.currentDevice.label}</p><p class="text-ui text-ink-mute mt-0.5">Send the next sheet, or watch any cut.</p></div>
        <Button size="sm" style="outline" icon="i-solar:download-linear" label="Download .zip" onclick={() => app.exportSheets()} />
      </div>
      <ul class="flex flex-col gap-2">
        {#each f.layers as l (l.n)}
          {@const status = f.sheetStatus(l.n)}
          <li aria-label={`Cut ${pad(l.n)}, ${l.name}`} class="flex items-center gap-3 rounded-lg border bg-paper-soft p-2.5 {watch.sheet === l.n ? 'border-accent' : 'border-paper-edge'}">
            <button type="button" class="w-12 h-12 shrink-0 rounded-md bg-paper border border-paper-edge p-1 cursor-pointer" aria-label={`Show cut ${pad(l.n)}`} onclick={() => watch.showSheet(l.n)}>{#if f.cutPathFor(l.n)}<CutSheet d={f.cutPathFor(l.n)} colour={l.colour} image={app.stageImage} label="" small />{:else}<LayeredScene layers={f.layers} mode="layer" selected={l.n} hidden={false} label="" />{/if}</button>
            <span class="flex-1 min-w-0">
              <span class="block text-body text-ink truncate">{pad(l.n)} · {l.name}</span>
              <span class="flex flex-wrap gap-x-2 meta"><span class={status === 'cut' ? 'text-success' : status === 'current' ? 'text-accent' : ''}>{cutText(l.n)}</span>{#if watchText(l.n)}<span class={watch.alertsOn(l.n) ? 'text-danger' : 'text-success'}>· {watchText(l.n)}</span>{/if}</span>
              {#if status === 'current' && f.job.phase === 'cutting'}<ProgressBar value={f.job.progress} max={100} />{/if}
            </span>
            {#if status === 'current' && f.job.phase === 'feed'}
              <Button size="sm" variant="primary" icon="i-solar:play-linear" label={f.currentDevice.cta} onclick={() => app.watchCut(l.n)} />
            {:else if status === 'current' && f.job.phase === 'verify'}
              <Button size="sm" variant="primary" label="Looks good" onclick={() => f.confirmCut()} />
            {:else}
              <Button size="sm" style="outline" icon="i-solar:eye-linear" label="Watch" disabled={status === 'waiting'} onclick={() => app.watchCut(l.n)} />
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section aria-label="Watch stage" class="flex flex-col gap-3 min-w-0">
    {#if craft && !onStage}
      <div class="rounded-lg border border-dashed border-paper-edge p-8 text-center flex flex-col items-center gap-2">
        <span class="i-solar:eye-linear text-head text-ink-soft" aria-hidden="true"></span>
        <p class="text-body">Send the next sheet and Katachi watches the cut.</p>
        <p class="text-ui text-ink-mute">Prop your phone up facing the bed. Spark and SAM 3.1 flag flare-ups, heavy smoke or a shifted sheet.</p>
      </div>
    {:else}
      {#if onStage}<h2 class="font-heading text-title font-normal">Cut {pad(onStage.n)} · {onStage.name}</h2>{/if}
      {#if watch.showAlert && watch.alert}
        <Message type="error" text={`${watch.alert.note} · ${clock(watch.alert.atSec)} — pause and check the air assist.`} />
      {/if}
      <div class="relative rounded-lg overflow-hidden min-h-57 {onStage ? 'bg-camera grid place-items-center p-6' : ''}" data-mode="dark">
        {#if onStage}
          <!-- the cut's sheet on the bed with the SAM tracking outline (the live view replaces this with the camera) -->
          <span class="relative w-[min(70%,320px)] aspect-square rounded-md outline-2 outline-dashed outline-accent outline-offset-4">{#if f.previewFor(onStage.n).cut}{@const pv = f.previewFor(onStage.n)}<CutPreview cut={pv.cut} engrave={pv.engrave} colour={pv.colour} mode={pv.mode} phase={stagePhase(onStage.n)} progress={f.job.progress} image={app.stageImage} label={`Sheet ${pad(onStage.n)} on the bed: a virtual run of the cut`} />{:else}<LayeredScene layers={f.layers} mode="layer" selected={onStage.n} hidden={false} label={`Sheet ${pad(onStage.n)} on the bed`} />{/if}</span>
        {:else}<WatchFeed />{/if}
        <span class="meta absolute left-3 top-3 text-ink">Workpiece · tracked</span>
        <span class="meta absolute right-3 bottom-3 text-ink">SAM 3.1 + Spark · {clock(watch.selected?.atSec ?? watch.positionSec)} · {watch.selected?.note ?? ''}</span>
      </div>
      <div>
        <div class="relative h-1 rounded-full bg-paper-mute">
          {#each items as e (e.value)}<span class="absolute w-3 h-3 rounded-full -top-1 {e.tone}" style="left:{(Number(e.value) / watch.clipSec) * 100}%"></span>{/each}
        </div>
        <p class="meta flex justify-between mt-2"><span>0:00</span><span>{clock(watch.clipSec)}</span></p>
      </div>
      <section aria-label="Event timeline">
        <Card>
          <List {items} value={String(watch.selected?.atSec ?? '')} onselect={(v) => watch.selectEvent(Number(typeof v === 'object' && v ? (v as { value: string }).value : v))}>
            {#snippet itemContent(proxy)}<span class="w-1.5 h-1.5 rounded-full shrink-0 {proxy.get('tone')}"></span><span class="flex-1">{proxy.label}</span><span class="readout">{proxy.get('at')}</span>{/snippet}
          </List>
        </Card>
      </section>
      <div class="flex gap-2.5">
        <Button style="outline" size="lg" class="flex-1" icon="i-solar:refresh-linear" label={`Replay ${watch.alert ? clock(watch.alert.atSec) : '0:42'}`} onclick={() => watch.replay()} />
        <Button size="lg" variant="primary" class="flex-1" icon={watch.checked ? 'i-solar:check-circle-linear' : undefined} label={watch.checked ? 'Checked' : 'I checked it'} onclick={() => watch.acknowledge()} />
      </div>
    {/if}
    <p class="meta text-center">Advisory only — never leave your laser unattended{craft ? '' : ' · open a craft to watch its cuts'}</p>
  </section>
</div>
