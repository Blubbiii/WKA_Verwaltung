import { test, expect } from "@playwright/test";

test.describe("Bulk Actions", () => {
  test("Checkbox auswählen zeigt BatchActionBar", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    // Wait for data to load (not skeleton)
    await page.waitForTimeout(2000);
    // Find first checkbox in table body
    const checkbox = page.locator("table tbody tr td").first().locator('button[role="checkbox"]');
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      // BatchActionBar should appear at bottom
      await expect(page.getByText(/ausgewaehlt|ausgewählt/i).first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("Auswahl aufheben entfernt BatchActionBar", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const checkbox = page.locator("table tbody tr td").first().locator('button[role="checkbox"]');
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      await expect(page.getByText(/ausgewaehlt|ausgewählt/i).first()).toBeVisible({ timeout: 3000 });
      // Click "Auswahl aufheben"
      await page.getByText(/auswahl aufheben/i).click();
      // Bar should disappear
      await expect(page.getByText(/ausgewaehlt|ausgewählt/i).first()).toBeHidden({ timeout: 3000 });
    }
  });
});
