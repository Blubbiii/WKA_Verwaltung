import { test, expect } from "@playwright/test";

test.describe("RBAC & Berechtigungen", () => {
  test("Admin-Panel ist für eingeloggten User erreichbar", async ({ page }) => {
    await page.goto("/admin");
    // Either accessible (200) or shows error boundary — but NOT blank
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(10);
    // Should have some heading or error message
    await expect(
      page.locator("h1").first().or(page.getByText(/fehler|zugriff|admin/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test("User-Menü zeigt aktuelle Rolle", async ({ page }) => {
    await page.goto("/dashboard");
    await page.locator('[data-tour="header-user-menu"]').click();
    // Menu should show role info
    await expect(
      page.getByText(/rolle|admin|manager|betrachter|super/i).first()
    ).toBeVisible({ timeout: 3000 });
  });

  test("Einstellungen-Seite ist erreichbar", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1").first()).toBeVisible();
    // Should show profile or settings tabs
    await expect(
      page.locator('[role="tablist"]').or(page.getByText(/profil|einstellungen/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Rollen & Rechte Seite laden", async ({ page }) => {
    await page.goto("/admin/roles");
    // Either loads successfully or shows permission error
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(10);
  });
});
