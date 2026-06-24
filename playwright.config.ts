// Copyright 2026 Beacon Contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5174";
const base = new URL(baseURL);
const localWebServer = ["127.0.0.1", "localhost", "::1"].includes(base.hostname);
const webServerHost = base.hostname === "localhost" ? "127.0.0.1" : base.hostname;
const webServerPort = base.port || "5174";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  webServer: localWebServer && process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1"
    ? {
        command: `npm run dev -- --host ${webServerHost} --port ${webServerPort}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL,
      }
    : undefined,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
  ],
});
