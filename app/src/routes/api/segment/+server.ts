import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { segmentPiece, segmentRegions } from '$lib/server/meta/sam';
export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  const imageDataUrl = String(body?.imageDataUrl ?? '');
  if (Array.isArray(body?.regions) && body.regions.length) {
    const regions = body.regions.map((r: any, i: number) => ({ id: String(r?.id ?? `r${i + 1}`), label: String(r?.label ?? r?.samPrompt ?? `Region ${i + 1}`), samPrompt: String(r?.samPrompt ?? r?.label ?? ''), likelyBought: Boolean(r?.likelyBought), note: String(r?.note ?? '') })).filter((r: any) => r.samPrompt);
    const r = await segmentRegions({ META_API_KEY: env.META_API_KEY }, imageDataUrl, regions, undefined, { multiple: Boolean(body?.multiple), subjectPrompt: typeof body?.subjectPrompt === 'string' ? body.subjectPrompt : undefined });
    return json({ regions: r.regions, source: r.source, trace: [{ model: 'sam-3.1', purpose: `segment ${r.regions.length} regions`, stage: 'S4', latencyMs: 1200, costUsd: r.costUsd }] });
  }
  const r = await segmentPiece({ META_API_KEY: env.META_API_KEY }, imageDataUrl, String(body?.prompt ?? ''));
  return json({ ...r, trace: [{ model: 'sam-3.1', purpose: 'segment subject', stage: 'S3', latencyMs: 900, costUsd: r.source === 'live' ? 0.0025 : 0 }] });
}
