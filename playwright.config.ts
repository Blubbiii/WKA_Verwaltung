import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Config für WindparkManager
 *
 * Run:
 *   npm run test:e2e           # headless
 *   npm run test:e2e:ui        # mit UI-Modus
 *   npm run test:e2e:headed    # sichtbarer Browser
 *
 * Voraussetzung: Dev-Server läuft auf http://localhost:3050
 * (wird automatisch gestartet, wenn nicht bereits aktiv).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Shared auth state — sequential is safer
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["html", { open: "never" }], ["list"]],

  timeout: 60_000,

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3050",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "de-DE",
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 14"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer:
    process.env.CI || process.env.E2E_BASE_URL
      ? undefined
      : {
          command: "npm run dev",
          url: "http://localhost:3050",
          reuseExistingServer: true,
          timeout: 120_000,
        },
});
