<script lang="ts">
import { Button, Card } from '@rokkit/ui';
import { InputCheckbox, InputField } from '@rokkit/forms';
import { ThemeSwitcherToggle } from '@rokkit/app';
import KatachiMark from '$lib/components/KatachiMark.svelte';
import HeroJourney from '$lib/components/HeroJourney.svelte';
import { howItWorks } from '$lib/content/journey';
import { layerSets } from '$lib/content/layers';
import { versionLabel } from '$lib/content/version';
import { useApp } from '$lib/state/context';
// Landing (signed out): what Katachi makes, how the Muse models do it, and the gate (docs/design/07 G1–G3).
let { data }: { data: { signedIn: boolean } } = $props();
const session = useApp().session;
const layers = layerSets.paper.layers;
const consents = [
  { key: 'attested', label: 'I confirm I am 18+', hint: 'Required by the Meta model terms.' },
  { key: 'safetyAck', label: "I'll never leave my laser unattended", hint: "Burn Watch is advisory — it can't stop a fire." },
  { key: 'noPersonalAck', label: 'No personal photos', hint: 'The demo runs on free credits, so uploads may be used by Meta.' }
] as const;
async function enter() { if (await session.enterFromForm()) location.href = '/workshop'; }
const pad = (n: number) => String(n).padStart(2, '0');
</script>
<svelte:head><title>Katachi · Snap → Make</title></svelte:head>
<div class="min-h-dvh bg-paper text-ink font-sans text-body">
  <header class="h-14 flex items-center gap-2.5 px-4 md:px-10 hair-b bg-paper-soft">
    <span class="grid place-items-center w-8 h-8 rounded-md bg-brand-tile"><KatachiMark size={20} /></span>
    <span class="font-heading text-lede">Katachi</span>
    <span class="flex-1"></span>
    <span class="lt-md:hidden meta">Meta Global AI Developer Hackathon · demo</span>
    <ThemeSwitcherToggle variant="single" />
  </header>

  <main class="mx-auto w-full max-w-[1280px] px-4 md:px-10">
    <section aria-label="Katachi" class="grid gap-8 pt-8 md:pt-14 md:grid-cols-[minmax(0,1fr)_380px] md:gap-12 md:items-start">
      <div class="flex flex-col gap-6 min-w-0">
        <div>
          <p class="eyebrow">Snap → Make</p>
          <h1 class="font-heading text-display md:text-hero font-normal tracking-display mt-3">Show it. Say it.<br />Burn it.</h1>
          <p class="mt-3.5 text-lede text-ink-mute max-w-[52ch]">Snap a picture, upload one or sketch your own. Katachi splits it into layers you can cut on a laser or Cricut, then shows you how to put it together.</p>
        </div>
        <HeroJourney {layers} />
      </div>

      {#if data.signedIn}
        <Card class="p-5 md:p-6 flex flex-col gap-4 md:sticky md:top-6">
          <section aria-label="Welcome back" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1"><p class="eyebrow">You're in</p><p class="text-ui text-ink-mute">Your invite is active on this browser.</p></div>
            <Button size="lg" variant="primary" class="w-full" label="Open the workshop" iconRight="i-solar:arrow-right-linear" href="/workshop" target="" />
            <Button style="outline" class="w-full" label="Your crafts" href="/workshop" target="" />
          </section>
        </Card>
      {:else}
      <Card class="p-5 md:p-6 flex flex-col gap-5 md:sticky md:top-6">
        <div class="flex flex-col gap-1"><p class="eyebrow">Enter the workshop</p><p class="text-ui text-ink-mute">Invite-only during the hackathon.</p></div>
        <InputField name="invite" type="text" label="Invite code" placeholder="Your invite code" autocomplete="off" bind:value={session.code} />
        <div class="flex flex-col divide-y divide-paper-edge">
          {#each consents as c (c.key)}
            <label class="flex gap-3 items-start py-2.5 cursor-pointer">
              <InputCheckbox variant="default" name={c.key} bind:value={session[c.key]} />
              <span><span class="block font-medium">{c.label}</span><span class="block text-ui text-ink-mute">{c.hint}</span></span>
            </label>
          {/each}
        </div>
        {#if session.msg}<p role="status" class="text-ui {session.gated ? 'text-success' : 'text-danger'}">{session.msg}</p>{/if}
        <Button size="lg" variant="primary" class="w-full" label="Enter the workshop" iconRight="i-solar:arrow-right-linear" onclick={enter} />
      </Card>
      {/if}
    </section>

    <section aria-label="How it works" class="py-12 md:py-16">
      <h2 class="panel-title">How it works</h2>
      <p class="text-ui text-ink-mute mt-1">Each Meta model does the part it is best at. Sizes and cut paths are computed in code, never guessed.</p>
      <ol class="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-5">
        {#each howItWorks as s, i (s.title)}
          <li class="rounded-lg border border-paper-edge bg-paper-soft p-4 flex flex-col gap-2">
            <span class="font-mono text-micro text-accent">{pad(i + 1)}</span>
            <h3 class="font-heading text-lede font-normal">{s.title}</h3>
            <p class="text-ui text-ink-mute flex-1">{s.body}</p>
            <p class="flex flex-wrap gap-1">{#each s.models as m (m)}<span class="meta rounded-full border border-paper-edge px-2 py-0.5">{m}</span>{/each}</p>
          </li>
        {/each}
      </ol>
    </section>
  </main>
  <footer class="hair-t px-4 md:px-10 py-5 meta text-center">Muse models on the Meta Model API · cut paths are computed in code · <span data-app-version>{versionLabel}</span></footer>
</div>
