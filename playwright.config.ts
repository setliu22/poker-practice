import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node --import tsx apps/api/src/server.ts",
      url: "http://127.0.0.1:3002/api/health",
      reuseExistingServer: false,
      env: { POKER_DB: "data/browser-test.sqlite", PORT: "3002" },
      timeout: 60000,
    },
    {
      command: "npm exec vite -- --config apps/web/vite.config.ts",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: { WEB_PORT: "5174", API_TARGET: "http://127.0.0.1:3002" },
      timeout: 60000,
    },
  ],
});
