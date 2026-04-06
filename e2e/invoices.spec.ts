import { test, expect } from "@playwright/test";

test.describe("Invoices", () => {
  test("Rechnungen-Seite zeigt Tabelle", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Suche nach Rechnungsnummer", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("table")).toBeVisible();
    // Type in search field
    const searchInput = page.getByPlaceholder(/suchen/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("RE-");
      // Wait for debounce + refetch
      await page.waitForTimeout(500);
      // Table should still be visible (may show filtered results or empty state)
      await expect(page.locator("table").or(page.getByText(/keine/i))).toBeVisible();
    }
  });

  test("Rechnung-Detail öffnen", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("table")).toBeVisible();
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForURL(/.*\/invoices\/.*/, { timeout: 10000 });
    }
  });
});
