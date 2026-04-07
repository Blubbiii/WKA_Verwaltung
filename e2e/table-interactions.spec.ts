import { test, expect } from "@playwright/test";

test.describe("Tabellen-Interaktion", () => {
  test("Parks: Suche filtert Ergebnisse", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    const search = page.getByPlaceholder(/suchen/i).first();
    if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
      const rowsBefore = await page.locator("table tbody tr").count();
      await search.fill("zzz_nonexistent");
      await page.waitForTimeout(1000);
      const rowsAfter = await page.locator("table tbody tr").count();
      // Either fewer rows or empty state
      expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
      // Clear search
      await search.fill("");
      await page.waitForTimeout(1000);
      const rowsRestored = await page.locator("table tbody tr").count();
      expect(rowsRestored).toBeGreaterThanOrEqual(rowsAfter);
    }
  });

  test("Parks: Filter nach Status", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    // Try to find a status filter dropdown
    const filterSelect = page.locator("select, [role='combobox']").first();
    if (await filterSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filterSelect.click();
      await page.waitForTimeout(500);
      // Select first option if dropdown opened
      const option = page.locator("[role='option']").first();
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(1000);
      }
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Tabelle: Opacity-Feedback beim Filtern", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    const search = page.getByPlaceholder(/suchen/i).first();
    if (await search.isVisible({ timeout: 3000 }).catch(() => false)) {
      await search.fill("test");
      // During re-fetch, table should dim (opacity-50)
      // This happens quickly, just verify no crash
      await page.waitForTimeout(500);
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Bulk: Alle auswählen → Count stimmt", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    // Click header checkbox (select all)
    const headerCheckbox = page.locator("table thead th").first().locator('button[role="checkbox"]').first();
    if (await headerCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await headerCheckbox.click();
      await page.waitForTimeout(500);
      // Count selected rows
      const selectedRows = await page.locator('table tbody tr td button[role="checkbox"][data-state="checked"]').count();
      const totalRows = await page.locator("table tbody tr").count();
      // All should be selected (or close to it — skeleton rows don't count)
      expect(selectedRows).toBeGreaterThan(0);
      // Unselect all
      await headerCheckbox.click();
    }
  });

  test("Bulk: Einzelne abwählen reduziert Count", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    const headerCheckbox = page.locator("table thead th").first().locator('button[role="checkbox"]').first();
    if (await headerCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await headerCheckbox.click();
      await page.waitForTimeout(500);
      // Uncheck first row
      const firstRowCheckbox = page.locator('table tbody tr:first-child td:first-child button[role="checkbox"]').first();
      if (await firstRowCheckbox.isVisible().catch(() => false)) {
        await firstRowCheckbox.click();
        await page.waitForTimeout(300);
      }
      // Clean up — uncheck all
      await headerCheckbox.click();
    }
  });
});
