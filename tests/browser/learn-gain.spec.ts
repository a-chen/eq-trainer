import { test, expect } from "@playwright/test";

test("Learn supports ±15 dB with an unclipped curve and preserves Train gain", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#learn-mode").click();
  const gain = page.locator("#learn-gain");
  await expect(gain).toHaveAttribute("min", "-15");
  await expect(gain).toHaveAttribute("max", "15");
  for (const [key, label] of [
    ["End", "+15 dB"],
    ["Home", "−15 dB"],
  ]) {
    await gain.focus();
    await page.keyboard.press(key);
    await expect(page.locator("#learn-gain-value")).toHaveText(label);
    await expect(page.locator("#guide-gain")).toHaveText(label);
    const y = Number(await page.locator(".sweep-handle").getAttribute("cy"));
    expect(y).toBeGreaterThan(6);
    expect(y).toBeLessThan(184);
    const path = await page.locator(".response-line").getAttribute("d");
    expect(path).not.toContain("NaN");
  }
  await page.locator("#train-mode").click();
  await expect(page.locator("#gain-label")).toHaveText("+15 dB");
  await page.locator("#learn-mode").click();
  await expect(gain).toHaveValue("-15");
});
