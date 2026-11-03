import { describe, it, expect } from 'vitest';
import { transcribe, MAKER_WORDS } from './voice';
import { encodeWav } from '../../domain/wav';

const speech = () => encodeWav(new Float32Array(32_000)); // two seconds at 16 kHz

describe('Muse Voice Transcribe (file endpoint)', () => {
  it('posts the WAV with push-to-talk settings and maker words, and costs it by the second', async () => {
    let seen: { url: string; auth: string; request: Record<string, unknown>; audio: Blob | null } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData;
      seen = { url, auth: String((init.headers as Record<string, string>).Authorization), request: JSON.parse(String(form.get('request'))), audio: form.get('audio') as Blob };
      return new Response(JSON.stringify({ sessionId: 's1', transcript: ' merge layers three and four ', audioDurationMs: 2000, turns: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await transcribe({ META_API_KEY: 'k' }, speech(), fake);
    expect(seen!.url).toBe('https://api.meta.ai/v1/asr/transcribe');
    expect(seen!.auth).toBe('Bearer k');
    expect(seen!.request).toMatchObject({ model: 'muse-voice-transcribe-1.0', mode: 'PUSH_TO_TALK', languageBias: ['English'] });
    expect(seen!.request.keywords).toEqual(MAKER_WORDS);
    expect(seen!.audio?.type).toBe('audio/wav');
    expect(r).toMatchObject({ transcript: 'merge layers three and four', source: 'live' });
    expect(r.trace[0]).toMatchObject({ model: 'muse-voice-transcribe-1.0', purpose: 'transcribe' });
    expect(r.trace[0].costUsd).toBeCloseTo((2 / 3600) * 0.18, 8);
  });
  it('without the key, or with bad audio, says why and calls nothing', async () => {
    let calls = 0; const fake = (async () => { calls++; return new Response('{}'); }) as unknown as typeof fetch;
    expect((await transcribe({}, speech(), fake)).reason).toMatch(/Meta key/);
    expect((await transcribe({ META_API_KEY: 'k' }, new ArrayBuffer(8), fake)).reason).toMatch(/not a mono/);
    expect(calls).toBe(0);
  });
  it('a rate limit or a failure is said plainly, never thrown', async () => {
    const busy = (async () => new Response('slow down', { status: 429 })) as unknown as typeof fetch;
    expect((await transcribe({ META_API_KEY: 'k' }, speech(), busy)).reason).toMatch(/too many/);
    const down = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect((await transcribe({ META_API_KEY: 'k' }, speech(), down)).reason).toMatch(/couldn’t reach/);
  });
});
