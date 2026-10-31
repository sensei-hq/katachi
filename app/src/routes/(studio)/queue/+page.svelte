<script lang="ts">
import { onMount } from 'svelte';
import { resolve } from '$app/paths';
import { Button } from '@rokkit/ui';
import CutRun from '$lib/components/illustrations/CutRun.svelte';
import CutSheet from '$lib/components/CutSheet.svelte';
import LayerSwatch from '$lib/components/illustrations/LayerSwatch.svelte';
import { useApp } from '$lib/state/context';
// The cut queue (design/12): the machine bed on the left, the queue on the right (scrolls on its own) with the
// guidance and Start at the bottom. Start runs the cutting program for the sheet on the bed — the tool follows the
// path, then the waste falls away and the piece goes to Assemble. One sheet at a time, you load each one.
const app = useApp();
const q = app.queue;
const c = $derived(q.current);
const tp = $derived(c ? q.toolpathOf(c) : null);
const prog = $derived(c ? q.programOf(c) : null);
$effect(() => app.setScreen('Cut queue', q.items.length ? `${q.waiting.length} to cut · ${q.done.length} done` : 'add sheets from a craft'));
onMount(() => q.seen());
const laser = $derived(c?.machine === 'laser');
const status = { waiting: 'next', running: 'cutting', paused: 'paused', weeding: 'clearing', cut: 'cut', done: 'to assembly' } as const;
const pct = $derived(c ? Math.round(c.progress * 100) : 0);
let showProgram = $state(true);
// the program line the tool is on, with a few lines around it
const lineNow = $derived.by(() => { if (!c || !tp || !prog || c.progress <= 0) return -1; const d = c.progress * tp.total; let lo = 0, hi = tp.segs.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tp.segs[m].at <= d) lo = m; else hi = m - 1; } return prog.lineOf[lo]; });
const window = $derived(prog ? (() => { const at = Math.max(0, lineNow); const from = Math.max(0, at - 3); return prog.lines.slice(from, from + 8).map((t, k) => ({ n: from + k + 1, t, now: from + k === lineNow })); })() : []);
function download() {
  if (!c || !prog) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([prog.lines.join('\n') + '\n'], { type: 'text/plain' }));
  a.download = `${c.craftName}-${String(c.layer).padStart(2, '0')}-${c.name}.${c.machine === 'laser' ? 'gcode' : 'txt'}`.replace(/[^\w.-]+/g, '-');
  a.click(); URL.revokeObjectURL(a.href);
}
const speeds = [1, 2, 6];
const verb = $derived(c?.op === 'engrave' ? 'Engraving' : 'Cutting');
</script>
<svelte:head><title>Katachi · Cut queue</title></svelte:head>
<div class="md:h-full grid md:grid-cols-[minmax(0,1fr)_340px] md:min-h-0">
  <section aria-label="On the bed" class="flex flex-col gap-3 p-4 md:p-6 min-w-0 md:overflow-auto">
    {#if c && tp}
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0"><p class="eyebrow">Sheet {q.done.length + 1} of {q.items.length} · {c.craftName} · {laser ? 'laser' : 'blade cutter'}</p><h2 class="font-heading text-head font-normal tracking-display truncate">{c.name}</h2></div>
        <div class="flex items-center gap-2">
          <span class="meta">Speed</span>
          <span class="inline-flex rounded-md border border-paper-edge overflow-hidden" role="group" aria-label="Speed">
            {#each speeds as s (s)}<button type="button" class="px-2.5 py-1 text-ui {q.speed === s ? 'bg-ink text-paper' : 'text-ink-mute'}" aria-pressed={q.speed === s} onclick={() => q.setSpeed(s)}>{s}×</button>{/each}
          </span>
        </div>
      </div>
      <figure class="relative m-0 w-full aspect-[16/10] max-h-[58vh] rounded-lg overflow-hidden border border-paper-edge">
        <CutRun sheetId={c.id} colour={c.colour} shapes={c.shapes} sheetMm={c.sheetMm} {tp} machine={c.machine} phase={c.phase} progress={c.progress} weed={c.weed} label={`${c.name} on the ${laser ? 'laser bed' : 'cutting mat'}: ${status[c.phase]}`} />
        <figcaption class="absolute left-3 top-3 meta rounded-full border border-paper-edge bg-paper px-3 py-1 text-ink" aria-live="polite">
          {c.phase === 'waiting' ? `Ready · load the sheet` : c.phase === 'running' ? `${verb} · ${pct}%` : c.phase === 'paused' ? `Paused · ${pct}%` : c.phase === 'weeding' ? 'Clearing the waste' : 'Cut · goes to Assemble'}
        </figcaption>
      </figure>
      <div class="h-1 rounded-full bg-paper-mute overflow-hidden" aria-hidden="true"><span class="block h-full bg-accent" style:width="{pct}%"></span></div>
      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
        <div class="flex flex-col gap-1.5 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <p class="eyebrow">Cutting program · {laser ? 'G-code (GRBL)' : 'blade moves'}</p>
            <span class="flex gap-1"><Button size="sm" style="ghost" label={showProgram ? 'Hide' : 'Show'} onclick={() => (showProgram = !showProgram)} /><Button size="sm" style="ghost" icon="i-solar:download-linear" label={laser ? '.gcode' : '.txt'} title="Download the cutting program" onclick={download} /></span>
          </div>
          {#if showProgram}
            <pre class="m-0 h-[150px] overflow-hidden rounded-md border border-paper-edge bg-paper-soft px-3 py-2 font-mono text-micro leading-relaxed text-ink-mute" aria-label="The cutting program, current line highlighted" data-program>{#each window as l (l.n)}<span class="block {l.now ? 'bg-paper-mute text-ink' : ''}">{String(l.n).padStart(5, ' ')}  {l.t}</span>{/each}</pre>
          {/if}
        </div>
        <dl class="meta leading-relaxed m-0">
          <div>Sheet {c.sheetMm[0]} × {c.sheetMm[1]} mm</div>
          <div>{tp.shapes} closed shape{tp.shapes === 1 ? '' : 's'}, inner first</div>
          <div>{(tp.cutMm / 1000).toFixed(2)} m of {c.op === 'engrave' ? 'engraving' : 'cut'}</div>
          <div>≈ {Math.max(1, Math.ceil(tp.cutMm / (laser ? 20 : 45) / 60))} min on the {laser ? 'laser' : 'cutter'}</div>
          <div>{prog?.lines.length ?? 0} program lines</div>
        </dl>
      </div>
    {:else}
      <div class="rounded-lg border border-dashed border-paper-edge p-8 flex flex-col items-center gap-3 text-center mt-4">
        <span class="i-solar:checklist-minimalistic-linear text-head text-ink-soft" aria-hidden="true"></span>
        <h2 class="panel-title">{q.items.length ? 'All cut' : 'Nothing in the queue'}</h2>
        <p class="text-ui text-ink-mute max-w-[46ch]">{q.items.length ? 'Every sheet is cut. Put them together in Assemble, or add more sheets.' : 'From a craft’s Layers or Cut step, say “send it to the cut queue”. Then load each sheet here and press Start.'}</p>
        {#if app.project && app.project.reached >= 0 && app.layers.layers.length}<Button variant="primary" label={`Add ${app.title}’s sheets`} onclick={() => app.queueSheets()} />{/if}
      </div>
    {/if}
  </section>
  <aside aria-label="Queue" class="flex flex-col min-h-0 border-t md:border-t-0 md:border-l border-paper-edge bg-paper-soft max-h-[70vh] md:max-h-none">
    <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-2"><p class="eyebrow">Queue · {q.items.length}</p>{#if q.done.length}<Button size="sm" style="ghost" label="Clear done" onclick={() => q.clearDone()} />{/if}</div>
    <ol class="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-2" data-queue-list>
      {#each q.items as it (it.id)}
        <li class="flex items-center gap-2.5 rounded-lg border bg-paper p-2 {it.id === c?.id ? 'border-accent' : 'border-paper-edge'} {it.phase === 'done' ? 'opacity-70' : ''}" aria-label={`${it.name} · ${it.craftName} · ${it.id === c?.id ? status[it.phase] : it.phase === 'done' ? 'to assembly' : 'waiting'}`}>
          <span class="w-11 h-11 shrink-0 rounded-md bg-paper-soft border border-paper-edge p-0.5"><CutSheet d={it.cut} colour={it.colour} aspect={it.sheetMm[0] / it.sheetMm[1]} label="" small /></span>
          <span class="flex-1 min-w-0"><span class="block text-ui text-ink truncate">{it.layer} · {it.name}</span><span class="block meta truncate">{it.craftName} · {it.op === 'engrave' ? 'engrave' : it.material}</span></span>
          <span class="meta {it.phase === 'done' ? 'text-success' : it.id === c?.id ? 'text-accent' : ''}">{it.id === c?.id ? status[it.phase] : it.phase === 'done' ? 'to assembly' : 'waiting'}</span>
          {#if it.phase === 'waiting' && it.id !== c?.id}
            <Button size="sm" style="ghost" icon="i-solar:arrow-up-linear" aria-label={`Cut ${it.name} next`} title="Cut this next" onclick={() => q.toFront(it.id)} />
            <Button size="sm" style="ghost" icon="i-solar:close-circle-linear" aria-label={`Remove ${it.name}`} title="Remove" onclick={() => q.remove(it.id)} />
          {/if}
        </li>
      {/each}
    </ol>
    <div class="border-t border-paper-edge px-4 py-4 flex flex-col gap-3 bg-paper" aria-live="polite">
      {#if !c}
        <p class="text-ui text-ink-mute">{q.items.length ? 'Every sheet is cut and waiting in Assemble, in stacking order.' : 'Sheets you send here wait their turn.'}</p>
        {#if q.items.length && app.project && app.project.reached >= 0}<Button variant="primary" label="Go to Assemble" href="/make/assemble" target="" />{/if}
      {:else if c.phase === 'waiting'}
        <p class="text-ui text-ink-mute"><LayerSwatch colour={c.colour} size="sm" /> <b class="text-ink font-medium">{laser ? 'Put' : 'Stick'} {c.material || 'the sheet'}</b> {laser ? 'flat on the bed, top-left at the origin' : 'on the mat, top-left corner, and load the mat'}. Then press Start.</p>
        <Button variant="primary" size="lg" icon="i-solar:play-linear" label="Start" onclick={() => q.start()} />
      {:else if c.phase === 'running' || c.phase === 'paused'}
        <p class="text-ui text-ink-mute">{c.phase === 'running' ? `${verb} ${c.name} — stay with the machine.` : `Paused at ${pct}%.`}</p>
        <Button variant="primary" size="lg" icon={c.phase === 'running' ? 'i-solar:pause-linear' : 'i-solar:play-linear'} label={c.phase === 'running' ? 'Pause' : 'Resume'} onclick={() => q.start()} />
      {:else if c.phase === 'weeding'}
        <p class="text-ui text-ink-mute">{laser ? 'Lift the piece out' : 'Unload the mat and peel the waste away'} — the piece stays.</p>
        <Button size="lg" label="Clearing…" disabled />
      {:else}
        <p class="text-ui text-ink-mute"><b class="text-ink font-medium">{c.name}</b> is {c.op === 'engrave' ? 'engraved — leave the board in place for its cut' : 'cut and goes to Assemble'}.{q.waiting.length > 1 ? ` Next: ${q.waiting[1].name}.` : ''}</p>
        <div class="flex gap-2"><span class="flex-1 grid"><Button variant="primary" size="lg" label={q.waiting.length > 1 ? 'Next sheet' : 'Finish'} iconRight="i-solar:arrow-right-linear" onclick={() => q.next()} /></span><Button size="lg" style="outline" label="Again" onclick={() => q.again()} /></div>
      {/if}
      <p class="meta">Advisory only — never leave your machine unattended.</p>
      {#if app.project && app.project.reached >= 0}<a href={resolve('/make/assemble')} class="text-ui">Assemble {app.title} →</a>{/if}
    </div>
  </aside>
</div>
