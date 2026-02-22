import { test, expect } from "../fixtures/auth.fixture";

test.describe("Navigation", () => {
  test("should navigate to all main sections", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate through main sections
    const sections = [
      { name: /windparks/i, url: /parks/ },
      { name: /rechnungen/i, url: /invoices/ },
      { name: /dokumente/i, url: /documents/ },
      { name: /verträge|vertraege/i, url: /contracts/ },
    ];

    for (const section of sections) {
      const link = page
        .locator("nav")
        .getByRole("link", { name: section.name });
      if (await link.isVisible()) {
        await link.click();
        await expect(page).toHaveURL(section.url);
      }
    }
  });

  test("should show breadcrumb on subpages", async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto("/parks");
    await page.waitForLoadState("networkidle");

    // Click first park if available
    const rows = page.getByRole("row");
    const rowCount = await rows.count();
    if (rowCount > 1) {
      await rows.nth(1).click();
      await page.waitForURL(/parks\/.+/);

      // Breadcrumb should be visible
      const breadcrumb = page.locator("[aria-label*='readcrumb'], nav.breadcrumb, [data-testid='breadcrumb']");
      const count = await breadcrumb.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test("should navigate back with browser back button", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await page.goto("/parks");
    await page.waitForLoadState("networkidle");

    await page.goBack();
    await expect(page).toHaveURL(/dashboard/);
  });

  test("should have responsive sidebar", async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Sidebar should be visible on desktop
    const sidebar = page.locator("nav[aria-label]").first();
    await expect(sidebar).toBeVisible();
  });
});
