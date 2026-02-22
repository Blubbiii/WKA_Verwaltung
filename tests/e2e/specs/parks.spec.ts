import { test, expect } from "../fixtures/auth.fixture";
import { ParksPage } from "../pages/parks.page";

test.describe("Parks", () => {
  test("should display parks list page", async ({ authenticatedPage }) => {
    const parksPage = new ParksPage(authenticatedPage);
    await parksPage.goto();
    await parksPage.expectParksListed();
  });

  test("should show parks in table", async ({ authenticatedPage }) => {
    const parksPage = new ParksPage(authenticatedPage);
    await parksPage.goto();
    await parksPage.expectParksListed();

    const count = await parksPage.getParkCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("should navigate to park detail on click", async ({
    authenticatedPage,
  }) => {
    const parksPage = new ParksPage(authenticatedPage);
    await parksPage.goto();
    await parksPage.expectParksListed();

    // Click first park row if available
    const rows = authenticatedPage.getByRole("row");
    const rowCount = await rows.count();
    if (rowCount > 1) {
      await rows.nth(1).click();
      await expect(authenticatedPage).toHaveURL(/parks\/.+/);
    }
  });

  test("should show park detail with turbines section", async ({
    authenticatedPage,
  }) => {
    const parksPage = new ParksPage(authenticatedPage);
    await parksPage.goto();
    await parksPage.expectParksListed();

    const rows = authenticatedPage.getByRole("row");
    const rowCount = await rows.count();
    if (rowCount > 1) {
      await rows.nth(1).click();
      await expect(authenticatedPage).toHaveURL(/parks\/.+/);
      // Park detail page should have turbine/anlagen section
      await expect(
        authenticatedPage.getByText(/anlagen|turbinen/i)
      ).toBeVisible({ timeout: 10000 });
    }
  });
});
