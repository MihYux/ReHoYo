import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  expect: { timeout: 20_000 },
  use: { baseURL: "http://localhost:3000", viewport: { width: 1440, height: 1000 }, channel: "chrome" },
  webServer: { command: "npm run dev:web", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
