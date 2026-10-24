import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("source picker explains sounds, keeps the round, and supports keyboard navigation", async ({
  page,
}) => {
  const before = await page.locator("#spectrum").boundingBox();
  await page.locator("#source").click();
  const menu = page.getByRole("dialog", { name: "Choose sound source" });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-source="pink"]')).toContainText(
    "Start here",
  );
  await expect(menu.locator('[data-source="groove"]')).toContainText(
    "drums and bass",
  );
  await expect(menu.locator('[data-source="upload"]')).toBeHidden();
  expect(await page.locator("#spectrum").boundingBox()).toEqual(before);
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await expect(menu.locator('[data-source="pink"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.locator('[data-source="groove"]')).toBeFocused();
  await page.keyboard.press("t");
  await expect(page.locator("#train-mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(page.locator("#source-value")).toHaveText("Studio groove");
  await expect(page.locator("#source")).toBeFocused();
  await expect(page.locator("#round-label")).toHaveText("ROUND 01");
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[data-source="groove"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#source")).toBeFocused();
  await page.locator("#help-button").click();
  await expect(page.locator("#help-dialog")).toContainText(
    "Your audio stays on your device.",
  );
});

test("Train horizontal direction keys select exact bands and clamp at the endpoints", async ({
  page,
}) => {
  await page.locator("#play-button").click();
  await expect(page.locator("#play-button")).toHaveAttribute(
    "aria-label",
    "Pause audio",
  );
  const graph = page.locator("#eq-graph");
  await graph.focus();
  for (const [higher, lower] of [
    ["ArrowRight", "ArrowLeft"],
    ["l", "h"],
  ]) {
    await page.keyboard.press("Home");
    await page.keyboard.press(higher);
    await expect(graph).toHaveAttribute("aria-valuenow", "160");
    await page.keyboard.press(higher);
    await expect(graph).toHaveAttribute("aria-valuenow", "315");
    await page.keyboard.press(lower);
    await expect(graph).toHaveAttribute("aria-valuenow", "160");
    await page.keyboard.press(lower);
    await page.keyboard.press(lower);
    await expect(graph).toHaveAttribute("aria-valuenow", "80");
  }
  await page.keyboard.press("End");
  await page.keyboard.press("l");
  await expect(graph).toHaveAttribute("aria-valuenow", "5000");
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
});
