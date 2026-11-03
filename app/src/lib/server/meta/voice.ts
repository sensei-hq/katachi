// Muse Voice Transcribe (server-only): push-to-talk speech → text for the chat. The browser records while the mic
// is held and sends one short WAV; this posts it to Meta's file endpoint (/v1/asr/transcribe) and returns the text.
// The key never reaches the browser. The text then goes through the chat exactly as if it had been typed.
import { costFor } from '../trace';
import { isSpeechWav, wavDurationMs } from '../../domain/wav';

/** words the maker says that a general model might mishear */
export const MAKER_WORDS = ['Katachi', 'layer', 'layers', 'laser', 'Cricut', 'engrave', 'engraving', 'plywood', 'birch', 'cardstock', 'kerf', 'fretwork',
  'earring', 'earrings', 'bookmark', 'bookmarks', 'merge', 'smooth', 'straighten', 'upright', 'symmetric', 'outline', 'sheet', 'sheets', 'millimetres', 'mm', 'undo', 'redo'];

export type VoiceResult = { transcript: string; source: 'live' | 'fixture'; reason?: string; trace: { model: string; purpose: string; latencyMs: number; costUsd: number }[] };

export async function transcribe(env: Record<string, string | undefined>, wav: ArrayBuffer, fetchFn: typeof fetch = (u, i) => fetch(u, i), baseUrl = 'https://api.meta.ai/v1'): Promise<VoiceResult> {
  if (!isSpeechWav(wav)) return { transcript: '', source: 'fixture', reason: 'not a mono 16-bit WAV at 16 or 24 kHz', trace: [] };
  if (!env.META_API_KEY) return { transcript: '', source: 'fixture', reason: 'voice needs the Meta key on the server', trace: [] };
  const t0 = Date.now();
  const form = new FormData();
  form.append('request', JSON.stringify({ model: 'muse-voice-transcribe-1.0', mode: 'PUSH_TO_TALK', keywords: MAKER_WORDS, languageBias: ['English'] }));
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
  try {
    const res = await fetchFn(`${baseUrl}/asr/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${env.META_API_KEY}`, accept: 'application/json' }, body: form });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      console.error('transcribe failed:', res.status, body);
      return { transcript: '', source: 'fixture', reason: res.status === 429 ? 'too many voice requests just now — try again in a moment' : `Meta transcribe ${res.status}`, trace: [] };
    }
    const j = (await res.json()) as { transcript?: string; audioDurationMs?: number };
    const ms = Number(j.audioDurationMs) || wavDurationMs(wav);
    return { transcript: String(j.transcript ?? '').trim(), source: 'live',
      trace: [{ model: 'muse-voice-transcribe-1.0', purpose: 'transcribe', latencyMs: Date.now() - t0, costUsd: costFor('muse-voice-transcribe-1.0', { audioHours: ms / 3_600_000 }) }] };
  } catch (e) {
    console.error('transcribe failed:', e instanceof Error ? e.message : String(e));
    return { transcript: '', source: 'fixture', reason: 'couldn’t reach Meta transcribe', trace: [] };
  }
}
