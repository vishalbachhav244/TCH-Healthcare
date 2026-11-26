import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 65_000,
  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4317',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
