import { defineConfig, devices } from "@playwright/test";

/**
 * Uji end-to-end terhadap aplikasi berjalan dengan data demo (`pnpm db:seed:demo`).
 * - Default: menjalankan `pnpm dev` otomatis di port 3000.
 * - E2E_BASE_URL=https://staging.contoh.id untuk menguji server yang sudah berjalan.
 * - PW_CHROMIUM_PATH untuk memakai Chromium yang sudah terpasang.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "id-ID",
    timezoneId: "Asia/Makassar",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 180_000 },
});
