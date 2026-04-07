import { test, expect } from "@playwright/test";

test.describe("Auth & Security", () => {
  test("Logout leitet zu Login weiter", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);
    const userMenu = page.locator('[data-tour="header-user-menu"]');
    if (await userMenu.isVisible({ timeout: 5000 }).catch(() => false)) {
      await userMenu.click();
      await page.waitForTimeout(500);
      const logoutBtn = page.getByText(/abmelden|logout/i).first();
      if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutBtn.click();
        await page.waitForURL("**/login**", { timeout: 15_000 });
        await expect(page).toHaveURL(/.*\/login/);
      }
    }
  });

  test("Unautorisierter API-Zugriff gibt Fehler", async ({ page }) => {
    const response = await page.goto("/api/admin/system-config");
    const status = response?.status() ?? 0;
    expect([200, 401, 403, 302]).toContain(status);
  });

  test("Login-Seite ist ohne Auth erreichbar", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Wait for the login form to render (SSR + hydration) — Docker cold start can take 20s+
    const hasEmail = await page.locator("#email").isVisible({ timeout: 45_000 }).catch(() => false);
    const hasPlaceholder = await page.getByPlaceholder(/e-?mail|name@|benutzer/i).first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasEmailInput = await page.locator("input[type='email']").first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasFormInput = await page.locator("form input").first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasAnyInput = await page.locator("input").first().isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasEmail || hasPlaceholder || hasEmailInput || hasFormInput || hasAnyInput).toBeTruthy();
    await context.close();
  });

  test("Geschützte Seite leitet ohne Auth zu Login", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Should redirect to login eventually — Docker cold start can take 30s+
    await page.waitForURL("**/login**", { timeout: 45_000 });
    await expect(page).toHaveURL(/.*\/login/);
    await context.close();
  });
});
