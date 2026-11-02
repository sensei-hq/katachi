<script lang="ts">
import { resolve } from '$app/paths';
import SiteShell from '$lib/components/site/SiteShell.svelte';
import { reveal } from '$lib/components/site/reveal';
import { actionGroups, architecture, examples, film, flow, roadmap, status, why } from '$lib/content/site';
// The story (public): why Katachi, what it does, three examples, how it is built, where it stands and what is next.
let filmOk = $state(true);
</script>
<svelte:head><title>Katachi · The story</title><meta name="description" content="Katachi turns a photo of something you love into pieces you can cut on a laser or Cricut. A hackathon prototype on Meta's models." /></svelte:head>
<SiteShell wide>
  <section aria-label="Katachi" class="pt-10 md:pt-16 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:items-center">
    <div use:reveal>
      <p class="eyebrow">Build for Your World · Meta AI Developer Hackathon</p>
      <h1 class="font-heading text-display md:text-hero font-normal tracking-display mt-3">From a photo to pieces you can cut</h1>
      <p class="mt-4 text-lede text-ink-mute max-w-[46ch]">Show Katachi a picture of something you love. It finds the pieces, cleans them up and lays them out for your laser or Cricut. A working prototype, built in ten days on Meta’s models.</p>
      <p class="mt-6 flex flex-wrap gap-3"><a href={resolve('/slides')} class="rounded-md bg-accent text-on-accent px-4 py-2 text-ui font-medium">See the slides</a><a href={resolve('/')} class="rounded-md border border-paper-edge px-4 py-2 text-ui">Try it (invite)</a></p>
    </div>
    <figure use:reveal={120} class="m-0 rounded-lg overflow-hidden border border-paper-edge bg-paper-soft aspect-video">
      {#if filmOk}
        <video class="w-full h-full object-cover" controls preload="metadata" poster={film.poster} onerror={() => (filmOk = false)}>
          <source src={film.src} type="video/mp4" onerror={() => (filmOk = false)} />
          <track kind="captions" src={film.captions} srclang="en" label="English" default />
        </video>
      {:else}
        <img src="/story/spark.jpg" alt="A laser touching birch plywood" class="w-full h-full object-cover" />
      {/if}
    </figure>
  </section>

  <section aria-label="Why Katachi" class="py-14 md:py-20">
    <h2 use:reveal class="section-title">Cutting is easy; designing the cut is hard</h2>
    <div class="mt-8 grid gap-6 md:grid-cols-3">
      {#each why as w, i (w.title)}
        <div use:reveal={i * 90} class="flex gap-4"><span class="shrink-0 grid place-items-center w-11 h-11 rounded-full bg-paper-soft border border-paper-edge"><span class="{w.icon} text-accent text-xl" aria-hidden="true"></span></span>
          <div><h3 class="panel-title">{w.title}</h3><p class="text-ink-mute mt-1">{w.body}</p></div></div>
      {/each}
    </div>
  </section>

  <section aria-label="What it does" class="pb-14 md:pb-20">
    <h2 use:reveal class="section-title">One photo in, cut-ready sheets out</h2>
    <ol class="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-5">
      {#each flow as f, i (f.title)}
        <li use:reveal={i * 80} class="rounded-lg border border-paper-edge bg-paper-soft p-4 flex flex-col gap-2">
          <span class="grid place-items-center w-10 h-10 rounded-full bg-accent"><span class="{f.icon} text-on-accent text-lg" aria-hidden="true"></span></span>
          <h3 class="font-heading text-lede">{i + 1} · {f.title}</h3><p class="text-ui text-ink-mute">{f.body}</p>
        </li>
      {/each}
    </ol>
    <p use:reveal class="mt-4 text-ui text-ink-mute">Say it or tap it: the chat and the buttons run the same actions, with one undo. Every step shows the model that did it and what it cost.</p>
  </section>

  {#each examples as ex, i (ex.id)}
    <section aria-label={`Example ${ex.n}: ${ex.title}`} class="py-12 md:py-16 hair-t">
      <p use:reveal class="eyebrow">Example {ex.n} · {ex.kind}</p>
      <h2 use:reveal class="section-title mt-2">{ex.title}</h2>
      <div class="mt-6 grid gap-6 md:grid-cols-2 md:items-start {i % 2 ? 'md:[&>*:first-child]:order-2' : ''}">
        <div use:reveal class="flex flex-col gap-4">
          <img src={ex.photo} alt={`The photo: ${ex.title}`} class="w-full rounded-lg border border-paper-edge" loading="lazy" />
          <p class="text-lede text-ink-mute">{ex.say}</p>
          <ol class="flex flex-wrap gap-2">{#each ex.steps as s, k (s)}<li class="meta rounded-full border border-accent text-accent px-3 py-1">{k + 1} · {s}</li>{/each}</ol>
        </div>
        <div use:reveal={120} class="flex flex-col gap-4">
          {#if ex.layers}
            <div class="grid grid-cols-3 gap-3">{#each ex.layers as l, k (l.name)}<figure class="m-0 rounded-lg border border-paper-edge bg-paper-soft p-2"><img src={l.src} alt={`Layer ${k + 1}: ${l.name}`} class="w-full aspect-square object-contain" loading="lazy" /><figcaption class="text-ui text-center mt-1">{k + 1} · {l.name}</figcaption></figure>{/each}</div>
          {:else}
            <img src={ex.result} alt={ex.resultAlt} class="w-full rounded-lg border border-paper-edge" loading="lazy" />
          {/if}
          <dl class="grid grid-cols-3 gap-3">{#each ex.stats as st (st.label)}<div><dt class="sr-only">{st.label}</dt><dd class="font-heading text-head text-accent">{st.value}</dd><dd class="meta">{st.label}</dd></div>{/each}</dl>
        </div>
      </div>
    </section>
  {/each}

  <section aria-label="How it is built" class="py-14 md:py-20 hair-t">
    <h2 use:reveal class="section-title">Models perceive, code measures</h2>
    <div class="mt-8 grid gap-4 md:grid-cols-3">
      {#each architecture as a, i (a.title)}
        <div use:reveal={i * 90} class="rounded-lg border border-paper-edge bg-paper-soft p-5"><h3 class="panel-title">{a.title}</h3><p class="meta mt-1">{a.sub}</p>
          <ul class="mt-3 flex flex-col gap-1.5 list-disc pl-5 text-ink-mute">{#each a.points as p (p)}<li>{p}</li>{/each}</ul></div>
      {/each}
    </div>
    <p use:reveal class="mt-5 text-lede italic text-accent">Models never emit coordinates. They see and decide; code measures every line that gets cut.</p>
    <div class="mt-10 grid gap-4 sm:grid-cols-2">
      {#each actionGroups as g, i (g.title)}
        <div use:reveal={i * 70} class="rounded-lg border border-paper-edge bg-paper-soft p-4 flex gap-3"><span class="{g.icon} text-accent text-2xl shrink-0" aria-hidden="true"></span><div><h3 class="font-heading text-lede">{g.title}</h3><p class="text-ui text-ink-mute">{g.list}</p></div></div>
      {/each}
    </div>
  </section>

  <section aria-label="Where it stands" class="py-14 md:py-20 hair-t">
    <h2 use:reveal class="section-title">A prototype with promise, not a product yet</h2>
    <div class="mt-8 grid gap-4 md:grid-cols-2">
      <div use:reveal class="rounded-lg border border-paper-edge bg-paper-soft p-5"><h3 class="panel-title text-success flex items-center gap-2"><span class="i-solar:check-circle-linear" aria-hidden="true"></span>Works today</h3><ul class="mt-3 flex flex-col gap-2 list-disc pl-5 text-ink-mute">{#each status.works as w (w)}<li>{w}</li>{/each}</ul></div>
      <div use:reveal={100} class="rounded-lg border border-paper-edge bg-paper-soft p-5"><h3 class="panel-title text-warning-ink flex items-center gap-2"><span class="i-solar:danger-circle-linear" aria-hidden="true"></span>Not there yet</h3><ul class="mt-3 flex flex-col gap-2 list-disc pl-5 text-ink-mute">{#each status.gaps as g (g)}<li>{g}</li>{/each}</ul></div>
    </div>
    <div class="mt-10 grid gap-4 md:grid-cols-3">
      {#each roadmap as r, i (r.when)}
        <div use:reveal={i * 90}><p class="font-heading text-head {i === 0 ? 'text-accent' : 'text-ink'}">{r.when}</p><p class="meta">{r.span}</p><ul class="mt-2 flex flex-col gap-1 text-ink-mute">{#each r.items as it (it.title)}<li>{it.title}</li>{/each}</ul></div>
      {/each}
    </div>
    <p use:reveal class="mt-6"><a href={resolve('/roadmap')} class="text-accent underline-offset-4 hover:underline">The full roadmap →</a></p>
  </section>

  <section aria-label="Build your world" class="py-16 md:py-24 hair-t text-center">
    <h2 use:reveal class="font-heading text-display font-normal tracking-display">Build your world, one sheet at a time</h2>
    <p use:reveal={100} class="mt-3 text-lede text-ink-mute">Three crafts, under eight cents of Meta model calls.</p>
    <p use:reveal={180} class="mt-6 flex justify-center gap-3"><a href={resolve('/slides')} class="rounded-md bg-accent text-on-accent px-4 py-2 text-ui font-medium">The slides</a><a href={resolve('/docs')} class="rounded-md border border-paper-edge px-4 py-2 text-ui">How to use it</a></p>
    <p class="mt-8 meta">Built during the hackathon. Pre-existing: my UI library Rokkit and open-source tools.</p>
  </section>
</SiteShell>
