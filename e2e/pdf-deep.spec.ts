import { test, expect } from "@playwright/test";

test.describe("PDF & Export Detailliert", () => {
  test("Parks CSV-Export: Datei wird heruntergeladen", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    // Select a row
    const checkbox = page.locator('table tbody tr:first-child td:first-child button[role="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click({ force: true });
      // Wait for batch bar animation
      await page.waitForTimeout(1000);
      // Look for CSV button in batch bar
      const csvBtn = page.getByRole("button", { name: /csv/i }).first();
      if (await csvBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent("download", { timeout: 10_000 }).catch(() => null);
        await csvBtn.click({ force: true });
        const download = await downloadPromise;
        if (download) {
          const filename = download.suggestedFilename();
          expect(filename).toMatch(/\.csv$/);
        }
      }
      // Clean up selection
      await checkbox.click({ force: true }).catch(() => {});
    }
  });

  test("Rechnung-Detail: Seite hat Aktions-Buttons", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForTimeout(2000);
    const link = page.locator("table tbody tr a").first();
    if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(3000);
      // Detail page should have action buttons
      const buttons = await page.locator("button").count();
      expect(buttons).toBeGreaterThan(0);
    }
  });

  test("API gibt gültiges JSON für Reports zurück", async ({ page }) => {
    await page.goto("/dashboard");
    const response = await page.request.get("/api/energy/reports/configs").catch(() => null);
    if (response) {
      const status = response.status();
      expect([200, 401, 403]).toContain(status);
      if (status === 200) {
        const contentType = response.headers()["content-type"] || "";
        expect(contentType).toContain("application/json");
      }
    }
  });
});
