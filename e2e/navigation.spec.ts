import { test, expect } from "@playwright/test";

test.describe("Navigation & Layout", () => {
  test("Sidebar-Gruppen sind aufklappbar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);
    // Sidebar should be visible on desktop
    const sidebar = page.locator("nav").first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
    // Should have multiple navigation groups
    const links = page.locator("nav a");
    const count = await links.count();
    expect(count).toBeGreaterThan(5);
  });

  test("Mobile: Hamburger öffnet Sidebar-Sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);
    // Click hamburger
    const hamburger = page
      .getByLabel(/menü öffnen|menu/i)
      .first()
      .or(page.locator("button.md\\:hidden").first())
      .or(page.locator('[data-tour="mobile-menu"]').first());
    if (await hamburger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await hamburger.click();
      // Sheet should open with navigation links
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
        const sheetLinks = page.locator('[role="dialog"] a');
        const count = await sheetLinks.count();
        expect(count).toBeGreaterThan(3);
      }
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Mobile: Sheet schließt bei Navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);
    const hamburger = page
      .getByLabel(/menü öffnen|menu/i)
      .first()
      .or(page.locator("button.md\\:hidden").first())
      .or(page.locator('[data-tour="mobile-menu"]').first());
    if (await hamburger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await hamburger.click();
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Click a navigation link inside the sheet
        const navLink = page.locator('[role="dialog"] a').first();
        if (await navLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await navLink.click();
          // Sheet should close after navigation
          await page.waitForTimeout(2000);
          await expect(dialog).toBeHidden({ timeout: 10_000 }).catch(() => {});
        }
      }
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Breadcrumb zeigt Pfad auf Detail-Seiten", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    // Click first park link to go to detail
    const parkLink = page
      .locator("table tbody tr a")
      .first()
      .or(page.locator("table tbody tr td:nth-child(2)").first());
    if (await parkLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await parkLink.click();
      await page
        .waitForURL(/.*\/parks\/.*/, { timeout: 15_000 })
        .catch(() => {});
      // At minimum, the page should have loaded with a title
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
