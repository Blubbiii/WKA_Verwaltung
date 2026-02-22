import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

test.describe("Authentication", () => {
  test("should show login page", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test("should login with valid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(
      process.env.TEST_USER_EMAIL || "admin@windpark.test",
      process.env.TEST_USER_PASSWORD || "admin123"
    );
    await loginPage.expectLoginSuccess();
  });

  test("should show error with invalid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login("wrong@email.com", "wrongpassword");
    await loginPage.expectLoginError();
  });

  test("should redirect to login when accessing protected page", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });

  test("should redirect to login after logout", async ({ page }) => {
    // Login first
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(
      process.env.TEST_USER_EMAIL || "admin@windpark.test",
      process.env.TEST_USER_PASSWORD || "admin123"
    );
    await loginPage.expectLoginSuccess();

    // Logout
    const userMenu = page.getByRole("button", { name: /benutzer|profil|user/i });
    if (await userMenu.isVisible()) {
      await userMenu.click();
      const logoutButton = page.getByRole("menuitem", {
        name: /abmelden|logout/i,
      });
      await logoutButton.click();
      await expect(page).toHaveURL(/login/);
    }
  });
});
