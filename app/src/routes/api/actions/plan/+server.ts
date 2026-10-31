import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { planActions } from '$lib/server/meta/actions-plan';
export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  return json(await planActions({ META_API_KEY: env.META_API_KEY }, body));
}
