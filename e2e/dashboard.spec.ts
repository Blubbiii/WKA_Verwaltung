import { test, expect } from "./fixtures";

test.describe("Dashboard", () => {
  test("Dashboard zeigt Widget-Cards", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1").first()).toBeVisible();
    // Should have at least one widget card (react-grid-layout items)
    await page.waitForTimeout(2000); // Wait for widgets to load
    const widgets = page.locator("[class*='react-grid-item']").or(page.locator("[data-grid]"));
    // If grid layout is used, check for cards; otherwise check for any content sections
    const cards = page.locator(".rounded-lg.border, .rounded-xl.border, [class*='card']");
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test("Theme bleibt nach Reload erhalten", async ({ page }) => {
    await page.goto("/dashboard");
    const html = page.locator("html");

    // Toggle to dark mode
    await page.locator('[data-tour="header-theme-toggle"]').click();
    await page.waitForTimeout(500);
    const themeAfterToggle = await html.getAttribute("class");

    // Reload page
    await page.reload();
    await page.waitForTimeout(1000);
    const themeAfterReload = await html.getAttribute("class");

    // Theme should persist
    expect(themeAfterReload).toBe(themeAfterToggle);

    // Toggle back to restore original state
    await page.locator('[data-tour="header-theme-toggle"]').click();
  });

  test("Benachrichtigungen-Seite lädt", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page.locator("h1").first()).toBeVisible();
  });
});
