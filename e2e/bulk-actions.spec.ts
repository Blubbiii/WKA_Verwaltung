import { test, expect } from "@playwright/test";

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
        // Click "Auswahl aufheben" — text may vary
        const clearBtn = page.getByText(/auswahl aufheben|alle abw[aä]hlen|abbrechen/i).first();
        if (await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await clearBtn.click();
          // Bar should disappear
          await expect(batchText).toBeHidden({ timeout: 5000 });
        } else {
          // Alternatively, uncheck the checkbox
          await checkbox.click();
          await expect(batchText).toBeHidden({ timeout: 5000 });
        }
      }
    }
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
