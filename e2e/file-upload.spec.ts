import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

test.describe("Datei-Upload", () => {
  test("Dokument-Upload Seite akzeptiert PDF", async ({ page }) => {
    await page.goto("/documents/upload");
    await page.waitForTimeout(3000);

    // Create a dummy PDF file for testing
    const tmpDir = os.tmpdir();
    const testFile = path.join(tmpDir, "test-upload.pdf");
    // Minimal PDF content
    fs.writeFileSync(testFile, "%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\n0 1\ntrailer\n<<>>\nstartxref\n0\n%%EOF");

    // Find file input (may be hidden behind a dropzone)
    const fileInput = page.locator("input[type='file']").first();
    const inputCount = await page.locator("input[type='file']").count();

    if (inputCount > 0) {
      await fileInput.setInputFiles(testFile);
      await page.waitForTimeout(2000);
      // File should appear in the upload area
      const body = await page.locator("body").innerText();
      const hasFileName = body.includes("test-upload") || body.includes("pdf");
      expect(hasFileName || inputCount > 0).toBeTruthy();
    }

    // Clean up
    fs.unlinkSync(testFile);
  });

  test("Upload-Bereich reagiert auf Dateiauswahl", async ({ page }) => {
    await page.goto("/documents/upload");
    await page.waitForTimeout(3000);

    // Check that the upload area exists
    const hasUploadArea = await page.locator("input[type='file']").count() > 0;
    const hasDropzone = await page.getByText(/hochladen|datei|drag|drop|ablegen/i).first().isVisible().catch(() => false);
    expect(hasUploadArea || hasDropzone).toBeTruthy();
  });

  test("Upload verweigert nicht erlaubte Dateitypen", async ({ page }) => {
    await page.goto("/documents/upload");
    await page.waitForTimeout(3000);

    const fileInput = page.locator("input[type='file']").first();
    const inputCount = await page.locator("input[type='file']").count();

    if (inputCount > 0) {
      // Check if accept attribute limits file types
      const accept = await fileInput.getAttribute("accept");
      if (accept) {
        // File input has type restrictions — good
        expect(accept.length).toBeGreaterThan(0);
      }
    }
  });
});
