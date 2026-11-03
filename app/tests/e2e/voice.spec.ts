import { test, expect, type Page, type Route } from '@playwright/test';

// Push-to-talk in the chat (Muse Voice Transcribe): hold the mic, speak, let go. Chromium's fake microphone stands in
// for a voice; /api/voice is routed, so this checks what the browser sends (a 16 kHz mono WAV) and that the text
// comes back into the chat as your message, the same as typing it.
const chat = (page: Page) => page.getByRole('complementary', { name: 'Katachi chat' });
const mic = (page: Page) => chat(page).locator('[data-voice]');

test.use({ launchOptions: { args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }, permissions: ['microphone'] });

async function hold(page: Page, ms: number) {
  const b = mic(page);
  await expect(b).toHaveAttribute('data-voice', 'idle', { timeout: 30_000 });
  const box = (await b.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // the dev server's first load can still be hydrating: press again until the button takes it
  for (let tries = 0; ; tries++) {
    await page.mouse.down();
    try { await expect(b).toHaveAttribute('data-voice', 'listening', { timeout: 4_000 }); break; } catch (e) { await page.mouse.up(); if (tries >= 4) throw e; await page.waitForTimeout(500); }
  }
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('hold the mic, let go: a 16 kHz WAV goes to Muse Voice Transcribe and what you said lands as your message', async ({ page }) => {
  let wav: Buffer | null = null;
  await page.route('**/api/voice', async (r: Route) => {
    wav = r.request().postDataBuffer();
    await new Promise((res) => setTimeout(res, 400));
    return r.fulfill({ json: { transcript: 'hello Katachi, what can you make', source: 'live', trace: [{ model: 'muse-voice-transcribe-1.0', purpose: 'transcribe', latencyMs: 300, costUsd: 0.0001 }] } });
  });
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await hold(page, 1500);
  await expect(mic(page)).toHaveAttribute('data-voice', 'transcribing');
  await expect(chat(page).locator('[data-timeline-entry="user"]').last()).toContainText('hello Katachi, what can you make', { timeout: 15_000 });
  await expect(mic(page)).toHaveAttribute('data-voice', 'idle');
  // what the browser sent: RIFF/WAVE, mono, 16-bit, 16 kHz, about the 1.5 s held
  expect(wav).not.toBeNull();
  const b = wav!;
  expect(b.subarray(0, 4).toString()).toBe('RIFF');
  expect(b.subarray(8, 12).toString()).toBe('WAVE');
  expect([b.readUInt16LE(22), b.readUInt32LE(24), b.readUInt16LE(34)]).toEqual([1, 16_000, 16]);
  const seconds = (b.length - 44) / 32_000;
  expect(seconds).toBeGreaterThan(0.8); expect(seconds).toBeLessThan(3);
});

test('a tap is not speech, and a missing key is said in the chat', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/voice', (r: Route) => { calls++; return r.fulfill({ status: 503, json: { transcript: '', source: 'fixture', reason: 'voice needs the Meta key on the server', trace: [] } }); });
  await page.goto('/workshop'); await page.waitForLoadState('networkidle');
  await hold(page, 100);
  await expect(chat(page)).toContainText('Hold the mic while you speak, then let go.', { timeout: 10_000 });
  expect(calls).toBe(0);
  await hold(page, 1200);
  await expect(chat(page)).toContainText('Couldn’t transcribe that: voice needs the Meta key on the server.', { timeout: 15_000 });
  expect(calls).toBe(1);
});
