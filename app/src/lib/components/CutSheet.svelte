<script lang="ts">
// One layer as the sheet that gets cut: its traced cut paths (state-supplied, 0-1000 image coordinates) filled
// with the layer's material colour, the cut line as a hairline. The photo only sets the proportions.
let { d, colour, image = '', aspect: given = 0, label, small = false, flipped = false }: { d: string; colour: string; image?: string; /** the photo's width / height, when known */ aspect?: number; label: string; small?: boolean; /** e2e hook: the sheet's frame is flipped over */ flipped?: boolean } = $props();
let measured = $state(1);
const aspect = $derived(given > 0 ? given : measured);
$effect(() => { if (!image) return; const im = new Image(); im.onload = () => { if (im.naturalWidth && im.naturalHeight) measured = im.naturalWidth / im.naturalHeight; }; im.src = image; });
const H = $derived(Math.round(1000 / aspect));
</script>
<svg viewBox="-20 -20 1040 {H + 40}" class="w-full h-full block" role="img" aria-label={label} data-cut-sheet data-flipped={flipped || undefined}>
  <g transform="scale(1 {H / 1000})">
    <path {d} fill-rule="evenodd" fill={colour} class="text-accent" stroke="currentColor" stroke-width={small ? 0.75 : 1.25} stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </g>
</svg>
