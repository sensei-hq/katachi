import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { interpretLayerOp } from '$lib/server/meta/layer-op';
export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  return json(await interpretLayerOp({ META_API_KEY: env.META_API_KEY }, body));
}
