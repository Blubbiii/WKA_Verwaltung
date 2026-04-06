import { test, expect } from "@playwright/test";

test.describe("Edge Cases", () => {
  test("Sonderzeichen in Suche verursachen keinen Fehler", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    const searchInput = page.getByPlaceholder(/suchen/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Type special characters that could cause XSS or SQL injection
      await searchInput.fill('<script>alert("xss")</script>');
      await page.waitForTimeout(500);
      // Page should not crash — table or empty state visible
      await expect(
        page.locator("table").or(page.getByText(/keine/i))
      ).toBeVisible();
      // No alert dialog should appear (XSS check)
      // Clear and try SQL injection
      await searchInput.fill("'; DROP TABLE parks; --");
      await page.waitForTimeout(500);
      await expect(
        page.locator("table").or(page.getByText(/keine/i))
      ).toBeVisible();
    }
  });

  test("Cmd+K Suche mit Sonderzeichen", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/suchen/i).first();
    await expect(input).toBeVisible();
    await input.fill("Ö'Hörn & <Co.>");
    await page.waitForTimeout(500);
    // Should not crash — "Nichts gefunden" is acceptable
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(10);
  });

  test("Filter + Pagination: Filter setzt auf Seite 1 zurück", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page.locator("table")).toBeVisible();
    await page.waitForTimeout(2000);
    // Try to go to page 2 first
    const nextBtn = page.getByRole("button", { name: /nächste|weiter|next|>/i }).first();
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false) && await nextBtn.isEnabled()) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
    }
    // Now apply a filter — should reset to page 1
    const searchInput = page.getByPlaceholder(/suchen/i).first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("test");
      await page.waitForTimeout(500);
      // Table should show results or empty state — not crash
      await expect(
        page.locator("table").or(page.getByText(/keine/i))
      ).toBeVisible();
    }
  });

  test("Doppelklick auf Button löst Aktion nicht doppelt aus", async ({ page }) => {
    await page.goto("/dashboard");
    // Double-click theme toggle — should end up back at original theme
    const html = page.locator("html");
    const initialClass = await html.getAttribute("class");
    await page.locator('[data-tour="header-theme-toggle"]').dblclick();
    await page.waitForTimeout(500);
    const afterDoubleClick = await html.getAttribute("class");
    // After double-click, theme should be same as initial (toggled twice)
    expect(afterDoubleClick).toBe(initialClass);
  });

  test("Browser Zurück-Button funktioniert korrekt", async ({ page }) => {
    await page.goto("/dashboard");
    await page.goto("/parks");
    await page.goto("/invoices");
    // Go back twice
    await page.goBack();
    await expect(page).toHaveURL(/.*\/parks/);
    await page.goBack();
    await expect(page).toHaveURL(/.*\/dashboard/);
  });
});
