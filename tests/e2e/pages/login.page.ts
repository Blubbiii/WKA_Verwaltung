import { type Page, type Locator, expect } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel("E-Mail");
    this.passwordInput = page.getByLabel("Passwort");
    this.submitButton = page.getByRole("button", { name: /anmelden/i });
    this.errorMessage = page.getByRole("alert");
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectLoginSuccess() {
    await this.page.waitForURL("**/dashboard**", { timeout: 10000 });
    await expect(this.page).toHaveURL(/dashboard/);
  }

  async expectLoginError() {
    await expect(this.errorMessage).toBeVisible({ timeout: 5000 });
  }
}
