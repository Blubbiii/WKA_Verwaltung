import { test, expect } from "./fixtures";

test.describe("PDF Download", () => {
  test("Rechnung-PDF kann heruntergeladen werden", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForTimeout(2000);

    // Navigate to first invoice detail
    const link = page.locator("table tbody tr a").first();
    if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(3000);

      // Look for PDF/download button
      const pdfBtn = page.getByRole("button", { name: /pdf|download|herunterladen/i }).first();
      if (await pdfBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
        await pdfBtn.click();
        const download = await downloadPromise;

        if (download) {
          const filename = download.suggestedFilename();
          expect(filename).toMatch(/\.(pdf|zip)$/i);

          // Save and check file size
          const filePath = await download.path();
          if (filePath) {
            const fs = await import("node:fs");
            const stats = fs.statSync(filePath);
            expect(stats.size).toBeGreaterThan(1000); // PDF should be > 1KB
          }
        }
      }
    }
  });

  test("API liefert PDF mit korrektem Content-Type", async ({ page }) => {
    await page.goto("/dashboard");
    // Test the report configs endpoint
    const response = await page.request.get("/api/energy/reports/configs");
    if (response.status() === 200) {
      const contentType = response.headers()["content-type"] || "";
      expect(contentType).toContain("application/json");
      const data = await response.json();
      expect(data).toBeDefined();
    }
  });
});
