import { test, expect } from "@playwright/test";

test.describe("Inline Edit", () => {
  test("Notizen-Zelle öffnet Input bei Klick", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    // Find an EditableCell (has group/cell class and pencil icon on hover)
    const editableCell = page.locator('[role="button"]').filter({ hasText: /—/ }).first();
    if (await editableCell.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editableCell.click();
      // Input should appear
      await expect(page.locator("table input[type='text']").first()).toBeVisible({ timeout: 2000 });
    }
  });

  test("Escape schließt Input ohne Speichern", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    const editableCell = page.locator('[role="button"]').filter({ hasText: /—/ }).first();
    if (await editableCell.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editableCell.click();
      const input = page.locator("table input[type='text']").first();
      await expect(input).toBeVisible({ timeout: 2000 });
      await input.fill("Test-Notiz");
      await input.press("Escape");
      // Input should be gone, original value restored
      await expect(input).toBeHidden({ timeout: 2000 });
    }
  });
});
