<script lang="ts">
// A virtual run of the machine on one sheet: a blank sheet in the material's colour, the engraving swept in
// line by line, the cut traced by the head, then the extra pieces vanish and the piece is left. Presentation
// only — the state gives the paths (0-1000 image coordinates), the phase and the progress.
let { cut, engrave = '', colour, mode = 'cut', phase, progress = 0, image = '', aspect: given = 0, label }: {
  cut: string; engrave?: string; colour: string; mode?: 'cut' | 'engrave';
  phase: 'feed' | 'cutting' | 'verify' | 'done'; progress?: number; image?: string; /** the photo's width / height, when known */ aspect?: number; label: string;
} = $props();
const uid = `cp${Math.random().toString(36).slice(2, 8)}`;
let measured = $state(1);
const aspect = $derived(given > 0 ? given : measured);
$effect(() => { if (!image) return; const im = new Image(); im.onload = () => { if (im.naturalWidth && im.naturalHeight) measured = im.naturalWidth / im.naturalHeight; }; im.src = image; });
const H = $derived(Math.round(1000 / aspect));
const fit = $derived(`scale(1 ${H / 1000})`);
const p = $derived(phase === 'feed' ? 0 : phase === 'cutting' ? progress : 100);
// an engraving pass sweeps the whole time; a cut pass traces; an engraving already done shows on a cut pass
const engraveP = $derived(mode === 'engrave' ? p : engrave ? 100 : 0);
const cutP = $derived(mode === 'cut' ? p : 0);
const weeded = $derived(mode === 'cut' && (phase === 'verify' || phase === 'done'));
let path = $state<SVGPathElement | null>(null);
const head = $derived.by(() => {
  if (phase !== 'cutting' || !path) return null;
  try {
    if (mode === 'engrave') return { x: 1000 * ((progress * 7) % 100) / 100, y: (H * progress) / 100 };
    const len = path.getTotalLength(); const pt = path.getPointAtLength((len * progress) / 100); return { x: pt.x, y: (pt.y * H) / 1000 };
  } catch { return null; }
});
</script>
<svg viewBox="-30 -30 1060 {H + 60}" class="w-full h-full block" role="img" aria-label={label} data-cut-preview data-phase={phase}>
  <defs>
    <clipPath id="{uid}-piece"><path d={cut} transform={fit} clip-rule="evenodd" /></clipPath>
    <clipPath id="{uid}-sweep"><rect width="1000" height={(H * engraveP) / 100} /></clipPath>
  </defs>
  <!-- the extra material around the piece (and its holes): it vanishes once the cut is done -->
  <g class="weed" class:gone={weeded}>
    <path d="M0 0H1000V{H}H0Z {cut}" transform={fit} fill-rule="evenodd" fill={colour} class="text-ink-soft" stroke="currentColor" stroke-width="0.75" vector-effect="non-scaling-stroke" />
  </g>
  <!-- the piece -->
  <rect width="1000" height={H} fill={colour} clip-path="url(#{uid}-piece)" />
  {#if engrave}<g clip-path="url(#{uid}-sweep)"><path d={engrave} transform={fit} fill-rule="evenodd" class="text-ink" fill="currentColor" fill-opacity="0.55" data-engraved /></g>{/if}
  <!-- the cut line, traced as the head moves -->
  <path bind:this={path} d={cut} fill="none" stroke-width="0" />
  {#if cutP > 0}<path d={cut} transform={fit} pathLength="100" stroke-dasharray="100" stroke-dashoffset={100 - cutP} fill="none" class="text-accent" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" data-cut-line />{/if}
  {#if head}<circle cx={head.x} cy={head.y} r="9" class="text-accent" fill="currentColor" opacity="0.9"><animate attributeName="r" values="7;11;7" dur="0.6s" repeatCount="indefinite" /></circle>{/if}
</svg>
<style>
  .weed { transition: opacity 0.6s ease, transform 0.6s ease; transform-origin: center; }
  .weed.gone { opacity: 0; transform: scale(1.06); }
</style>
