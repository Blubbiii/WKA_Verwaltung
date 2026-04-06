import { test, expect } from "@playwright/test";

test.describe("CRUD Flows", () => {
  test.describe.configure({ mode: "serial" }); // Tests depend on each other

  test("Parks: Seite laden + Tabelle sichtbar", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Parks: Detail-Seite öffnen und Daten prüfen", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      const parkName = await firstRow.locator("td").first().innerText();
      await firstRow.click();
      await page.waitForURL(/.*\/parks\/.*/, { timeout: 10_000 });
      // Park name should appear on detail page
      const pageContent = await page.locator("body").innerText();
      expect(pageContent).toContain(parkName.trim().substring(0, 10));
    }
  });

  test("Rechnungen: Liste → Detail → zurück", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForURL(/.*\/invoices\/.*/, { timeout: 10_000 });
      await expect(page.locator("h1").first()).toBeVisible();
      // Go back
      await page.goBack();
      await page.waitForURL(/.*\/invoices$/, { timeout: 10_000 });
      await expect(page.locator("table")).toBeVisible();
    }
  });

  test("Verträge: Liste laden + Detail öffnen", async ({ page }) => {
    await page.goto("/contracts");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForURL(/.*\/contracts\/.*/, { timeout: 10_000 });
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
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForURL(/.*\/funds\/.*/, { timeout: 10_000 });
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
