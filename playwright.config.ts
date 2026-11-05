import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 18099;
const dbDir = path.join(os.tmpdir(), `tack-e2e-${process.pid}`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // A fresh database every run. Tests make their own boards, so they don't affect each other.
    command: `rm -rf "${dbDir}" && mkdir -p "${dbDir}" && node server/dist/index.js`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    env: { DB_PATH: path.join(dbDir, 'tack.db'), PORT: String(PORT), HOST: '127.0.0.1' },
  },
});
