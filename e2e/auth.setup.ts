import { test as setup, expect } from "@playwright/test";
import path from "node:path";

/**
 * Auth Setup — einmal pro Test-Run ausgeführt, speichert Session-Cookies
 * in `e2e/.auth/user.json`. Alle Tests im `chromium`-Projekt übernehmen
 * diesen State via `storageState` und starten bereits eingeloggt.
 */

const authFile = path.join(__dirname, ".auth/user.json");

const TEST_EMAIL = process.env.E2E_EMAIL || "admin@windparkmanager.de";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "admin123";

setup("authenticate", async ({ page }) => {
  setup.setTimeout(60_000);

  // Navigate to login — use domcontentloaded to avoid waiting for slow assets
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Dismiss cookie banner if visible
  const cookieBtn = page.getByRole("button", { name: /verstanden/i });
  if (await cookieBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await cookieBtn.click();
  }

  // Wait for form to be interactive
  const emailInput = page.getByLabel(/e-?mail/i);
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });

  await emailInput.fill(TEST_EMAIL);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /anmelden|login|einloggen/i }).click();

  // Wait for redirect to dashboard (generous timeout for cold dev server)
  await page.waitForURL("**/dashboard**", { timeout: 45_000 });
  await expect(page).toHaveURL(/.*\/dashboard/);

  // Dismiss the onboarding tour (driver.js) so its overlay doesn't intercept
  // clicks and screenshots in subsequent tests. Persists via user-scoped API,
  // so the tour won't re-appear for this test user on later runs.
  await page.request
    .put("/api/user/onboarding", {
      data: { skippedAt: new Date().toISOString() },
    })
    .catch(() => {
      /* non-critical — the tour may simply not be shown for this user */
    });

  // If the tour popover is already rendered on this page load, close it too.
  const tourClose = page.locator(".driver-popover-close-btn").first();
  if (await tourClose.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await tourClose.click().catch(() => {});
  }

  await page.context().storageState({ path: authFile });
});
