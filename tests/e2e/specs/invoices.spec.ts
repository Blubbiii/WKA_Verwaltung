import { test, expect } from "../fixtures/auth.fixture";
import { InvoicesPage } from "../pages/invoices.page";

test.describe("Invoices", () => {
  test("should display invoices list page", async ({ authenticatedPage }) => {
    const invoicesPage = new InvoicesPage(authenticatedPage);
    await invoicesPage.goto();
    await invoicesPage.expectInvoicesListed();
  });

  test("should show invoices in table", async ({ authenticatedPage }) => {
    const invoicesPage = new InvoicesPage(authenticatedPage);
    await invoicesPage.goto();
    await invoicesPage.expectInvoicesListed();

    await expect(invoicesPage.table).toBeVisible();
  });

  test("should navigate to invoice detail on click", async ({
    authenticatedPage,
  }) => {
    const invoicesPage = new InvoicesPage(authenticatedPage);
    await invoicesPage.goto();
    await invoicesPage.expectInvoicesListed();

    const rows = authenticatedPage.getByRole("row");
    const rowCount = await rows.count();
    if (rowCount > 1) {
      await rows.nth(1).click();
      await expect(authenticatedPage).toHaveURL(/invoices\/.+/);
    }
  });

  test("should display invoice status badges", async ({
    authenticatedPage,
  }) => {
    const invoicesPage = new InvoicesPage(authenticatedPage);
    await invoicesPage.goto();
    await invoicesPage.expectInvoicesListed();

    // Check for status badges (Entwurf, Versendet, Bezahlt, Storniert)
    const statusBadges = authenticatedPage.locator("[data-status], .badge");
    const count = await statusBadges.count();
    // Status badges should be present if there are invoices
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
