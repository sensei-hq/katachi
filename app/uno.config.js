// Colour, components and their states come from Rokkit (presetRokkit + @rokkit/themes zen-sumi).
// This file only adds what Rokkit has no primitive for, taken from the design mock
// (mockups/svelte/src/lib/design/katachi.uno.js): the type scale, type roles, and the
// graph-paper / birch textures drawn from named tokens.
import { defineConfig } from 'unocss';
import { presetRokkit } from '@rokkit/unocss';
import config from './rokkit.config.js';

const reducedMotion = `@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}`;

const mix = (token, pct) => `color-mix(in oklab, var(--${token}) ${pct}%, transparent)`;
const graph = (pct, size) => ({
  'background-image': `linear-gradient(${mix('ink', pct)} 1px, transparent 1px), linear-gradient(90deg, ${mix('ink', pct)} 1px, transparent 1px)`,
  'background-size': `${size}px ${size}px`
});

export default defineConfig({
  presets: [presetRokkit(config)],
  // the cut queue badge pulses when sheets were just sent to it (3 rings, then still); the public pages fade their
  // sections up as they scroll in (.reveal, shown by the reveal action; instant with reduced motion)
  preflights: [{ getCSS: () => `@keyframes katachi-badge { 0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 70%, transparent) } 100% { box-shadow: 0 0 0 10px transparent } } .animate-ping-once { animation: katachi-badge 1s ease-out 3 }\n.reveal { opacity: 0; transform: translateY(14px); transition: opacity 0.7s ease, transform 0.7s cubic-bezier(.2,.7,.2,1); transition-delay: var(--reveal-delay, 0ms) } .reveal[data-shown] { opacity: 1; transform: none }\n${reducedMotion}` }],
  // lib/content/*.ts carries icon class names (the section list), and lib/domain/actions/*.ts carries the
  // actions' icons (the gallery renders them), so UnoCSS must scan those too.
  content: { pipeline: { include: [/\.(svelte|html)($|\?)/, /src\/lib\/content\/.*\.(js|ts)($|\?)/, /src\/lib\/domain\/actions\/.*\.(js|ts)($|\?)/] } },
  theme: {
    // The mock's breakpoints: phone layout below md, studio (rail + workspace + chat) from md (tablet landscape) up.
    breakpoints: { sm: '640px', md: '1024px', lg: '1320px' },
    fontSize: {
      micro: ['11px', '1.3'], ui: ['13px', '1.4'], body: ['15px', '1.6'], lede: ['17px', '1.5'],
      title: ['22px', '1.3'], head: ['28px', '1.2'], display: ['40px', '1.05'], hero: ['56px', '1.02']
    },
    letterSpacing: { display: '-0.02em', lane: '0.06em', eyebrow: '0.18em' }
  },
  rules: [
    ['grid-bed', graph(6, 20)],
    ['grid-thumb', graph(5, 16)],
    ['swatch-birch', { background: `repeating-linear-gradient(90deg, ${mix('texture', 22)} 0 2px, transparent 2px 4px), ${mix('texture', 8)}` }],
    ['tabular', { 'font-variant-numeric': 'tabular-nums' }]
  ],
  shortcuts: {
    // A studio page's content column: phone width below md, a centred reading column in the studio.
    stage: 'mx-auto w-full max-w-[430px] md:max-w-[760px] md:py-4 flex flex-col',
    // Image → layers steps: art beside its controls in the studio, stacked on phones.
    'layers-grid': 'mx-auto w-full max-w-[430px] grid gap-4 p-4 items-start md:max-w-none md:p-6 md:grid-cols-[minmax(0,1fr)_320px]',
    'phone-col': 'mx-auto w-full max-w-[430px] min-h-dvh flex flex-col bg-paper text-ink font-sans text-body md:border-x md:border-paper-edge',
    eyebrow: 'font-mono text-micro font-medium uppercase tracking-eyebrow text-ink-soft',
    meta: 'font-mono text-micro font-medium text-ink-soft tabular',
    readout: 'font-mono text-ui font-medium text-ink-mute tabular',
    lane: 'font-mono text-micro font-medium uppercase tracking-lane text-ink-mute',
    'section-title': 'font-heading text-head font-normal tracking-display text-ink',
    'panel-title': 'font-heading text-title font-normal tracking-display text-ink',
    'hair-b': 'border-b border-paper-edge',
    'hair-t': 'border-t border-paper-edge'
  }
});
