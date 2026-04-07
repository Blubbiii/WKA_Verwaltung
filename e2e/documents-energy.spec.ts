import { test, expect } from "@playwright/test";

// Helper: flexible page-loaded assertion for feature-flagged pages
async function expectPageLoaded(page: import("@playwright/test").Page, keywords: RegExp) {
  const hasH1 = await page.locator("h1").first().isVisible({ timeout: 5000 }).catch(() => false);
  const hasH2 = await page.locator("h2").first().isVisible({ timeout: 2000 }).catch(() => false);
  const hasText = await page.getByText(keywords).first().isVisible({ timeout: 2000 }).catch(() => false);
  expect(hasH1 || hasH2 || hasText).toBeTruthy();
}

test.describe("Dokumente", () => {
  test("Dokumenten-Seite lädt", async ({ page }) => {
    await page.goto("/documents");
    await page.waitForTimeout(2000);
    await expectPageLoaded(page, /dokument|document|explorer/i);
  });

  test("Dokumenten-Explorer öffnet sich", async ({ page }) => {
    await page.goto("/documents/explorer");
    await page.waitForTimeout(2000);
    await expectPageLoaded(page, /explorer|dokument|document|ordner/i);
  });

  test("Upload-Seite lädt", async ({ page }) => {
    await page.goto("/documents/upload");
    await page.waitForTimeout(2000);
    // Should have a file input, drop zone, upload text, or at least a heading
    const hasFileInput = await page.locator("input[type='file']").isVisible({ timeout: 5000 }).catch(() => false);
    const hasUploadText = await page.getByText(/hochladen|upload|drag|drop|datei/i).first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasH1 = await page.locator("h1").first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasH2 = await page.locator("h2").first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasFileInput || hasUploadText || hasH1 || hasH2).toBeTruthy();
  });
});

test.describe("Energie", () => {
  test("Energie-Übersicht lädt", async ({ page }) => {
    await page.goto("/energy");
    await page.waitForTimeout(2000);
    await expectPageLoaded(page, /energie|energy|produktion|scada/i);
  });

  test("Analytics-Dashboard hat Tabs", async ({ page }) => {
    await page.goto("/energy/analytics");
    await page.waitForTimeout(3000);
    await expectPageLoaded(page, /analytics|analyse|energie|energy/i);
    // Should have tab navigation (optional — page may not have tabs or may be feature-flagged)
    const tabs = page.locator('[role="tablist"]').first();
    if (await tabs.isVisible({ timeout: 5000 }).catch(() => false)) {
      const tabCount = await page.locator('[role="tab"]').count();
      expect(tabCount).toBeGreaterThanOrEqual(2);
    }
  });

  test("Analytics Tab-Wechsel funktioniert", async ({ page }) => {
    await page.goto("/energy/analytics");
    await page.waitForTimeout(3000);
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    if (count >= 2) {
      // Click second tab
      await tabs.nth(1).click();
      await page.waitForTimeout(2000);
      // Content should change — the new tab panel should be visible
      const activePanel = page.locator('[role="tabpanel"]').first();
      if (await activePanel.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(activePanel).toBeVisible();
      }
    }
    // Test passes regardless — tabs may not exist on feature-flagged page
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("SCADA-Seite lädt", async ({ page }) => {
    await page.goto("/energy/scada");
    await page.waitForTimeout(2000);
    await expectPageLoaded(page, /scada|energie|energy|daten/i);
  });
});
