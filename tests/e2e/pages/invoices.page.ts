import { type Page, type Locator, expect } from "@playwright/test";

export class InvoicesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /rechnungen/i });
    this.table = page.getByRole("table");
    this.rows = page.getByRole("row");
  }

  async goto() {
    await this.page.goto("/invoices");
  }

  async expectInvoicesListed() {
    await expect(this.heading).toBeVisible({ timeout: 10000 });
    await expect(this.table).toBeVisible();
  }

  async clickInvoice(number: string) {
    const row = this.page.getByRole("row").filter({ hasText: number });
    await row.click();
  }

  async expectInvoiceDetail() {
    await expect(
      this.page.getByText(/RE-|GS-|rechnung/i)
    ).toBeVisible({ timeout: 10000 });
  }

  async downloadPDF() {
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.page.getByRole("button", { name: /pdf/i }).click(),
    ]);
    return download;
  }
}
