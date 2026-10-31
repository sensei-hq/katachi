import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sortViews } from '$lib/server/meta/views';
export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  const images = Array.isArray(body?.images) ? body.images.map(String) : [];
  return json(await sortViews({ META_API_KEY: env.META_API_KEY }, images));
}
