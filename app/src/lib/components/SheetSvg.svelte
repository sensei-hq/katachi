<script lang="ts">
// One traced sheet: the closed mm paths (state-supplied, from domain/vector) drawn to cut scale proportions.
let { svg, sizeMm = 300, label }: { svg: string; sizeMm?: number; label: string } = $props();
</script>
<svg viewBox="0 0 {sizeMm} {sizeMm}" class="w-full h-full block" role="img" aria-label={label} data-sheet-svg>
  <path d={svg} class="text-accent" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width={Math.max(0.8, sizeMm / 180)} />
</svg>
