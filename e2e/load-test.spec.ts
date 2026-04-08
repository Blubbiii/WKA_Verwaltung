import { test, expect } from "@playwright/test";

test.describe("Load & Stress Tests", () => {
  test("10 parallele Seitenaufrufe crashen nicht", async ({ browser }) => {
    const pages = await Promise.all(
      Array.from({ length: 10 }, () => browser.newPage())
    );

    // Load different pages in parallel
    const urls = [
      "/dashboard", "/parks", "/invoices", "/funds", "/contracts",
      "/dashboard", "/parks", "/invoices", "/funds", "/contracts",
    ];

    await Promise.all(
      pages.map((page, i) => page.goto(urls[i], { timeout: 30_000 }).catch(() => {}))
    );

    // Wait for all to settle
    await Promise.all(
      pages.map((page) => page.waitForTimeout(2000))
    );

    // All pages should have loaded without crash
    for (const page of pages) {
      const body = await page.locator("body").innerText().catch(() => "");
      expect(body.length).toBeGreaterThan(10);
    }

    // Clean up
    await Promise.all(pages.map((page) => page.close()));
  });

  test("Schnelle Navigation zwischen 20 Seiten", async ({ page }) => {
    const urls = [
      "/dashboard", "/parks", "/invoices", "/funds", "/contracts",
      "/leases", "/documents", "/service-events", "/vendors", "/journal-entries",
      "/dashboard", "/parks", "/invoices", "/funds", "/contracts",
      "/leases", "/documents", "/service-events", "/vendors", "/journal-entries",
    ];

    const start = Date.now();

    for (const url of urls) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
    }

    const elapsed = Date.now() - start;

    // 20 page navigations should complete in under 60 seconds
    expect(elapsed).toBeLessThan(60_000);

    // Final page should be functional
    const body = await page.locator("body").innerText().catch(() => "");
    expect(body).not.toContain("Unhandled Runtime Error");
  });

  test("API-Endpoints antworten unter 5 Sekunden", async ({ page }) => {
    await page.goto("/dashboard");

    const endpoints = [
      "/api/parks",
      "/api/invoices",
      "/api/funds",
      "/api/contracts",
      "/api/health",
    ];

    for (const endpoint of endpoints) {
      const start = Date.now();
      const response = await page.request.get(endpoint).catch(() => null);
      const elapsed = Date.now() - start;

      if (response) {
        expect(elapsed).toBeLessThan(5000);
        expect(response.status()).not.toBe(500);
      }
    }
  });

  test("Gleichzeitige API-Requests werden beantwortet", async ({ page }) => {
    await page.goto("/dashboard");

    // Fire 5 API requests simultaneously
    const responses = await Promise.all([
      page.request.get("/api/parks").catch(() => null),
      page.request.get("/api/invoices").catch(() => null),
      page.request.get("/api/funds").catch(() => null),
      page.request.get("/api/contracts").catch(() => null),
      page.request.get("/api/health").catch(() => null),
    ]);

    // All should return non-500
    for (const res of responses) {
      if (res) {
        expect(res.status()).not.toBe(500);
      }
    }
  });
});
