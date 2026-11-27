import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:18766',
    viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 18766 --bind 127.0.0.1',
    url: 'http://127.0.0.1:18766',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
