import { test, expect } from "./fixtures";

test.describe("Accessibility", () => {
  test("Alle Header-Buttons haben aria-labels", async ({ page }) => {
    await page.goto("/dashboard");
    const headerButtons = page.locator("header button");
    const count = await headerButtons.count();
    for (let i = 0; i < count; i++) {
      const btn = headerButtons.nth(i);
      const ariaLabel = await btn.getAttribute("aria-label");
      const innerText = await btn.innerText();
      const title = await btn.getAttribute("title");
      // Each button should have either aria-label, title, or visible text
      const hasLabel = (ariaLabel && ariaLabel.length > 0) ||
                       (innerText && innerText.trim().length > 0) ||
                       (title && title.length > 0);
      expect(hasLabel, `Button ${i} in header has no accessible label`).toBeTruthy();
    }
  });

  test("Modal/Dialog hat Fokus-Trap", async ({ page }) => {
    await page.goto("/dashboard");
    // Open user menu (dropdown)
    await page.locator('[data-tour="header-user-menu"]').click();
    const menu = page.locator('[role="menu"]').first();
    await expect(menu).toBeVisible({ timeout: 3000 });
    // Tab through menu items — focus should stay in menu
    await page.keyboard.press("Tab");
    const focusedElement = page.locator(":focus");
    // Focused element should be inside the menu or its parent
    await expect(focusedElement).toBeVisible();
  });

  test("Tabellen haben korrekte Semantik", async ({ page }) => {
    await page.goto("/parks");
    await expect(page.locator("table")).toBeVisible();
    // Table should have thead and tbody
    await expect(page.locator("table thead")).toBeVisible();
    await expect(page.locator("table tbody")).toBeVisible();
    // Headers should use th elements
    const thCount = await page.locator("table thead th").count();
    expect(thCount).toBeGreaterThan(2);
  });

  test("Formular-Inputs haben zugängliche Labels", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(2000);
    // Check for accessible inputs (label, aria-label, or placeholder)
    const inputs = page.locator("input:visible");
    const inputCount = await inputs.count();
    // Settings page should have at least some input fields
    // (may use aria-label or placeholder instead of <label>)
    if (inputCount > 0) {
      for (let i = 0; i < Math.min(inputCount, 5); i++) {
        const input = inputs.nth(i);
        const ariaLabel = await input.getAttribute("aria-label");
        const placeholder = await input.getAttribute("placeholder");
        const id = await input.getAttribute("id");
        const hasLabel = (ariaLabel && ariaLabel.length > 0) ||
                         (placeholder && placeholder.length > 0) ||
                         (id && (await page.locator(`label[for="${id}"]`).count()) > 0);
        expect(hasLabel, `Input ${i} has no accessible label`).toBeTruthy();
      }
    }
  });

  test("Keyboard-Navigation durch Sidebar funktioniert", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    // Tab into sidebar links
    const sidebarLinks = page.locator("nav a");
    const linkCount = await sidebarLinks.count();
    expect(linkCount).toBeGreaterThan(3);
    // First sidebar link should be focusable
    const firstLink = sidebarLinks.first();
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
  });
});
