import { test, expect } from "@playwright/test";

test.describe("Visual Regression", () => {
  // Note: First run creates baseline screenshots.
  // Subsequent runs compare against baselines.
  // Update baselines with: npx playwright test --update-snapshots

  test("Dashboard Layout stabil", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(3000);
    // Wait for all widgets to load
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page).toHaveScreenshot("dashboard.png", {
      maxDiffPixelRatio: 0.05, // Allow 5% pixel difference (dynamic content)
      fullPage: false,
    });
  });

  test("Login-Seite Layout stabil", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    await expect(page).toHaveScreenshot("login.png", {
      maxDiffPixelRatio: 0.03,
      fullPage: false,
    });
    await context.close();
  });

  test("Parks-Seite Layout stabil", async ({ page }) => {
    await page.goto("/parks");
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page).toHaveScreenshot("parks.png", {
      maxDiffPixelRatio: 0.05,
      fullPage: false,
    });
  });

  test("Mobile Dashboard Layout stabil", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard");
    await page.waitForTimeout(3000);

    await expect(page).toHaveScreenshot("dashboard-mobile.png", {
      maxDiffPixelRatio: 0.05,
      fullPage: false,
    });
  });

  test("Dark Mode Dashboard Layout stabil", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    // Switch to dark mode
    await page.locator('[data-tour="header-theme-toggle"]').first().click();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("dashboard-dark.png", {
      maxDiffPixelRatio: 0.05,
      fullPage: false,
    });

    // Switch back
    await page.locator('[data-tour="header-theme-toggle"]').first().click();
  });
});
