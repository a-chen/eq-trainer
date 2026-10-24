import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("J/K and vertical arrows select Train strength, including cut and mixed signs", async ({
  page,
}) => {
  const graph = page.locator("#eq-graph");
  await graph.focus();
  for (const [key, level, gain] of [
    ["j", "Intermediate", "+9 dB"],
    ["j", "Advanced", "+6 dB"],
    ["j", "Advanced", "+6 dB"],
    ["k", "Intermediate", "+9 dB"],
    ["ArrowUp", "Beginner", "+15 dB"],
    ["k", "Beginner", "+15 dB"],
  ]) {
    await page.keyboard.press(key);
    await expect(page.locator("#difficulty-value")).toHaveText(level);
    await expect(page.locator("#gain-label")).toHaveText(gain);
  }
  for (const [mode, sign] of [
    ["cut", "−"],
    ["mixed", "±"],
  ]) {
    await page.locator("#change-type").click();
    await page.locator(`[data-change="${mode}"]`).click();
    await graph.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#gain-label")).toHaveText(`${sign}9 dB`);
    await page.keyboard.press("j");
    await expect(page.locator("#gain-label")).toHaveText(`${sign}6 dB`);
    await page.keyboard.press("k");
    await page.keyboard.press("k");
    await expect(page.locator("#gain-label")).toHaveText(`${sign}15 dB`);
  }
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(0);
  await graph.dispatchEvent("keydown", { key: "j", repeat: true });
  await expect(page.locator("#difficulty-value")).toHaveText("Beginner");
  await page.locator("#difficulty").click();
  await page.keyboard.press("j");
  await expect(page.locator("#difficulty-value")).toHaveText("Beginner");
});

test("Learn J/K and vertical arrows adjust dB without moving frequency and clamp at ±15", async ({
  page,
}) => {
  await page.locator("#learn-mode").click();
  const graph = page.locator("#eq-graph");
  const gain = page.locator("#learn-gain");
  for (const [key, value] of [
    ["j", "8"],
    ["k", "9"],
    ["ArrowUp", "10"],
    ["ArrowDown", "9"],
  ]) {
    await page.keyboard.press(key);
    await expect(gain).toHaveValue(value);
    await expect(graph).toHaveAttribute("aria-valuenow", "1000");
    await expect(graph).toBeFocused();
  }
  await graph.dispatchEvent("keydown", { key: "k", repeat: true });
  await expect(gain).toHaveValue("10");
  await gain.fill("15");
  await graph.focus();
  await page.keyboard.press("k");
  await expect(gain).toHaveValue("15");
  await gain.fill("-15");
  await graph.focus();
  await page.keyboard.press("j");
  await expect(gain).toHaveValue("-15");
  await expect(page.locator("#guide-gain")).toHaveText("−15 dB");
  await page.keyboard.press("k");
  await expect(gain).toHaveValue("-14");
  await page.locator("#learn-frequency").focus();
  await page.keyboard.press("j");
  await expect(gain).toHaveValue("-14");
  await page.locator("#help-button").click();
  await page.keyboard.press("k");
  await expect(gain).toHaveValue("-14");
});
