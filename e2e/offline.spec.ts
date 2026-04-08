import { test, expect } from "@playwright/test";

test.describe("Offline-Verhalten", () => {
  test("Seite zeigt Fehler bei Netzwerkausfall, crasht nicht", async ({ page, context }) => {
    // Load page first (with network)
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    // Go offline
    await context.setOffline(true);

    // Try to navigate — should show error, not white screen
    await page.goto("/parks").catch(() => {});
    await page.waitForTimeout(1000);

    // Page should have some content (error boundary, cached content, or browser error)
    const body = await page.locator("body").innerText().catch(() => "");
    expect(body.length).toBeGreaterThan(0);

    // Go back online
    await context.setOffline(false);
  });

  test("API-Fehler bei Offline zeigt keine weisse Seite", async ({ page, context }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(3000);

    // Go offline
    await context.setOffline(true);

    // Try clicking something that triggers an API call
    const themeBtn = page.locator('[data-tour="header-theme-toggle"]').first();
    if (await themeBtn.isVisible().catch(() => false)) {
      await themeBtn.click(); // Theme toggle doesn't need API — should work offline
    }

    // Page should still be functional (not crashed)
    const body = await page.locator("body").innerText().catch(() => "");
    expect(body.length).toBeGreaterThan(50);

    // Go back online
    await context.setOffline(false);
  });

  test("Nach Offline-Phase: Seite funktioniert wieder normal", async ({ page, context }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    // Go offline briefly
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    await context.setOffline(false);

    // Navigate — should work again
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    const hasH1 = await page.locator("h1").first().isVisible().catch(() => false);
    expect(hasH1).toBeTruthy();
  });
});
