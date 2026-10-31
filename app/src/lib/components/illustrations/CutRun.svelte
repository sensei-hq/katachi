<script lang="ts">
import type { Toolpath, Pt } from '$lib/domain/toolpath';
import { headAt } from '$lib/domain/toolpath';
// The machine bed during a run (design/12) — an illustration of the physical mat or laser bed, so its colours are raw: the sheet in its colour on a cutting mat (blade cutter) or a honeycomb
// bed (laser); the tool follows the cutting program — travel dashed, the cut drawn as it goes — then the waste
// falls away and the piece is left. Presentation only: the state gives the program, the phase and the progress.
let { sheetId, colour, shapes, sheetMm, tp, machine, phase, progress, weed, label }: {
  /** the sheet on the bed (a new one slides in) */ sheetId: string; colour: string; shapes: Pt[][]; sheetMm: [number, number]; tp: Toolpath; machine: 'paper' | 'laser';
  phase: 'waiting' | 'running' | 'paused' | 'weeding' | 'cut' | 'done'; progress: number; weed: number; label: string;
} = $props();
let canvas = $state<HTMLCanvasElement | null>(null);
let box = $state({ w: 0, h: 0 });
// the sheet slides onto the mat when it comes up (view only)
let feed = $state(0);
// keyed on the id's value (a new sheet), not on every update of the run
const key = $derived(sheetId);
$effect(() => { void key; feed = 0; let raf = 0; const step = () => { feed = Math.min(1, feed + 0.06); if (feed < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); });
const css = (v: string) => (typeof getComputedStyle === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(v).trim());
function draw() {
  const c = canvas; if (!c || !box.w) return;
  const d = devicePixelRatio || 1; c.width = box.w * d; c.height = box.h * d;
  const g = c.getContext('2d'); if (!g) return;
  g.setTransform(d, 0, 0, d, 0, 0);
  const W = box.w, H = box.h, laser = machine === 'laser';
  // the bed: a 12 × 12 in cutting mat or a laser's honeycomb
  g.fillStyle = laser ? '#1c1a17' : '#3f6b5c'; g.fillRect(0, 0, W, H);
  const [sw, sh] = sheetMm, pad = 24, s = Math.min((W - pad * 2) / sw, (H - pad * 2) / sh), ox = (W - sw * s) / 2, oy = (H - sh * s) / 2;
  g.strokeStyle = laser ? '#2c2925' : '#5f8a7a'; g.lineWidth = 1;
  if (laser) { for (let y = 4; y < H; y += 9) for (let x = (Math.round(y / 9) % 2) * 5; x < W; x += 10) { g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.stroke(); } }
  else { const step = 25.4 * s; for (let x = ox % step; x < W; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = oy % step; y < H; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
  const P = (p: Pt) => [ox + p[0] * s, oy + p[1] * s] as const;
  const piece = new Path2D(); for (const sh2 of shapes) { sh2.forEach((p, k) => { const [x, y] = P(p); if (k) piece.lineTo(x, y); else piece.moveTo(x, y); }); piece.closePath(); }
  g.save(); g.translate(0, -(1 - feed) * (H + 20));
  // the waste around and inside the piece: falls away once the cut is done
  if (weed < 1) {
    const waste = new Path2D(); waste.rect(ox, oy, sw * s, sh * s); waste.addPath(piece);
    g.save(); g.globalAlpha = 1 - weed; g.translate(0, weed * 36); g.fillStyle = colour; g.fill(waste, 'evenodd'); g.restore();
  }
  g.fillStyle = colour; g.fill(piece, 'evenodd');
  // the cut so far
  const dist = progress * tp.total;
  if (dist > 0 && weed === 0 && phase !== 'cut' && phase !== 'done') {
    g.lineJoin = 'round'; g.lineWidth = 1.6;
    const head = headAt(tp, dist);
    for (let i = 0; i <= head.seg; i++) {
      const sg = tp.segs[i], to = i === head.seg ? head.pt : sg.to;
      if (sg.kind === 'travel') { g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,255,255,0.45)'; } else { g.setLineDash([]); g.strokeStyle = laser ? '#ffb347' : '#141210'; }
      const [x1, y1] = P(sg.from), [x2, y2] = P(to); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.setLineDash([]);
    const [hx, hy] = P(head.pt);
    if (laser) { const gr = g.createRadialGradient(hx, hy, 0, hx, hy, 14); gr.addColorStop(0, 'rgba(255,210,140,0.95)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.beginPath(); g.arc(hx, hy, 14, 0, Math.PI * 2); g.fill(); }
    else { g.fillStyle = css('--accent') || '#e3693f'; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - 6, hy - 15); g.lineTo(hx + 6, hy - 15); g.closePath(); g.fill(); }
  } else if (phase === 'cut' || phase === 'done' || weed > 0) { g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1; g.stroke(piece); }
  g.restore();
}
$effect(() => { void [colour, shapes, sheetMm, tp, machine, phase, progress, weed, feed, box.w, box.h]; draw(); });
</script>
<div class="absolute inset-0" bind:clientWidth={box.w} bind:clientHeight={box.h} role="img" aria-label={label} data-cut-run data-phase={phase}>
  <canvas bind:this={canvas} class="block w-full h-full" aria-hidden="true"></canvas>
</div>
