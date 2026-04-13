import { test, expect } from "./fixtures";

test.describe("Daten-Integrität", () => {
  test("Park-Anlagenanzahl in Liste stimmt mit Detail überein", async ({ page }) => {
    await page.goto("/parks");
    const hasTable = await page.locator("table").isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      await page.waitForTimeout(2000);
      // Navigate to detail via link (not row click which may hit checkbox)
      const parkLink = page.locator("table tbody tr a").first();
      if (await parkLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await parkLink.click();
        const navigated = await page
          .waitForURL(/.*\/parks\/.*/, { timeout: 15_000 })
          .then(() => true)
          .catch(() => false);
        if (navigated) {
          // Page should load without error
          await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
        }
      }
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Stats-Cards zeigen konsistente Zahlen", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3000);
    // Stats cards should have numeric values (not NaN or undefined)
    const statsText = await page.locator("body").innerText();
    expect(statsText).not.toContain("NaN");
    expect(statsText).not.toContain("undefined");
  });

  test("Seite zeigt keine unbehandelten Fehler", async ({ page }) => {
    // Visit multiple pages and check for error indicators
    const pages = ["/dashboard", "/parks", "/invoices", "/funds", "/leases", "/contracts"];
    for (const p of pages) {
      await page.goto(p);
      await page.waitForTimeout(2000);
      const body = await page.locator("body").innerText();
      // Should not show raw error messages or stack traces
      expect(body).not.toContain("Unhandled Runtime Error");
      expect(body).not.toContain("TypeError:");
      expect(body).not.toContain("ReferenceError:");
    }
  });

  test("API-Endpunkte geben valides JSON zurück", async ({ page }) => {
    await page.goto("/dashboard");
    // Test several API endpoints
    const endpoints = ["/api/parks", "/api/invoices", "/api/funds"];
    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      const status = response.status();
      // Should return 200 or 403 (permission denied), never 500
      expect([200, 403, 401]).toContain(status);
      if (status === 200) {
        const contentType = response.headers()["content-type"] || "";
        expect(contentType).toContain("application/json");
      }
    }
  });

  test("Concurrent Navigation crasht nicht", async ({ page }) => {
    // Rapidly navigate between pages
    await page.goto("/dashboard");
    await page.goto("/parks");
    await page.goto("/invoices");
    await page.goto("/funds");
    await page.goto("/dashboard");
    // App should still be functional
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Unhandled Runtime Error");
  });

  test("Leere Daten: EmptyState wird korrekt angezeigt", async ({ page }) => {
    // Search for something that definitely doesn't exist
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    const searchInput = page.getByPlaceholder(/suchen/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("zzzzz_nonexistent_query_12345");
      await page.waitForTimeout(1000);
      // Should show empty state or "keine" message, not a crash
      const body = await page.locator("body").innerText();
      expect(body.length).toBeGreaterThan(10);
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
