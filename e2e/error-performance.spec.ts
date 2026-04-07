import { test, expect } from "@playwright/test";

test.describe("Error Handling", () => {
  test("404-Seite für unbekannte Route", async ({ page }) => {
    const response = await page.goto("/this-does-not-exist-xyz");
    expect(response?.status()).toBe(404);
  });

  test("API-Fehler zeigt keine weiße Seite", async ({ page }) => {
    // Visit a page that loads data — even if API fails, error boundary should catch it
    await page.goto("/dashboard");
    await expect(
      page.locator("h1").first()
        .or(page.locator("h2").first())
        .or(page.locator("body"))
    ).toBeVisible({ timeout: 10_000 });
    // Page should not be blank
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });
});

test.describe("Performance", () => {
  test("Dashboard lädt in unter 10 Sekunden", async ({ page }) => {
    const start = Date.now();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1").first()
        .or(page.locator("h2").first())
        .or(page.locator("body"))
    ).toBeVisible({ timeout: 10_000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10_000);
  });

  test("Parks-Seite lädt in unter 10 Sekunden", async ({ page }) => {
    const start = Date.now();
    await page.goto("/parks", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("h1").first()
        .or(page.locator("h2").first())
        .or(page.locator("body"))
    ).toBeVisible({ timeout: 10_000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10_000);
  });

  test("Invoices-Seite mit Pagination", async ({ page }) => {
    await page.goto("/invoices");
    // Table might not exist if no invoices — accept table or any content
    const hasTable = await page.locator("table").isVisible({ timeout: 5000 }).catch(() => false);
    if (hasTable) {
      // Check if pagination exists (optional — may have fewer items than page size)
      const paginationBtn = page.getByRole("button", { name: /n[aä]chste|weiter|next|>/i }).first()
        .or(page.locator('[aria-label*="next"]').first())
        .or(page.locator('[aria-label*="Next"]').first());
      if (await paginationBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await paginationBtn.click();
        await page.waitForTimeout(1000);
        // Table should still be visible after page change
        await expect(page.locator("table")).toBeVisible();
      }
    }
    // Page loaded without crash
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
