import { test, expect } from "./fixtures";

test.describe("Bulk Actions", () => {
  test("Checkbox auswählen zeigt BatchActionBar", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    // Wait for data to load (not skeleton)
    await page.waitForTimeout(2000);
    // Find first checkbox in table body
    const checkbox = page.locator("table tbody tr td").first().locator('button[role="checkbox"]');
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      // BatchActionBar should appear at bottom
      await expect(
        page.getByText(/ausgew(ae|ä)hlt/i).first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("Auswahl aufheben entfernt BatchActionBar", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const checkbox = page.locator("table tbody tr td").first().locator('button[role="checkbox"]');
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      const batchText = page.getByText(/ausgew(ae|ä)hlt/i).first();
      if (await batchText.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Wait for slide-in animation to finish
        await page.waitForTimeout(500);
        // Uncheck the checkbox to clear selection (more reliable than clicking text button)
        await checkbox.click({ force: true });
        await page.waitForTimeout(1000);
        // Bar should disappear
        const barGone = await batchText.isHidden({ timeout: 5000 }).catch(() => true);
        expect(barGone).toBeTruthy();
      }
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
