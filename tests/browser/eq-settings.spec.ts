import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("EQ picker explains changes without moving the graph", async ({
  page,
}) => {
  const before = await page.locator("#spectrum").boundingBox();
  await page.locator("#change-type").click();
  const menu = page.getByRole("dialog", { name: "Choose EQ change" });
  await expect(menu).toBeVisible();
  await expect(page.locator("#change-type")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  for (const value of ["boost", "cut", "mixed"]) {
    await expect(
      menu.locator(`[data-change="${value}"] .difficulty-description`),
    ).not.toBeEmpty();
  }
  expect(await page.locator("#spectrum").boundingBox()).toEqual(before);
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await menu.locator('[data-change="cut"]').click();
  await expect(menu).toBeHidden();
  await expect(page.locator("#change-value")).toHaveText("Cut");
  await expect(page.locator("#gain-label")).toHaveText("−15 dB");
  await expect(page.locator("#change-type")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[data-change="cut"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[data-change="mixed"]')).toBeFocused();
  await page.keyboard.press("e");
  await expect(page.locator("#eq-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator("#change-value")).toHaveText("Mixed");
  await expect(page.locator("#gain-label")).toHaveText("±15 dB");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#change-type")).toBeFocused();
});

test("nearby shortcut hints toggle modes with one key in Train and Learn", async ({
  page,
}) => {
  await expect(page.locator(".practice-switch kbd")).toHaveText("T");
  await expect(page.locator(".ab-switch kbd")).toHaveText("E");
  await page.locator("#eq-graph").focus();
  for (const learning of [false, true]) {
    if (learning) await page.keyboard.press("t");
    await expect(
      page.locator(learning ? "#learn-mode" : "#train-mode"),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("e");
    await expect(page.locator("#original-button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("e");
    await expect(page.locator("#eq-button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.locator("#learn-gain").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#eq-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#help-button").click();
  await expect(page.locator("#help-dialog")).toContainText("Learn is unscored");
  await page.keyboard.press("e");
  await expect(page.locator("#eq-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
