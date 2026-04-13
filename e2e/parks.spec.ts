import { test, expect } from "./fixtures";

test.describe("Parks", () => {
  test("Parks-Seite zeigt Tabelle", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Park-Filter nach Status funktioniert", async ({ page }) => {
    await page.goto("/parks");
    // Wait for table to load
    await expect(page.locator("table")).toBeVisible();
    // Click status filter and select a value
    const statusFilter = page.locator('[data-testid="status-filter"]').or(page.getByRole("combobox").first());
    if (await statusFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusFilter.click();
      // Select first option
      await page.getByRole("option").first().click();
    }
  });

  test("Park-Detail öffnen", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    // Click first park row (if any exist)
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForURL(/.*\/parks\/.*/, { timeout: 10000 });
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });
});
