import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: join(tmpdir(), 'xiaodianji-browser-results'),
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
});
