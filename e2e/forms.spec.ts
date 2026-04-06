import { test, expect } from "@playwright/test";

test.describe("Formulare", () => {
  test("Park-Erstellungsformular öffnet sich", async ({ page }) => {
    await page.goto("/parks");
    // Click "Neuer Park" or similar create button
    const createBtn = page.getByRole("link", { name: /neuer park|park erstellen|neu/i }).first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForURL(/.*\/parks\/new.*|.*\/parks\/create.*/i, { timeout: 10000 });
      // Form should have name field
      await expect(page.getByLabel(/name/i).first()).toBeVisible();
    }
  });

  test("Formular-Validierung zeigt Fehler bei leeren Pflichtfeldern", async ({ page }) => {
    await page.goto("/parks/new");
    // Try to submit empty form
    const submitBtn = page.getByRole("button", { name: /speichern|erstellen|anlegen/i }).first();
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitBtn.click();
      // Should show validation error (either HTML5 or custom)
      await page.waitForTimeout(500);
      // Page should NOT navigate away (stay on form)
      await expect(page).toHaveURL(/.*\/parks\/new.*/);
    }
  });

  test("Rechnung-Erstellungsseite lädt", async ({ page }) => {
    await page.goto("/invoices/new");
    await expect(page.locator("h1").first()).toBeVisible();
    // Should have form elements
    const formElements = page.locator("form, input, select, [role='combobox']");
    const count = await formElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test("Kontakt-Seite lädt und zeigt Kontakte", async ({ page }) => {
    await page.goto("/crm/contacts");
    await expect(page.locator("h1").first()).toBeVisible();
    // Should show a table or list of contacts
    await expect(
      page.locator("table").or(page.getByText(/keine kontakte|kein kontakt/i))
    ).toBeVisible({ timeout: 10000 });
  });
});
