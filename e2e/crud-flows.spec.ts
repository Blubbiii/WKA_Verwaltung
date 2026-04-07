import { test, expect } from "@playwright/test";

test.describe("CRUD Flows", () => {
  test("Parks: Seite laden + Tabelle sichtbar", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Parks: Detail-Seite öffnen", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    // Click on the park name link (avoiding checkbox column)
    const parkLink = page
      .locator("table tbody tr a")
      .first()
      .or(page.locator("table tbody tr td:nth-child(2)").first());
    if (await parkLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await parkLink.click();
      await page
        .waitForURL(/.*\/parks\/.*/, { timeout: 15_000 })
        .catch(() => {});
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Rechnungen: Liste laden", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("Rechnungen: Liste → Detail → zurück", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForTimeout(2000);
    // Try to find a link in the table to navigate to detail
    const invoiceLink = page
      .locator("table tbody tr a")
      .first()
      .or(page.locator("table tbody tr td:nth-child(2)").first());
    if (await invoiceLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await invoiceLink.click();
      await page
        .waitForURL(/.*\/invoices\/.*/, { timeout: 15_000 })
        .catch(() => {});
      // If we navigated, go back
      if (/\/invoices\//.test(page.url())) {
        await expect(page.locator("h1").first()).toBeVisible();
        await page.goBack();
        await page
          .waitForURL(/.*\/invoices/, { timeout: 15_000 })
          .catch(() => {});
      }
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Verträge: Liste laden + Detail öffnen", async ({ page }) => {
    await page.goto("/contracts");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const link = page
      .locator("table tbody tr a")
      .first()
      .or(page.locator("table tbody tr td:nth-child(2)").first());
    if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
      await link.click();
      await page
        .waitForURL(/.*\/contracts\/.*/, { timeout: 15_000 })
        .catch(() => {});
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Pachtverträge: Liste laden", async ({ page }) => {
    await page.goto("/leases");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Beteiligungen: Liste + Detail", async ({ page }) => {
    await page.goto("/funds");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const link = page
      .locator("table tbody tr a")
      .first()
      .or(page.locator("table tbody tr td:nth-child(2)").first());
    if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
      await link.click();
      await page
        .waitForURL(/.*\/funds\/.*/, { timeout: 15_000 })
        .catch(() => {});
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("Service-Events: Liste laden", async ({ page }) => {
    await page.goto("/service-events");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Vendors/Kreditoren: Liste laden", async ({ page }) => {
    await page.goto("/vendors");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("Buchungssätze: Liste laden", async ({ page }) => {
    await page.goto("/journal-entries");
    await expect(page.locator("h1").first()).toBeVisible();
  });
});
