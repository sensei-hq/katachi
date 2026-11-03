<script lang="ts">
import { page } from '$app/state';
import { craftSections, sections, sectionFor, tools } from '$lib/content/sections';
import { journey, journeyStepFor } from '$lib/content/journey';
import { useApp } from '$lib/state/context';
import ScreenHeader from '$lib/components/ScreenHeader.svelte';
import AppNav from '$lib/components/AppNav.svelte';
import NavRail from '$lib/components/shell/NavRail.svelte';
import ChatPanel from '$lib/components/shell/ChatPanel.svelte';
import KatachiChat from '$lib/components/shell/KatachiChat.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Button } from '@rokkit/ui';
import type { ChatAction } from '$lib/state/conversation.svelte';
import { untrack } from 'svelte';
let { children } = $props();
const app = useApp();
const path = $derived(page.url.pathname);
const current = $derived(tools.find((t) => path === t.href)?.id ?? sectionFor(path));
const step = $derived(journeyStepFor(path));
const kind = $derived(app.layers.kind);
// The open craft's steps join the rail as icons (Layers · Cut · Assemble); a step without its layers yet is off
const craft = $derived(app.project && app.project.reached >= 0 ? {
  name: app.title, image: app.project.image, href: app.resumePath,
  steps: craftSections(kind).map((s) => ({ ...s, disabled: !app.canVisit(s.href.replace('/make/', '') as never) }))
} : null);
// Phone back chevron: the previous route in the journey (Capture goes back Home).
const routes = $derived(journey.flatMap((j) => j.routes.filter((r) => r !== (kind === '3d' ? '/make/layers' : '/make/views') && r !== '/make/reference' && !(kind === '3d' && r === '/make/gaps'))));
const back = $derived(step ? (path === '/make/reference' ? '/capture' : routes[routes.indexOf(path) - 1] ?? '/workshop') : null);
// the cut queue's icon counts the sheets waiting; it pulses when sheets were just sent from a craft
const nav = $derived(sections.map((s) => (s.id === 'queue' ? { ...s, badge: app.queue.waiting.length || undefined, pulse: app.queue.added > 0 } : s)));
$effect(() => { if (path === '/queue') app.queue.seen(); });
$effect(() => { app.page = path; });
const ask = (text: string) => void app.ask(text, path).then((to) => { if (to) void goto(resolve(to as '/workshop')); });
const act = (a: ChatAction) => {
  if (a.id === 'say') app.flow.conversation.ingestTranscript(a.label);
  if (a.id === 'queue') { app.queueSheets(); return; }
  if (a.href) return void goto(resolve(a.href as '/workshop'));
  if (a.id?.startsWith('variation:')) app.chooseVariation(Number(a.id.split(':')[1]));
};
// Autosave: any change to the project or its flow choices is written to the saved project.
$effect(() => { void app.layers.snapshot(); if (app.project) void $state.snapshot(app.project); untrack(() => app.save()); });
// hold the mic to talk: what you said is sent like a typed message
const listen = $derived({ voice: app.voice.status, onMicDown: () => void app.voiceStart(), onMicUp: () => void app.voiceStop().then((t) => { if (t) ask(t); }) });
// quoting: a message or a layer rides along with the next thing you say
const quoting = { onQuote: (t: string) => app.quoteMessage(t), onQuoteLayer: (n: number) => app.quoteLayer(n), onClearQuote: () => app.clearQuote() };
</script>
<!-- Studio (≥ md, incl. tablet landscape): icon rail · top bar + page · Katachi column (mockups/desktop).
     Phone (< md): top bar, page, icon nav docked at the bottom; Katachi opens as a sheet (mockups/mobile). -->
<div data-studio-frame class="min-h-dvh flex bg-paper text-ink font-sans text-body md:h-dvh md:overflow-hidden">
  <div class="lt-md:hidden flex"><NavRail sections={nav} {craft} {tools} {current} chatOpen={app.chatOpen} onToggleChat={() => app.toggleChat()} /></div>
  <div class="flex-1 min-w-0 flex flex-col md:min-h-0">
    <div class="lt-md:sticky lt-md:top-0 z-10">
      <ScreenHeader title={app.screen.title} subtitle={app.screen.subtitle} pill={app.costPill} {back} />
    </div>
    <main class="flex-1 md:min-h-0 md:overflow-auto">{@render children()}</main>
    <div class="md:hidden sticky bottom-0 z-10"><AppNav sections={[...nav.filter((s) => s.phone !== false), ...(craft?.steps ?? [])]} current={current as never} chatOpen={app.sheetOpen} onOpenChat={() => app.toggleSheet()} /></div>
  </div>
  {#if app.chatOpen}
    <div class="lt-md:hidden flex"><ChatPanel messages={app.messages} info={app.info} suggestions={app.suggestions} quote={app.quote} onAction={act} onAsk={ask} {...listen} {...quoting} onClose={() => app.toggleChat()} /></div>
  {/if}
</div>
{#if app.sheetOpen}
  <!-- Phones: the assistant as a sheet over the work area, with the composer -->
  <div role="dialog" aria-modal="true" aria-label="Katachi chat" class="md:hidden fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col bg-paper-soft border-t border-paper-edge rounded-t-lg shadow-lg">
    <header class="h-12 shrink-0 flex items-center gap-2 pl-4 pr-2 hair-b"><span class="eyebrow flex-1">Katachi</span><span class="meta">Muse · on</span><Button style="ghost" size="sm" icon="i-solar:close-circle-linear" aria-label="Close chat" onclick={() => app.toggleSheet()} /></header>
    <div class="flex-1 min-h-0 flex flex-col pb-[env(safe-area-inset-bottom)]">
      <KatachiChat messages={app.messages} suggestions={app.suggestions} quote={app.quote} onAsk={ask} onAction={(a) => { app.toggleSheet(); act(a); }} {...listen} {...quoting} />
    </div>
  </div>
{/if}
