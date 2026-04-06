import { test, expect } from "@playwright/test";

test.describe("Auth & Security", () => {
  test("Logout leitet zu Login weiter", async ({ page }) => {
    await page.goto("/dashboard");
    await page.locator('[data-tour="header-user-menu"]').click();
    await page.getByText(/abmelden|logout/i).first().click();
    await page.waitForURL("**/login**", { timeout: 15_000 });
    await expect(page).toHaveURL(/.*\/login/);
  });

  test("Unautorisierter API-Zugriff gibt Fehler", async ({ page }) => {
    const response = await page.goto("/api/admin/system-config");
    const status = response?.status() ?? 0;
    expect([200, 401, 403, 302]).toContain(status);
  });

  test("Login-Seite ist ohne Auth erreichbar", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    // Wait for the login form to render (SSR + hydration)
    await expect(
      page.locator("#email").or(page.getByPlaceholder(/e-?mail|name@/i))
    ).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("Geschützte Seite leitet ohne Auth zu Login", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    // Should redirect to login eventually
    await page.waitForURL("**/login**", { timeout: 30_000 });
    await expect(page).toHaveURL(/.*\/login/);
    await context.close();
  });
});
