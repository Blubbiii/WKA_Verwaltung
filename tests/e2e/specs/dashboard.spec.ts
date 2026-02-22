import { test, expect } from "../fixtures/auth.fixture";
import { DashboardPage } from "../pages/dashboard.page";

test.describe("Dashboard", () => {
  test("should load dashboard after login", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.expectLoaded();
  });

  test("should display header with user info", async ({
    authenticatedPage,
  }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.expectLoaded();
    await expect(dashboard.header).toBeVisible();
  });

  test("should display sidebar navigation", async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.expectLoaded();
    await expect(dashboard.sidebar).toBeVisible();
  });

  test("should navigate to Parks via sidebar", async ({
    authenticatedPage,
  }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.expectLoaded();
    await dashboard.navigateTo("Windparks");
    await expect(authenticatedPage).toHaveURL(/parks/);
  });

  test("should navigate to Rechnungen via sidebar", async ({
    authenticatedPage,
  }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.expectLoaded();
    await dashboard.navigateTo("Rechnungen");
    await expect(authenticatedPage).toHaveURL(/invoices/);
  });

  test("should navigate to Dokumente via sidebar", async ({
    authenticatedPage,
  }) => {
    const dashboard = new DashboardPage(authenticatedPage);
    await dashboard.expectLoaded();
    await dashboard.navigateTo("Dokumente");
    await expect(authenticatedPage).toHaveURL(/documents/);
  });
});
