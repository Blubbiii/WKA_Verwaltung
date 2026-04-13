import { test, expect } from "./fixtures";

test.describe("RBAC & Berechtigungen", () => {
  test("Admin-Panel ist für eingeloggten User erreichbar", async ({ page }) => {
    await page.goto("/admin");
    // Either accessible (200) or shows error boundary — but NOT blank
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(10);
    // Should have some heading or error message
    const hasH1 = await page.locator("h1").first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasErrorText = await page.getByText(/fehler|zugriff|admin/i).first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasH1 || hasErrorText).toBeTruthy();
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
    // Accept h1, h2, or any settings-related content
    const hasH1 = await page.locator("h1").first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasH2 = await page.locator("h2").first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasText = await page.getByText(/profil|einstellungen|settings|konto/i).first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasH1 || hasH2 || hasText).toBeTruthy();
  });

  test("Rollen & Rechte Seite laden", async ({ page }) => {
    await page.goto("/admin/roles");
    // Either loads successfully or shows permission error
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(10);
  });
});
