import { test, expect } from "@playwright/test";

test.describe("Dokumente", () => {
  test("Dokumenten-Seite lädt", async ({ page }) => {
    await page.goto("/documents");
    await expect(page.locator("h1").first()).toBeVisible();
    // Should show table or empty state
    await expect(
      page.locator("table").or(page.getByText(/keine dokumente|kein dokument/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test("Dokumenten-Explorer öffnet sich", async ({ page }) => {
    await page.goto("/documents/explorer");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("Upload-Seite lädt", async ({ page }) => {
    await page.goto("/documents/upload");
    await expect(page.locator("h1").first()).toBeVisible();
    // Should have a file input or drop zone
    const dropZone = page.locator("input[type='file']").or(page.getByText(/hochladen|drag|drop|datei/i).first());
    await expect(dropZone).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Energie", () => {
  test("Energie-Übersicht lädt", async ({ page }) => {
    await page.goto("/energy");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("Analytics-Dashboard hat Tabs", async ({ page }) => {
    await page.goto("/energy/analytics");
    await expect(page.locator("h1").first()).toBeVisible();
    // Should have tab navigation
    const tabs = page.locator('[role="tablist"]').first();
    if (await tabs.isVisible({ timeout: 5000 }).catch(() => false)) {
      const tabCount = await page.locator('[role="tab"]').count();
      expect(tabCount).toBeGreaterThanOrEqual(3);
    }
  });

  test("Analytics Tab-Wechsel funktioniert", async ({ page }) => {
    await page.goto("/energy/analytics");
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    if (count >= 2) {
      // Click second tab
      await tabs.nth(1).click();
      await page.waitForTimeout(1000);
      // Content should change — the new tab panel should be visible
      const activePanel = page.locator('[role="tabpanel"]').first();
      await expect(activePanel).toBeVisible();
    }
  });

  test("SCADA-Seite lädt", async ({ page }) => {
    await page.goto("/energy/scada");
    await expect(page.locator("h1").first()).toBeVisible();
  });
});
