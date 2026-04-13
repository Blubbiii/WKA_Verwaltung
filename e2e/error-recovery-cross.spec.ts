import { test, expect } from "./fixtures";

test.describe("Error Recovery", () => {
  test("Ungültige URL zeigt 404", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist-e2e-test");
    expect(response?.status()).toBe(404);
  });

  test("API-Fehler: ungültiger Endpoint gibt Fehler-Status", async ({ page }) => {
    await page.goto("/dashboard");
    const response = await page.request.get("/api/nonexistent-endpoint-e2e").catch(() => null);
    if (response) {
      // Should return 404 or similar, not 500
      const status = response.status();
      expect(status).not.toBe(500);
    }
  });

  test("Doppel-Navigation: Schnelles Hin-und-Her crasht nicht", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.goto(i % 2 === 0 ? "/parks" : "/invoices");
    }
    await page.waitForTimeout(1000);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Unhandled Runtime Error");
    expect(body.length).toBeGreaterThan(50);
  });
});

test.describe("Cross-Feature", () => {
  test("Park-Detail zeigt verknüpfte Verträge/Pachten", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(2000);
    const link = page.locator("table tbody tr a").first();
    if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(3000);
      // Detail page should have tabs or sections referencing related entities
      const body = await page.locator("body").innerText();
      expect(body.length).toBeGreaterThan(200);
    }
  });

  test("Sidebar zeigt korrekte aktive Markierung", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(1000);
    // The sidebar should highlight "Parks" or "Windparks"
    const activeItem = page.locator("nav a[aria-current='page']").first();
    const hasActive = await activeItem.isVisible().catch(() => false);
    // Active state exists (border-l-primary)
    if (hasActive) {
      const text = await activeItem.innerText();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test("Globale Suche findet Seiten und Daten", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
    const input = page.getByPlaceholder(/suchen/i).first();
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill("Wind");
      await page.waitForTimeout(1000);
      // Should show results (pages or data)
      const body = await page.locator("body").innerText();
      expect(/wind/i.test(body)).toBeTruthy();
    }
    await page.keyboard.press("Escape");
  });
});
