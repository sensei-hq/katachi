import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { MetaClient } from '$lib/server/meta/client';
export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  const imageDataUrl = typeof body?.imageDataUrl === 'string' && body.imageDataUrl ? body.imageDataUrl : undefined;
  const prompt = String(body?.prompt ?? 'Redraw as clean, bold, single-color black line art on pure white, laser-engraving friendly, keep the composition');
  const n = Math.min(3, Math.max(1, Number(body?.n ?? 1) || 1));
  if (env.META_API_KEY && imageDataUrl) {
    try {
      const c = new MetaClient(env.META_API_KEY);
      const r = await c.imageEditWith(imageDataUrl, prompt, n);
      if (r.images.length) return json({ variants: r.images.map((_, i) => `Live take ${i + 1}`), images: r.images, source: 'live', trace: [{ model: 'muse-image-1.0', purpose: 'art_cleanup', stage: 'S6', latencyMs: r.latencyMs, costUsd: r.costUsd }] });
    } catch { /* degraded: fall through to fixture */ }
  }
  if (env.META_API_KEY && !imageDataUrl) {
    try {
      const c = new MetaClient(env.META_API_KEY);
      const r = await c.imageEdit(prompt, n);
      return json({ variants: ['M · live variant 1', 'M · live variant 2', 'M · live variant 3'].slice(0, n), images: [], source: 'live', trace: [{ model: 'muse-image-1.0', purpose: 'art_cleanup', stage: 'S6', latencyMs: 2200, costUsd: r.costUsd }] });
    } catch { /* degraded */ }
  }
  return json({ variants: ['M · bold lines', 'M · leaves', 'M · minimal'], images: [], source: 'fixture', trace: [{ model: 'muse-image-1.0', purpose: 'art_cleanup (demo fixture — set META_API_KEY for live)', stage: 'S6', latencyMs: 2200, costUsd: 0.03 }] });
}
