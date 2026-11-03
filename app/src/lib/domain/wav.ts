// Speech as Muse Voice Transcribe takes it: a RIFF/WAVE file, mono, 16-bit integer PCM at 16 kHz.
// Pure functions (no browser audio APIs), so they are tested on their own.

export const SPEECH_RATE = 16_000;

/** mix the channels down to one */
export function mono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = Math.min(...channels.map((c) => c.length)), out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/** resample by linear interpolation (speech only needs to stay intelligible, not hi-fi) */
export function resample(samples: Float32Array, from: number, to = SPEECH_RATE): Float32Array {
  if (from === to) return samples;
  const n = Math.max(1, Math.round((samples.length * to) / from)), out = new Float32Array(n), step = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * step, k = Math.floor(x), f = x - k;
    out[i] = (samples[k] ?? 0) * (1 - f) + (samples[k + 1] ?? samples[k] ?? 0) * f;
  }
  return out;
}

/** a WAV file of 16-bit mono PCM */
export function encodeWav(samples: Float32Array, rate = SPEECH_RATE): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return buf;
}

/** how long the speech is, from a WAV file's header (ms) */
export function wavDurationMs(wav: ArrayBuffer): number {
  if (wav.byteLength < 44) return 0;
  const v = new DataView(wav), rate = v.getUint32(24, true), bytesPerSample = v.getUint16(32, true);
  return rate && bytesPerSample ? Math.round(((wav.byteLength - 44) / (rate * bytesPerSample)) * 1000) : 0;
}

/** is this a mono 16-bit WAV at 16 or 24 kHz (what the transcribe endpoint accepts)? */
export function isSpeechWav(wav: ArrayBuffer): boolean {
  if (wav.byteLength < 46) return false;
  const v = new DataView(wav), tag = (at: number) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
  return tag(0) === 'RIFF' && tag(8) === 'WAVE' && v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1 && v.getUint16(34, true) === 16 && [16_000, 24_000].includes(v.getUint32(24, true));
}
