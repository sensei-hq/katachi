// Katachi · Rokkit named-token config. Source of truth: the design mock
// (mockups/svelte/src/lib/design/katachi.uno.js, Zen-Sumi: washi paper, sumi ink, one vermillion accent).
// Mock role → Rokkit token: bg→paper · surface→paper-soft · sunken→paper-mute · line→paper-edge ·
// fg→ink · muted→ink-mute · faint→ink-soft · ghost→ink-faint · action→primary · ok→success · warn→warning.
// Guarded by src/lib/design/tokens.spec.ts.
import { sumiPalette } from './src/lib/design/sumi-palette.js';

export default {
  palettes: sumiPalette,
  colorSpace: 'oklch',
  skin: {
    surface: { light: 'kami', dark: 'sumi' },
    ink: { light: 'kami', dark: 'sumi' },
    primary: 'shu', accent: 'shu',
    success: 'hisui', warning: 'kohaku', danger: 'beni', error: 'beni', info: 'ai'
  },
  overrides: {
    // surfaces
    paper: { light: 'kami.100', dark: 'sumi.50' },
    'paper-soft': { light: 'kami.200', dark: 'sumi.100' },
    'paper-mute': { light: 'kami.300', dark: 'sumi.200' },
    'paper-edge': { light: 'oklch(0.880 0.015 85)', dark: 'oklch(0.300 0.010 50)' },
    // text ramp: ink > ink-mute > ink-soft > ink-faint
    ink: { light: 'kami.900', dark: 'sumi.900' },
    'ink-mute': { light: 'kami.700', dark: 'sumi.800' },
    'ink-soft': { light: 'kami.600', dark: 'sumi.700' },
    'ink-faint': { light: 'kami.500', dark: 'sumi.600' },
    // the one vermillion accent
    accent: { light: 'shu.500', dark: 'shu.400' },
    'accent-soft': { light: 'oklch(0.580 0.150 35 / 0.12)', dark: 'oklch(0.700 0.150 35 / 0.18)' },
    'on-accent': { light: 'oklch(0.985 0.006 85)', dark: 'sumi.50' },
    'focus-ring': { light: 'shu.500', dark: 'shu.400' },
    // action = ink fill
    primary: { light: 'kami.900', dark: 'sumi.900' },
    'on-primary': { light: 'kami.100', dark: 'sumi.50' },
    // status
    success: { light: 'hisui.500', dark: 'oklch(0.720 0.090 160)' },
    'success-soft': { light: 'oklch(0.620 0.080 160 / 0.14)', dark: 'oklch(0.720 0.090 160 / 0.18)' },
    warning: { light: 'kohaku.500', dark: 'oklch(0.780 0.120 75)' },
    'warning-soft': { light: 'oklch(0.720 0.120 75 / 0.15)', dark: 'oklch(0.780 0.120 75 / 0.18)' },
    'warning-ink': { light: 'oklch(0.55 0.130 60)', dark: 'oklch(0.800 0.110 70)' },
    danger: { light: 'beni.500', dark: 'beni.400' },
    'danger-soft': { light: 'oklch(0.570 0.185 27 / 0.12)', dark: 'oklch(0.740 0.155 26 / 0.18)' },
    info: { light: 'ai.500', dark: 'ai.400' },
    // fabrication layers (mock Make screen): cut = accent, engrave = ink
    cut: { light: 'shu.500', dark: 'shu.400' },
    engrave: { light: 'kami.900', dark: 'sumi.900' },
    // birch texture and the always-dark camera
    texture: { light: 'oklch(0.580 0.010 50)', dark: 'oklch(0.600 0.010 85)' },
    camera: 'oklch(0.140 0.008 255)',
    // Katachi mark layer colours (repo root katachi.svg): fixed brand colours, same in both modes
    'brand-ink': '#25282D',
    'brand-tan': '#D8AE82',
    'brand-stone': '#DDD8D0',
    // light tile the mark sits on, so its dark ink reads on the dark theme too
    'brand-tile': '#F4F0E8'
  },
  typography: {
    display: "'Fraunces', 'Iowan Old Style', Georgia, serif",
    sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', Menlo, monospace"
  },
  shape: { radius: { sm: '4px', md: '6px', lg: '10px', xl: '12px', full: '9999px' } },
  icons: { solar: '@iconify-json/solar/icons.json', overrides: {} },
  switcher: 'manual',
  storageKey: 'katachi-theme'
};
