import { test as base, type Page } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(
      process.env.TEST_USER_EMAIL || "admin@windpark.test",
      process.env.TEST_USER_PASSWORD || "admin123"
    );
    await loginPage.expectLoginSuccess();
    await use(page);
  },
});

export { expect } from "@playwright/test";
