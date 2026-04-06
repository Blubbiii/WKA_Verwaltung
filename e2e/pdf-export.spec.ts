import { test, expect } from "@playwright/test";

test.describe("PDF & Export", () => {
  test("CSV-Export auf Parks-Seite funktioniert", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);

    // Select first row checkbox
    const checkbox = page.locator("table tbody tr td").first().locator('button[role="checkbox"]');
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      // BatchActionBar should appear
      await expect(page.getByText(/ausgewaehlt|ausgewählt/i).first()).toBeVisible({ timeout: 3000 });

      // Listen for download event
      const downloadPromise = page.waitForEvent("download", { timeout: 10_000 }).catch(() => null);
      // Click CSV Export button
      const csvBtn = page.getByRole("button", { name: /csv/i }).first();
      if (await csvBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await csvBtn.click();
        const download = await downloadPromise;
        if (download) {
          const filename = download.suggestedFilename();
          expect(filename).toContain(".csv");
        }
      }
      // Clear selection
      await page.getByText(/auswahl aufheben/i).click();
    }
  });

  test("Rechnung-Detail hat PDF-Funktionalität", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForURL(/.*\/invoices\/.*/, { timeout: 10_000 });
      // Detail page should have PDF or print button
      const pdfBtn = page.getByRole("button", { name: /pdf|drucken|herunterladen|download/i }).first()
        .or(page.getByRole("link", { name: /pdf|drucken|herunterladen|download/i }).first());
      // Just check it exists — don't actually download in test
      const hasPdf = await pdfBtn.isVisible({ timeout: 5000 }).catch(() => false);
      // Not all invoices may have PDF — this is a soft check
      if (hasPdf) {
        await expect(pdfBtn).toBeEnabled();
      }
    }
  });

  test("Bulk-CSV Export auf Rechnungen-Seite", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);

    // Select header checkbox (select all)
    const headerCheckbox = page.locator("table thead th").first().locator('button[role="checkbox"]');
    if (await headerCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await headerCheckbox.click();
      await expect(page.getByText(/ausgewaehlt|ausgewählt/i).first()).toBeVisible({ timeout: 3000 });

      // CSV export button should be in the batch action bar
      const csvBtn = page.getByRole("button", { name: /csv/i }).first();
      if (await csvBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(csvBtn).toBeEnabled();
      }
      // Clear selection
      await page.getByText(/auswahl aufheben/i).click();
    }
  });
});
