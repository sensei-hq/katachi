import { defineConfig } from '@playwright/test';

// The film capture (docs/tasks/T8-film-capture.md): the real app at 1920x1080, recorded to video.
// Local iteration runs against the dev server; the final capture sets FILM_BASE_URL to the public site
// (katachi.sensei-hq.com) — then no dev server is started and the gate runs against that host.
// FILM_LIVE=1 (or META_API_KEY in the environment) runs the models live; otherwise the films replay.
// FILM_REPLAY=1 forces the replay even with a key (cheap dry runs).
const baseURL = process.env.FILM_BASE_URL ?? 'http://127.0.0.1:5174';
const local = !process.env.FILM_BASE_URL;
export default defineConfig({
  testDir: './tests/film', testMatch: '**/*.film.ts', timeout: 900_000, workers: 1, reporter: 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL, storageState: 'test-results/.auth/session.json', trace: 'retain-on-failure',
    viewport: { width: 1920, height: 1080 }, video: { mode: 'on', size: { width: 1920, height: 1080 } },
    launchOptions: { slowMo: 60, args: ['--no-sandbox', '--disable-gpu'] } },
  ...(local ? { webServer: { command: 'bun run dev', url: 'http://127.0.0.1:5174/', reuseExistingServer: true, timeout: 120000 } } : {}),
});
