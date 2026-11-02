<script lang="ts">
// Assemble's stage (design/12): the empty outline of the piece, then each cut sheet in its own colour placed as it
// lands — stacked back to front for layered art (the finished piece is that stack, with its depth), or one item
// per cell for separate items (each engraving lands on its item). Sheets are SVG paths in 0-1000 units of their
// frame. Presentation only: the page says how many are placed and which one is still in the air.
type Sheet = { d: string; colour: string; /** separate items: which cell it belongs to, and that sheet's width ÷ height */ cell?: number; aspect?: number; engrave?: boolean };
let { sheets, placed, settle = 1, hidden = -1, finale = 0, aspect = 1, label, paired = false }: {
  sheets: Sheet[]; placed: number; settle?: number; hidden?: number; finale?: number; aspect?: number; label: string;
  /** separate items in pairs: lay the cells out in an even number of columns */ paired?: boolean;
} = $props();
let canvas = $state<HTMLCanvasElement | null>(null);
let box = $state({ w: 0, h: 0 });
const cells = $derived(sheets.some((s) => s.cell !== undefined) ? Math.max(...sheets.map((s) => s.cell ?? 0)) + 1 : 0);
/** the frame a sheet is drawn in (stage px) */
function frameOf(k: number) {
  const s = sheets[k];
  if (!cells) { const side = Math.min(box.w, box.h * aspect) * 0.84; return { x: (box.w - side) / 2, y: (box.h - side / aspect) / 2, w: side, h: side / aspect }; }
  // pairs side by side: an even number of columns, so the two of a pair share a row
  const cols = paired ? Math.min(cells, cells > 8 ? 6 : 4) : Math.min(cells, 5), rows = Math.ceil(cells / cols), cw = box.w / cols, ch = box.h / rows, c = s?.cell ?? 0;
  const a = s?.aspect ?? 1, fw = Math.min(cw * 0.8, ch * 0.8 * a), fh = fw / a;
  return { x: (c % cols) * cw + (cw - fw) / 2, y: Math.floor(c / cols) * ch + (ch - fh) / 2, w: fw, h: fh };
}
function draw() {
  const c = canvas; if (!c || !box.w) return;
  const d = devicePixelRatio || 1; c.width = box.w * d; c.height = box.h * d;
  const g = c.getContext('2d'); if (!g) return;
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, box.w, box.h);
  const path = (k: number) => { const f = frameOf(k); g.save(); g.translate(f.x, f.y); g.scale(f.w / 1000, f.h / 1000); return { p: new Path2D(sheets[k].d), unit: 1000 / f.w }; };
  // the placeholders: where each piece will go
  sheets.forEach((s, k) => { if (!s.d || s.engrave || (!cells && k > 0)) return; const { p, unit } = path(k); g.setLineDash([6 * unit, 6 * unit]); g.strokeStyle = 'rgba(128,120,110,0.8)'; g.lineWidth = 1.2 * unit; g.stroke(p); g.restore(); });
  for (let k = 0; k < Math.min(placed, sheets.length); k++) {
    if (k === hidden || !sheets[k].d) continue;
    const s = k === placed - 1 ? settle : 1, { p, unit } = path(k);
    // finished: the stack's depth shows (each layer lifted a little more than the one behind it)
    const depth = finale * (cells ? 1 : k + 1);
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 4 + 8 * (1 - s) + depth * 2; g.shadowOffsetY = (3 + 3 * (1 - s) + depth) * unit / unit;
    g.fillStyle = sheets[k].colour; if (sheets[k].engrave) g.globalAlpha = 0.85; g.fill(p, 'evenodd'); g.restore();
  }
}
$effect(() => { void [sheets, placed, settle, hidden, finale, box.w, box.h, aspect, cells, paired]; draw(); });
/** where sheet k lands on screen right now (the page flies it there) */
export function target(k = 0) { if (!canvas) return null; const r = canvas.getBoundingClientRect(); const f = frameOf(k); return { x: r.left + f.x, y: r.top + f.y, w: f.w, h: f.h }; }
</script>
<div class="absolute inset-0" bind:clientWidth={box.w} bind:clientHeight={box.h} role="img" aria-label={label} data-stack-stage data-placed={placed}>
  <canvas bind:this={canvas} class="block w-full h-full" aria-hidden="true"></canvas>
</div>
