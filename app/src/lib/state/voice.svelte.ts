// Push-to-talk for the chat: hold the mic to record, let go to send. The recording becomes a 16 kHz mono WAV in the
// browser and goes to /api/voice (Muse Voice Transcribe on the server); the text comes back and is sent as a chat
// message, exactly as if it had been typed. State only: the chat's mic button calls start() and stop().
import { encodeWav, mono, resample, SPEECH_RATE } from '../domain/wav';

export type VoiceStatus = 'idle' | 'listening' | 'transcribing';
const MIN_MS = 400;           // a tap, not speech
const MAX_MS = 60_000;        // a long hold stops itself

export class VoiceState {
  status = $state<VoiceStatus>('idle');
  /** the last thing that went wrong, said in the chat by the caller */
  problem = $state('');
  /** seconds held, for the mic button */
  seconds = $state(0);
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private started = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private done: Promise<Blob | null> | null = null;
  // let go while the browser is still asking for the microphone: don't start recording after all
  private starting = false;
  private cancelled = false;
  /** the browser can record (a secure page with a microphone API) */
  get supported() { return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'; }

  async start(): Promise<boolean> {
    if (this.status !== 'idle' || this.starting) return false;
    this.problem = ''; this.starting = true; this.cancelled = false;
    if (!this.supported) { this.problem = 'This browser can’t record from the microphone here — type it instead.'; return false; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.starting = false;
      this.problem = 'I need your permission to use the microphone — allow it in the browser’s address bar, then hold the mic again.';
      return false;
    }
    this.starting = false;
    if (this.cancelled) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; this.problem = 'The microphone is ready — hold it while you speak, then let go.'; return false; }
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.done = new Promise((res) => {
      this.rec!.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.rec!.onstop = () => res(this.chunks.length ? new Blob(this.chunks, { type: this.rec?.mimeType || 'audio/webm' }) : null);
    });
    this.rec.start(250);
    this.started = Date.now(); this.seconds = 0; this.status = 'listening';
    this.timer = setInterval(() => { this.seconds = Math.floor((Date.now() - this.started) / 1000); if (Date.now() - this.started > MAX_MS) void this.stop(); }, 250);
    return true;
  }

  /** let go: the text said, or null (too short, nothing heard, or a problem — see `problem`) */
  async stop(): Promise<string | null> {
    if (this.starting) { this.cancelled = true; return null; }
    if (this.status !== 'listening' || !this.rec) return null;
    const held = Date.now() - this.started;
    if (this.timer) clearInterval(this.timer);
    this.rec.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    const blob = await this.done;
    this.rec = null; this.stream = null;
    if (held < MIN_MS || !blob) { this.status = 'idle'; this.problem = 'Hold the mic while you speak, then let go.'; return null; }
    this.status = 'transcribing';
    try {
      const wav = await toSpeechWav(blob);
      const r = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
      const j = (await r.json().catch(() => ({}))) as { transcript?: string; reason?: string };
      const text = String(j.transcript ?? '').trim();
      if (!r.ok || !text) { this.problem = text ? '' : j.reason ? `Couldn’t transcribe that: ${j.reason}.` : 'I didn’t catch that — hold the mic and try again.'; return null; }
      return text;
    } catch {
      this.problem = 'Couldn’t transcribe that — try again, or type it.';
      return null;
    } finally {
      this.status = 'idle';
    }
  }
}

/** whatever the browser recorded (webm/opus, mp4/aac) → a 16 kHz mono WAV */
async function toSpeechWav(blob: Blob): Promise<ArrayBuffer> {
  const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('no AudioContext');
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
    return encodeWav(resample(mono(channels), audio.sampleRate, SPEECH_RATE), SPEECH_RATE);
  } finally {
    void ctx.close();
  }
}
