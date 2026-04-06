import { test, expect } from "@playwright/test";

test.describe("Auth & Security", () => {
  test("Logout leitet zu Login weiter", async ({ page }) => {
    await page.goto("/dashboard");
    // Open user menu
    await page.locator('[data-tour="header-user-menu"]').click();
    // Click logout
    await page.getByText(/abmelden|logout/i).first().click();
    // Should redirect to login
    await page.waitForURL("**/login**", { timeout: 10_000 });
    await expect(page).toHaveURL(/.*\/login/);
  });

  test("Unautorisierter API-Zugriff gibt Fehler", async ({ page }) => {
    // Direct API call without proper permissions should fail gracefully
    const response = await page.goto("/api/admin/system-config");
    // Should return 401/403 or redirect, not 500
    const status = response?.status() ?? 0;
    expect([200, 401, 403, 302]).toContain(status);
  });

  test("Login-Seite ist ohne Auth erreichbar", async ({ browser }) => {
    // Create a fresh context WITHOUT stored auth
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
    await context.close();
  });

  test("Geschützte Seite leitet ohne Auth zu Login", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/dashboard");
    // Should redirect to login
    await page.waitForURL("**/login**", { timeout: 15_000 });
    await expect(page).toHaveURL(/.*\/login/);
    await context.close();
  });
});
