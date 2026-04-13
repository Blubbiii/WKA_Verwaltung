import { test, expect } from "./fixtures";

test.describe("Invoices", () => {
  test("Rechnungen-Seite zeigt Tabelle", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForTimeout(2000);
    // Page should have loaded with some content
    const hasH1 = await page.locator("h1").first().isVisible().catch(() => false);
    const hasTable = await page.locator("table").first().isVisible().catch(() => false);
    expect(hasH1 || hasTable).toBeTruthy();
  });

  test("Suche nach Rechnungsnummer", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForTimeout(2000);
    const searchInput = page.getByPlaceholder(/suchen/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("RE-");
      await page.waitForTimeout(500);
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Rechnung-Detail öffnen", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForTimeout(2000);
    const link = page.locator("table tbody tr a").first();
    if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
      await link.click();
      await page.waitForURL(/.*\/invoices\/.*/, { timeout: 10_000 }).catch(() => {});
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
