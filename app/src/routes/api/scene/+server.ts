import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { analyseScene, analyseImage } from '$lib/server/meta/analyse';
export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  const imageDataUrl = typeof body?.imageDataUrl === 'string' && body.imageDataUrl ? body.imageDataUrl : undefined;
  if (imageDataUrl) {
    const r = await analyseImage({ META_API_KEY: env.META_API_KEY }, imageDataUrl);
    return json({ brief: r.brief, source: r.source, trace: r.trace });
  }
  const r = await analyseScene({ META_API_KEY: env.META_API_KEY });
  return json({ scene: r.scene, measure: r.measure, source: r.source, trace: r.trace });
}
