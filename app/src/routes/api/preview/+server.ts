import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { MetaClient } from '$lib/server/meta/client';
export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  const imageDataUrl = typeof body?.imageDataUrl === 'string' && body.imageDataUrl ? body.imageDataUrl : undefined;
  const prompt = String(body?.prompt ?? 'Render this layered craft as a finished piece on a wooden table, soft morning light, product photo. Label: AI preview.');
  if (env.META_API_KEY && imageDataUrl) {
    try {
      const c = new MetaClient(env.META_API_KEY);
      const r = await c.imageEditWith(imageDataUrl, prompt, 1);
      if (r.images.length) return json({ label: 'AI preview of the finished piece', image: r.images[0], source: 'live', trace: [{ model: 'muse-image-1.0', purpose: 'photoreal_preview', stage: 'S8', latencyMs: r.latencyMs, costUsd: r.costUsd }] });
    } catch { /* degraded */ }
  }
  return json({ label: 'Four birch coasters with the M engraved, stacked in the finger-joint holder on a coffee table.', image: '', source: 'fixture', trace: [{ model: 'muse-image-1.0', purpose: 'photoreal_preview (demo fixture)', stage: 'S8', latencyMs: 3000, costUsd: 0.01 }] });
}
