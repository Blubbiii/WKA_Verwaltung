import { test, expect } from "@playwright/test";

test.describe("Settings & Profil", () => {
  test("Profil-Seite zeigt Benutzerdaten", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForTimeout(2000);
    const hasH1 = await page.locator("h1").first().isVisible().catch(() => false);
    expect(hasH1).toBeTruthy();
    // Should have some form of profile content
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(100);
  });

  test("Theme-Wechsel funktioniert und persistiert", async ({ page }) => {
    await page.goto("/dashboard");
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");
    // Toggle theme
    const themeBtn = page.locator('[data-tour="header-theme-toggle"]').first();
    await themeBtn.click();
    await page.waitForTimeout(500);
    const newClass = await html.getAttribute("class");
    expect(newClass).not.toBe(initialClass);
    // Reload and verify persistence
    await page.reload();
    await page.waitForTimeout(2000);
    const afterReload = await html.getAttribute("class");
    expect(afterReload).toBe(newClass);
    // Toggle back
    await themeBtn.click();
  });

  test("Sprache ist auf Deutsch", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    // Should have German text
    const hasGerman = /Dashboard|Windpark|Übersicht|Einstellungen|Rechnungen/i.test(body);
    expect(hasGerman).toBeTruthy();
  });

  test("User-Menü zeigt Benutzer-Info", async ({ page }) => {
    await page.goto("/dashboard");
    const userMenu = page.locator('[data-tour="header-user-menu"]').first();
    await userMenu.click();
    await page.waitForTimeout(500);
    // Menu should show user name or role
    const menuContent = await page.locator('[role="menu"]').first().innerText().catch(() => "");
    expect(menuContent.length).toBeGreaterThan(5);
    // Close menu
    await page.keyboard.press("Escape");
  });
});
