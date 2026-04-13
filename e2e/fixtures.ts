/**
 * Custom Playwright test fixture.
 *
 * Extends the base `test` with route handlers that prevent flaky
 * first-time-user UI from intercepting clicks during E2E runs:
 *
 * - /api/user/onboarding — always returns a "skipped" state so the
 *   driver.js welcome tour never auto-triggers. Without this, the
 *   tour popover + overlay swallow pointer events on fresh test users.
 *
 * Usage:
 *   import { test, expect } from "./fixtures";
 */

import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/api/user/onboarding", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            completedTours: ["main"],
            lastTourVersion: 999,
            skippedAt: "2020-01-01T00:00:00.000Z",
          }),
        });
        return;
      }
      await route.continue();
    });

    await use(page);
  },
});

export { expect };
export type { Page, Locator } from "@playwright/test";
