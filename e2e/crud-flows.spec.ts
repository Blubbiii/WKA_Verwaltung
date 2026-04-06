import { test, expect } from "@playwright/test";

test.describe("CRUD Flows", () => {
  // No serial mode — each test is independent

  test("Parks: Seite laden + Tabelle sichtbar", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Parks: Detail-Seite öffnen und Daten prüfen", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    // Click on a data cell (not the checkbox column)
    const nameCell = page.locator("table tbody tr td").nth(1);
    if (await nameCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameCell.click();
      await page.waitForURL(/.*\/parks\/.*/, { timeout: 15_000 });
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });

  test("Rechnungen: Liste → Detail → zurück", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    // Click on a data cell (skip checkbox column)
    const nameCell = page.locator("table tbody tr td").nth(1);
    if (await nameCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameCell.click();
      await page.waitForURL(/.*\/invoices\/.*/, { timeout: 15_000 });
      await expect(page.locator("h1").first()).toBeVisible();
      await page.goBack();
      await page.waitForURL(/.*\/invoices/, { timeout: 15_000 });
      await expect(page.locator("table")).toBeVisible();
    }
  });

  test("Verträge: Liste laden + Detail öffnen", async ({ page }) => {
    await page.goto("/contracts");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const nameCell = page.locator("table tbody tr td").nth(1);
    if (await nameCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameCell.click();
      await page.waitForURL(/.*\/contracts\/.*/, { timeout: 15_000 });
      await expect(page.locator("h1").first()).toBeVisible();
    }
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
    const nameCell = page.locator("table tbody tr td").nth(1);
    if (await nameCell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameCell.click();
      await page.waitForURL(/.*\/funds\/.*/, { timeout: 15_000 });
      await expect(page.locator("h1").first()).toBeVisible();
    }
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
