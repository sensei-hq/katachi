import { describe, it, expect } from 'vitest';
import { encodeWav, isSpeechWav, mono, resample, wavDurationMs } from './wav';

describe('speech as a WAV for Muse Voice Transcribe', () => {
  it('writes a mono 16-bit RIFF/WAVE at 16 kHz the endpoint accepts', () => {
    const tone = Float32Array.from({ length: 16_000 }, (_, i) => Math.sin(i / 10) * 0.5);
    const wav = encodeWav(tone);
    expect(wav.byteLength).toBe(44 + 32_000);
    expect(isSpeechWav(wav)).toBe(true);
    expect(wavDurationMs(wav)).toBe(1000);
    const v = new DataView(wav);
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(Math.abs(v.getInt16(44 + 2 * 16, true) - Math.sin(1.6) * 0.5 * 0x7fff)).toBeLessThanOrEqual(1);
  });
  it('clips loud samples instead of wrapping them', () => {
    const v = new DataView(encodeWav(Float32Array.of(2, -2)));
    expect([v.getInt16(44, true), v.getInt16(46, true)]).toEqual([0x7fff, -0x8000]);
  });
  it('mixes stereo down and resamples 48 kHz to 16 kHz', () => {
    const l = Float32Array.from({ length: 4800 }, () => 1), r = Float32Array.from({ length: 4800 }, () => 0);
    const m = mono([l, r]);
    expect(m[10]).toBeCloseTo(0.5);
    const down = resample(m, 48_000);
    expect(down.length).toBe(1600);
    expect(down[800]).toBeCloseTo(0.5);
  });
  it('turns away what the endpoint would not take', () => {
    expect(isSpeechWav(new ArrayBuffer(10))).toBe(false);
    expect(isSpeechWav(encodeWav(new Float32Array(100), 44_100))).toBe(false);
    expect(isSpeechWav(encodeWav(new Float32Array(100), 24_000))).toBe(true);
  });
});
