<script lang="ts">
// The layers of YOUR photo as an exploded isometric stack (like the landing hero): each layer is the photo's own
// pixels inside its mask, lifted above the one behind it, back at the bottom. Presentation only.
let { image, layers, selected = 0, label = 'Exploded stack, back to front' }: {
  image: string; layers: { n: number; name: string; d: string; /** the whole sheet (stacked: includes what sits under the layers in front) */ sheet?: string; colour?: string }[]; selected?: number; label?: string;
} = $props();
const uid = `xp${Math.random().toString(36).slice(2, 8)}`;
let aspect = $state(1);
$effect(() => { const im = new Image(); im.onload = () => { if (im.naturalWidth && im.naturalHeight) aspect = im.naturalWidth / im.naturalHeight; }; im.src = image; });
const W = 300;
const Hp = $derived(Math.round(W / aspect));
const gap = $derived(Math.min(70, 300 / Math.max(1, layers.length - 1)));
const top = 40;
const base = $derived(top + (layers.length - 1) * gap);
// isometric plane: half height, rotated 45° (the landing hero's projection)
const iso = $derived(`matrix(0.62 0.36 -0.62 0.36 0 0) translate(${-W / 2} ${-Hp / 2})`);
const height = $derived(base + 0.36 * (W + Hp) + 40);
</script>
<svg viewBox="0 0 640 {height}" class="w-full h-full block" role="img" aria-label={label} data-exploded-photo>
  <defs>{#each layers as l (l.n)}<clipPath id="{uid}-{l.n}"><path d={l.d} transform="scale({W / 1000} {Hp / 1000})" clip-rule="evenodd" /></clipPath>{/each}</defs>
  {#each layers as l, i (l.n)}
    <g transform="translate(250 {base - i * gap + 0.18 * (W + Hp)})" opacity={selected && l.n !== selected ? 0.55 : 1} data-exploded-layer={l.n}>
      <g transform={iso}>
        <rect width={W} height={Hp} class="text-ink-soft" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-width="1" stroke-dasharray={i === 0 ? '' : '4 4'} vector-effect="non-scaling-stroke" />
        {#if l.sheet && l.colour}<path d={l.sheet} transform="scale({W / 1000} {Hp / 1000})" fill-rule="evenodd" fill={l.colour} fill-opacity="0.35" data-exploded-sheet />{/if}
        <image href={image} width={W} height={Hp} preserveAspectRatio="none" clip-path="url(#{uid}-{l.n})" />
        {#if l.n === selected}<path d={l.d} transform="scale({W / 1000} {Hp / 1000})" fill="none" class="text-accent" stroke="currentColor" stroke-width="1.25" vector-effect="non-scaling-stroke" />{/if}
      </g>
      <text x={0.62 * (W / 2) + 0.62 * (Hp / 2) + 14} y="4" class="{l.n === selected ? 'text-accent' : 'text-ink-soft'}" fill="currentColor" font-size="11" font-family="var(--font-mono, monospace)">{l.name}</text>
    </g>
  {/each}
</svg>
