import { type Page, type Locator, expect } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly sidebar: Locator;
  readonly header: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.sidebar = page.locator("nav[aria-label]").first();
    this.header = page.locator("header").first();
  }

  async goto() {
    await this.page.goto("/dashboard");
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/dashboard/);
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }

  async getWidgetCount() {
    const widgets = this.page.locator("[data-widget-id]");
    return widgets.count();
  }

  async navigateTo(menuItem: string) {
    const link = this.sidebar.getByRole("link", { name: new RegExp(menuItem, "i") });
    await link.click();
  }
}
