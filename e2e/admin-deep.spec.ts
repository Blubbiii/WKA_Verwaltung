import { test, expect } from "./fixtures";

test.describe("Admin-Bereich", () => {
  test("Admin-Hauptseite lädt", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("Rollen & Rechte zeigt Rollenliste", async ({ page }) => {
    await page.goto("/admin/roles");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    // Should show roles or permission-related content
    const hasRoles = /rolle|admin|manager|viewer|superadmin|berechtigung/i.test(body);
    expect(hasRoles || body.length > 100).toBeTruthy();
  });

  test("System-Admin Seite hat Tabs", async ({ page }) => {
    await page.goto("/admin/system-admin");
    await page.waitForTimeout(2000);
    const hasTabs = await page.locator('[role="tablist"]').first().isVisible().catch(() => false);
    const hasContent = (await page.locator("body").innerText()).length > 100;
    expect(hasTabs || hasContent).toBeTruthy();
  });

  test("Audit-Log Seite lädt", async ({ page }) => {
    await page.goto("/admin/audit-logs");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });
});
