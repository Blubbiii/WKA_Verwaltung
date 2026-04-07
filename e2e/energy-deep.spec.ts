import { test, expect } from "@playwright/test";

test.describe("Energie/SCADA Detailliert", () => {
  test("Analytics: Alle Tabs durchklicken ohne Crash", async ({ page }) => {
    await page.goto("/energy/analytics");
    await page.waitForTimeout(3000);
    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();
    for (let i = 0; i < Math.min(tabCount, 6); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(1500);
      // Verify page didn't crash
      const body = await page.locator("body").innerText();
      expect(body).not.toContain("Unhandled Runtime Error");
    }
  });

  test("Produktion: Seite zeigt Tabelle oder Daten", async ({ page }) => {
    await page.goto("/energy/productions");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("Anomaly-Seite lädt und zeigt Liste oder Empty-State", async ({ page }) => {
    await page.goto("/energy/scada/anomalies");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    const hasContent = /anomalie|warnung|keine.*daten|erkennung/i.test(body);
    expect(hasContent || body.length > 100).toBeTruthy();
  });

  test("Settlements-Seite lädt", async ({ page }) => {
    await page.goto("/energy/settlements");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });
});
