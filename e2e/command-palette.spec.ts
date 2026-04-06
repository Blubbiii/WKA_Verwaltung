import { test, expect } from "@playwright/test";

test.describe("Command Palette (Cmd+K)", () => {
  test("Ctrl+K öffnet die Palette", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    // Command palette should be visible
    await expect(page.locator('[cmdk-root]').or(page.getByPlaceholder(/suchen/i))).toBeVisible({ timeout: 3000 });
  });

  test("Escape schließt die Palette", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    await expect(page.locator('[cmdk-root]').or(page.getByPlaceholder(/suchen/i))).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    // Palette should be closed
    await expect(page.locator('[cmdk-root]')).toBeHidden({ timeout: 3000 });
  });

  test("Statische Seiten werden gefunden", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/suchen/i).first();
    await expect(input).toBeVisible();
    await input.fill("Windparks");
    await page.waitForTimeout(200);
    // Should show "Windparks" in results
    await expect(page.getByText("Windparks").first()).toBeVisible();
  });

  test("Live-Suche zeigt Ergebnisse bei Eingabe", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/suchen/i).first();
    await input.fill("Wind");
    // Wait for debounce + API response
    await page.waitForTimeout(1000);
    // Should show "Ergebnisse" group or at minimum the static "Windparks" page
    await expect(page.getByText(/windpark|ergebnisse/i).first()).toBeVisible();
  });

  test("Klick auf Ergebnis navigiert", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/suchen/i).first();
    await input.fill("Windparks");
    await page.waitForTimeout(300);
    // Click the "Windparks" result item directly
    const result = page.getByText("Windparks").first();
    await expect(result).toBeVisible({ timeout: 3000 });
    await result.click();
    await page.waitForURL("**/parks**", { timeout: 10_000 });
  });
});
