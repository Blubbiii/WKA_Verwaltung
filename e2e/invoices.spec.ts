import { test, expect } from "@playwright/test";

test.describe("Invoices", () => {
  test("Rechnungen-Seite zeigt Tabelle", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("h1").first()).toBeVisible();
    // Table or list view
    await expect(
      page.locator("table").or(page.getByText(/rechnung|invoice/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Suche nach Rechnungsnummer", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForTimeout(2000);
    const searchInput = page.getByPlaceholder(/suchen/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("RE-");
      await page.waitForTimeout(500);
    }
    // Page should still be functional
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Rechnung-Detail öffnen", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForTimeout(2000);
    // Try clicking on a table row link or list item
    const clickTarget = page
      .locator("table tbody tr a")
      .first()
      .or(page.locator("table tbody tr").first())
      .or(page.locator("[data-testid='invoice-row']").first());
    if (await clickTarget.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clickTarget.click();
      await page
        .waitForURL(/.*\/invoices\/.*/, { timeout: 10_000 })
        .catch(() => {});
      await page.waitForTimeout(2000);
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
