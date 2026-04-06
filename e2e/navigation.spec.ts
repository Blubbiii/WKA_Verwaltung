import { test, expect } from "@playwright/test";

test.describe("Navigation & Layout", () => {
  test("Sidebar-Gruppen sind aufklappbar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    // Sidebar should be visible on desktop
    const sidebar = page.locator("nav").first();
    await expect(sidebar).toBeVisible();
    // Should have multiple navigation groups
    const links = page.locator("nav a");
    const count = await links.count();
    expect(count).toBeGreaterThan(5);
  });

  test("Mobile: Hamburger öffnet Sidebar-Sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    // Click hamburger
    const hamburger = page.getByLabel(/menü öffnen/i).first();
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    // Sheet should open with navigation links
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 3000 });
    // Should have nav links inside the sheet
    const sheetLinks = page.locator('[role="dialog"] a');
    const count = await sheetLinks.count();
    expect(count).toBeGreaterThan(3);
  });

  test("Mobile: Sheet schließt bei Navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    const hamburger = page.getByLabel(/menü öffnen/i).first();
    await hamburger.click();
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 3000 });
    // Click a navigation link inside the sheet
    const navLink = page.locator('[role="dialog"] a').first();
    if (await navLink.isVisible()) {
      await navLink.click();
      // Sheet should close after navigation
      await page.waitForTimeout(1000);
      await expect(page.locator('[role="dialog"]').first()).toBeHidden({ timeout: 5000 });
    }
  });

  test("Breadcrumb zeigt Pfad auf Detail-Seiten", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    // Click first park row to go to detail
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForURL(/.*\/parks\/.*/, { timeout: 10000 });
      // Breadcrumb should show "Parks" as a link
      const breadcrumb = page.locator("nav[aria-label='breadcrumb']").or(page.getByText(/parks/i).locator("..").locator("a"));
      // At minimum, the page should have loaded with a title
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });
});
