import { test, expect } from "./fixtures";

/**
 * Smoke-Tests — bestätigen dass die wichtigsten Seiten ladbar sind.
 * Läuft mit gespeichertem Auth-State aus auth.setup.ts.
 */

test.describe("Smoke Tests", () => {
  test("Dashboard lädt und zeigt Begrüßung", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("body")).toContainText(
      /Hey|Guten Morgen|Guten Tag|Guten Abend|Mahlzeit|Übersicht|Dashboard/i
    );
  });

  test("Parks-Seite lädt", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page).toHaveURL(/.*\/parks/);
  });

  test("Rechnungen-Seite lädt", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page).toHaveURL(/.*\/invoices/);
  });

  test("User-Menü öffnet sich und zeigt Logout", async ({ page }) => {
    await page.goto("/dashboard");
    await page.locator('[data-tour="header-user-menu"]').click();
    await expect(page.getByText(/abmelden|logout/i).first()).toBeVisible();
  });

  test("Theme-Toggle funktioniert", async ({ page }) => {
    await page.goto("/dashboard");
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");

    await page.locator('[data-tour="header-theme-toggle"]').click();
    await page.waitForTimeout(300);

    const newClass = await html.getAttribute("class");
    expect(newClass).not.toBe(initialClass);
  });

  test("404-Seite wird für unbekannte Route angezeigt", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist-xyz");
    expect(response?.status()).toBe(404);
  });
});

test.describe("Responsive Layout", () => {
  test("Mobile: Hamburger-Button ist sichtbar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");

    const hamburger = page.getByLabel(/menü öffnen|menu/i).first();
    await expect(hamburger).toBeVisible();
  });

  test("Desktop: Hamburger versteckt", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");

    const hamburger = page.getByLabel(/menü öffnen/i).first();
    await expect(hamburger).toBeHidden();
  });
});
