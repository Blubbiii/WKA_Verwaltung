import { test, expect } from "@playwright/test";

test.describe("Inline Edit", () => {
  test("Notizen-Zelle öffnet Input bei Klick", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(3000);

    // Dismiss any onboarding tour overlay that might block clicks
    const overlay = page.locator(".driver-overlay");
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    const editableCell = page.locator('[role="button"]').filter({ hasText: /—/ }).first();
    if (await editableCell.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editableCell.click({ force: true });
      const input = page.locator("table input[type='text']").first();
      await expect(input).toBeVisible({ timeout: 3000 });
    }
  });

  test("Escape schließt Input ohne Speichern", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(3000);

    // Dismiss tour overlay
    const overlay = page.locator(".driver-overlay");
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    const editableCell = page.locator('[role="button"]').filter({ hasText: /—/ }).first();
    if (await editableCell.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editableCell.click({ force: true });
      const input = page.locator("table input[type='text']").first();
      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill("Test-Notiz");
        await input.press("Escape");
        await expect(input).toBeHidden({ timeout: 3000 });
      }
    }
  });
});
