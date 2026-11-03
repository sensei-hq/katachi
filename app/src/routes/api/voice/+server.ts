import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { transcribe } from '$lib/server/meta/voice';

// Push-to-talk: the WAV the chat recorded → Muse Voice Transcribe → the text. Behind the gate like every model call,
// and its cost lands on the invite through the reply's trace.
const MAX_BYTES = 4 * 1024 * 1024; // ~2 minutes of 16 kHz mono speech

export async function POST({ request }) {
  const wav = await request.arrayBuffer().catch(() => new ArrayBuffer(0));
  if (!wav.byteLength) return json({ transcript: '', source: 'fixture', reason: 'no audio', trace: [] }, { status: 400 });
  if (wav.byteLength > MAX_BYTES) return json({ transcript: '', source: 'fixture', reason: 'that was too long — hold the mic for under two minutes', trace: [] }, { status: 413 });
  const r = await transcribe({ META_API_KEY: env.META_API_KEY }, wav);
  const status = r.source === 'live' ? 200 : r.reason === 'voice needs the Meta key on the server' ? 503 : r.reason?.startsWith('not a mono') ? 400 : 502;
  return json(r, { status });
}
