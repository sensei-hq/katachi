<script lang="ts">
import { resolve } from '$app/paths';
import { fade, fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import KatachiMark from '$lib/components/KatachiMark.svelte';
import { actionGroups, architecture, deckFile, examples, flow, roadmap, slides, status, why } from '$lib/content/site';
// The deck as a web slideshow (public): arrow keys or swipe to move, N for the speaker notes (the voiceover),
// F for full screen. Each slide slides in from the side it comes from, its parts settling in one after another.
let at = $state(0), dir = $state(1), notes = $state(false);
let stage: HTMLElement | undefined = $state();
const slide = $derived(slides[at]);
const ex = $derived(slide.kind === 'example' ? examples.find((e) => e.id === slide.example)! : null);
function go(n: number) { const to = Math.max(0, Math.min(slides.length - 1, n)); if (to === at) return; dir = to > at ? 1 : -1; at = to; }
function key(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(at + 1); }
  else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(at - 1); }
  else if (e.key === 'Home') go(0); else if (e.key === 'End') go(slides.length - 1);
  else if (e.key.toLowerCase() === 'n') notes = !notes;
  else if (e.key.toLowerCase() === 'f') void (document.fullscreenElement ? document.exitFullscreen() : stage?.requestFullscreen());
}
let x0 = 0;
const pad = (n: number) => String(n).padStart(2, '0');
// parts settle in one after another
const part = (node: Element, { i = 0 } = {}) => fly(node, { y: 10, duration: 450, delay: 120 + i * 70, easing: cubicOut });
</script>
<svelte:window onkeydown={key} />
<svelte:head><title>Katachi · Slides</title></svelte:head>
<div class="min-h-dvh bg-paper text-ink font-sans text-body flex flex-col">
  <header class="h-12 flex items-center gap-3 px-4 md:px-8 hair-b bg-paper-soft">
    <a href={resolve('/story')} class="flex items-center gap-2" aria-label="Back to the story"><span class="grid place-items-center w-7 h-7 rounded-md bg-brand-tile"><KatachiMark size={16} /></span><span class="font-heading">Katachi</span></a>
    <span class="flex-1"></span>
    <span class="meta">{pad(at + 1)} / {pad(slides.length)}</span>
    <button type="button" class="text-ui px-2 py-1 rounded-md border border-paper-edge {notes ? 'bg-paper text-ink' : 'text-ink-mute'}" aria-pressed={notes} onclick={() => (notes = !notes)}>Notes</button>
    <button type="button" class="text-ui px-2 py-1 rounded-md border border-paper-edge text-ink-mute" onclick={() => (document.fullscreenElement ? document.exitFullscreen() : stage?.requestFullscreen())}>Full screen</button>
    <a href={resolve(deckFile as '/')} download class="text-ui px-2 py-1 rounded-md border border-paper-edge text-ink-mute">.pptx</a>
  </header>
  <div class="flex-1 grid place-items-center p-3 md:p-6">
    <section bind:this={stage} aria-roledescription="slideshow" aria-label="Katachi slides" class="relative w-full max-w-[1200px] aspect-video rounded-lg overflow-hidden bg-paper-soft border border-paper-edge" ontouchstart={(e) => (x0 = e.touches[0].clientX)} ontouchend={(e) => { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1)); }}>
      {#key at}
        <article aria-roledescription="slide" aria-label={`${at + 1} of ${slides.length}: ${slide.title}`} class="absolute inset-0 p-[4%] flex flex-col" in:fly={{ x: 60 * dir, duration: 520, easing: cubicOut }} out:fade={{ duration: 180 }}>
          {#if slide.kind === 'title' || slide.kind === 'close'}
            <div class="grid grid-cols-[1.1fr_1fr] gap-[4%] h-full items-center">
              <div class="flex flex-col gap-4">
                {#if slide.kind === 'title'}<span in:part class="grid place-items-center w-14 h-14 rounded-lg bg-brand-tile"><KatachiMark size={36} /></span>{/if}
                <h1 in:part={{ i: 1 }} class="font-heading font-normal tracking-display {slide.kind === 'title' ? 'text-[clamp(32px,6vw,72px)]' : 'text-[clamp(24px,3.6vw,44px)]'} leading-tight">{slide.title}</h1>
                {#each slide.lines as l, k (l)}<p in:part={{ i: 2 + k }} class="text-[clamp(14px,1.8vw,22px)] {k === 1 ? 'text-accent italic' : 'text-ink-mute'}">{l}</p>{/each}
                {#if slide.kind === 'title'}<p in:part={{ i: 4 }} class="meta mt-4">Meta AI Developer Hackathon 2026 · Indie · Build for Your World</p>{/if}
              </div>
              <img in:fade={{ duration: 700, delay: 150 }} src={slide.kind === 'title' ? '/story/cat-photo.jpg' : '/story/spark.jpg'} alt="" class="h-full w-full object-cover rounded-md" />
            </div>
          {:else}
            <h2 in:part class="font-heading font-normal tracking-display text-[clamp(18px,2.7vw,34px)]">{slide.title}</h2>
            <div class="flex-1 min-h-0 mt-[3%] {slide.kind === 'example' || slide.kind === 'why' ? '' : 'flex flex-col justify-center pb-[4%]'}">
              {#if slide.kind === 'why'}
                <ul class="flex flex-col gap-[6%] h-full justify-center">
                  {#each why as w, k (w.title)}<li in:part={{ i: k + 1 }} class="flex gap-4 items-start"><span class="shrink-0 grid place-items-center w-[clamp(32px,4.5vw,56px)] aspect-square rounded-full bg-paper border border-paper-edge"><span class="{w.icon} text-accent text-[clamp(16px,2vw,26px)]" aria-hidden="true"></span></span><span><span class="block font-semibold text-[clamp(14px,1.9vw,24px)]">{w.title}</span><span class="block text-ink-mute text-[clamp(12px,1.5vw,19px)]">{w.body}</span></span></li>{/each}
                </ul>
              {:else if slide.kind === 'flow'}
                <ol class="grid grid-cols-5 gap-[2%]">
                  {#each flow as f, k (f.title)}<li in:part={{ i: k + 1 }} class="rounded-lg bg-paper border border-paper-edge p-[8%] flex flex-col items-center text-center gap-2"><span class="grid place-items-center w-[clamp(28px,3.6vw,46px)] aspect-square rounded-full bg-accent"><span class="{f.icon} text-on-accent text-[clamp(14px,1.8vw,22px)]" aria-hidden="true"></span></span><span class="font-semibold text-[clamp(11px,1.4vw,18px)]">{k + 1} · {f.title}</span><span class="text-ink-mute text-[clamp(9px,1.05vw,14px)]">{f.body}</span></li>{/each}
                </ol>
                <p in:part={{ i: 7 }} class="mt-[4%] rounded-lg bg-paper border border-paper-edge p-[2.5%] text-[clamp(12px,1.5vw,19px)]"><span class="font-semibold">Say it or tap it:</span> <span class="text-ink-mute">the same actions, one undo. “Make them all the same size” · “undo”</span></p>
              {:else if slide.kind === 'example' && ex}
                <div class="grid grid-cols-[1fr_1.6fr] gap-[3%] h-full">
                  <div class="flex flex-col gap-3 min-h-0">
                    <img in:part={{ i: 1 }} src={ex.photo} alt={`The photo: ${ex.title}`} class="w-full min-h-0 flex-1 object-contain rounded-md" />
                    <dl in:part={{ i: 3 }} class="flex gap-[8%]">{#each ex.stats.slice(-2) as st (st.label)}<div><dt class="sr-only">{st.label}</dt><dd class="font-heading text-accent text-[clamp(18px,2.6vw,34px)]">{st.value}</dd><dd class="meta">{st.label}</dd></div>{/each}</dl>
                  </div>
                  <div class="flex flex-col gap-3 min-h-0">
                    {#if ex.layers}
                      <div in:part={{ i: 2 }} class="grid grid-cols-5 gap-2 flex-1 min-h-0 items-center">{#each ex.layers as l, k (l.name)}<figure class="m-0"><img src={l.src} alt={`Layer ${k + 1}: ${l.name}`} class="w-full aspect-square object-contain rounded-md bg-paper" /><figcaption class="text-center font-semibold text-[clamp(10px,1.2vw,15px)] mt-1">{k + 1} · {l.name}</figcaption></figure>{/each}</div>
                    {:else}
                      <img in:part={{ i: 2 }} src={ex.result} alt={ex.resultAlt} class="w-full flex-1 min-h-0 object-contain rounded-md" />
                    {/if}
                    <ol class="flex flex-wrap gap-2">{#each ex.steps as s, k (s)}<li in:part={{ i: 3 + k }} class="meta rounded-full border border-accent text-accent px-3 py-1">{k + 1} · {s}</li>{/each}</ol>
                  </div>
                </div>
              {:else if slide.kind === 'architecture'}
                <div class="grid grid-cols-3 gap-[2.5%]">
                  {#each architecture as a, k (a.title)}<div in:part={{ i: k + 1 }} class="rounded-lg bg-paper border border-paper-edge p-[6%]"><h3 class="font-semibold text-accent text-[clamp(13px,1.6vw,20px)]">{a.title}</h3><p class="meta">{a.sub}</p><ul class="mt-2 list-disc pl-5 flex flex-col gap-1 text-ink-mute text-[clamp(11px,1.35vw,17px)]">{#each a.points as p (p)}<li>{p}</li>{/each}</ul></div>{/each}
                </div>
                <p in:part={{ i: 5 }} class="mt-[5%] italic text-accent text-[clamp(14px,1.8vw,22px)]">Models see and decide. Code measures every line that gets cut.</p>
              {:else if slide.kind === 'actions'}
                <div class="grid grid-cols-2 gap-[2.5%]">
                  {#each actionGroups as g, k (g.title)}<div in:part={{ i: k + 1 }} class="rounded-lg bg-paper border border-paper-edge p-[4%] flex gap-3"><span class="{g.icon} text-accent text-[clamp(18px,2.4vw,30px)] shrink-0" aria-hidden="true"></span><span><span class="block font-semibold text-[clamp(13px,1.6vw,20px)]">{g.title}</span><span class="block text-ink-mute text-[clamp(11px,1.35vw,17px)]">{g.list}</span></span></div>{/each}
                </div>
                <p in:part={{ i: 6 }} class="mt-[5%] text-[clamp(12px,1.5vw,19px)]"><span class="font-semibold">One contract:</span> <span class="text-ink-mute">targets in, changed items out. Several steps in one request become one undo.</span></p>
              {:else if slide.kind === 'status'}
                <div class="grid grid-cols-2 gap-[2.5%]">
                  <div in:part={{ i: 1 }} class="rounded-lg bg-paper border border-paper-edge p-[5%]"><h3 class="font-semibold text-success text-[clamp(14px,1.8vw,22px)]">Works today</h3><ul class="mt-2 list-disc pl-5 flex flex-col gap-1.5 text-ink-mute text-[clamp(12px,1.5vw,19px)]">{#each status.works as w (w)}<li>{w}</li>{/each}</ul></div>
                  <div in:part={{ i: 2 }} class="rounded-lg bg-paper border border-paper-edge p-[5%]"><h3 class="font-semibold text-warning-ink text-[clamp(14px,1.8vw,22px)]">Not there yet</h3><ul class="mt-2 list-disc pl-5 flex flex-col gap-1.5 text-ink-mute text-[clamp(12px,1.5vw,19px)]">{#each status.gaps as g (g)}<li>{g}</li>{/each}</ul></div>
                </div>
              {:else if slide.kind === 'roadmap'}
                <div class="grid grid-cols-3 gap-[2.5%]">
                  {#each roadmap as r, k (r.when)}<div in:part={{ i: k + 1 }} class="rounded-lg bg-paper border border-paper-edge p-[6%]"><h3 class="font-heading text-[clamp(18px,2.6vw,32px)] {k === 0 ? 'text-accent' : ''}">{r.when}</h3><p class="meta">{r.span}</p><ul class="mt-2 list-disc pl-5 flex flex-col gap-1.5 text-ink-mute text-[clamp(12px,1.45vw,18px)]">{#each r.items.slice(0, 2) as it (it.title)}<li>{it.title}</li>{/each}</ul></div>{/each}
                </div>
              {/if}
            </div>
          {/if}
        </article>
      {/key}
      <button type="button" class="absolute left-0 top-0 h-full w-[12%] opacity-0" aria-label="Previous slide" onclick={() => go(at - 1)} disabled={at === 0}></button>
      <button type="button" class="absolute right-0 top-0 h-full w-[12%] opacity-0" aria-label="Next slide" onclick={() => go(at + 1)} disabled={at === slides.length - 1}></button>
    </section>
    <nav aria-label="Slides" class="mt-4 flex gap-1.5">{#each slides as s, k (s.title)}<button type="button" class="h-1.5 rounded-full transition-all duration-300 {k === at ? 'w-6 bg-accent' : 'w-1.5 bg-paper-edge'}" aria-label={`Slide ${k + 1}: ${s.title}`} aria-current={k === at ? 'step' : undefined} onclick={() => go(k)}></button>{/each}</nav>
    {#if notes}<aside transition:fade={{ duration: 150 }} aria-label="Speaker notes" class="mt-4 w-full max-w-[1200px] rounded-lg border border-paper-edge bg-paper-soft p-4"><p class="eyebrow">Voiceover</p><p class="mt-1 text-lede">{slide.notes}</p></aside>{/if}
    <p class="mt-3 meta">← → to move · N notes · F full screen</p>
  </div>
</div>
