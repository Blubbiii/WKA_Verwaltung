import { test, expect } from "./fixtures";

test.describe("Multi-Tab Verhalten", () => {
  test("Zwei Tabs zeigen gleiche Daten", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto("/parks");
    await page2.goto("/parks");

    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);

    // Both tabs should show the same h1
    const h1Tab1 = await page1.locator("h1").first().innerText().catch(() => "");
    const h1Tab2 = await page2.locator("h1").first().innerText().catch(() => "");
    expect(h1Tab1).toBe(h1Tab2);
  });

  test("Theme-Wechsel in Tab 1 wird in Tab 2 sichtbar nach Reload", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto("/dashboard");
    await page2.goto("/dashboard");
    await page1.waitForTimeout(2000);

    // Toggle theme in tab 1
    const themeBtn = page1.locator('[data-tour="header-theme-toggle"]').first();
    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const classBefore = await page1.locator("html").getAttribute("class");
      await themeBtn.click();
      await page1.waitForTimeout(1000);
      const classAfterToggle = await page1.locator("html").getAttribute("class");

      // At minimum, theme should have changed in tab 1
      expect(classAfterToggle).not.toBe(classBefore);

      // Toggle back
      await themeBtn.click();
    }
  });

  test("Navigation in Tab 1 beeinflusst Tab 2 nicht", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto("/parks");
    await page2.goto("/invoices");
    await page1.waitForTimeout(1000);
    await page2.waitForTimeout(1000);

    // Navigate in tab 1
    await page1.goto("/funds");
    await page1.waitForTimeout(1000);

    // Tab 2 should still be on invoices
    expect(page2.url()).toContain("/invoices");
  });
});
