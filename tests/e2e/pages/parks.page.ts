import { type Page, type Locator, expect } from "@playwright/test";

export class ParksPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /windparks/i });
    this.table = page.getByRole("table");
    this.rows = page.getByRole("row");
  }

  async goto() {
    await this.page.goto("/parks");
  }

  async expectParksListed() {
    await expect(this.heading).toBeVisible({ timeout: 10000 });
    await expect(this.table).toBeVisible();
  }

  async clickPark(name: string) {
    const row = this.page.getByRole("row").filter({ hasText: name });
    await row.click();
  }

  async expectParkDetail(name: string) {
    await expect(this.page.getByRole("heading", { name })).toBeVisible({
      timeout: 10000,
    });
  }

  async getParkCount() {
    // Subtract 1 for header row
    const count = await this.rows.count();
    return Math.max(0, count - 1);
  }
}
