import { test, expect } from "@playwright/test";
import { LEVELS, formatFrequency } from "../../src/game.ts";

for (const [difficulty, level] of Object.entries(LEVELS)) {
  test(`${difficulty}: keyboard and pointer use exactly the tested frequencies`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.goto("/");
    await page.locator("#difficulty").click();
    await page.locator(`[data-difficulty="${difficulty}"]`).click();
    await page.locator("#play-button").click();
    await expect(page.locator("#play-button")).toHaveAttribute(
      "aria-label",
      "Pause audio",
    );
    const graph = page.locator("#eq-graph");
    await graph.focus();
    await expect(graph.locator("[data-train-band]")).toHaveCount(
      level.frequencies.length,
    );
    await expect(graph).toHaveAttribute(
      "aria-valuemin",
      String(level.frequencies[0]),
    );
    await expect(graph).toHaveAttribute(
      "aria-valuemax",
      String(level.frequencies.at(-1)),
    );
    await page.keyboard.press("Home");
    for (const [index, frequency] of level.frequencies.entries()) {
      if (index) await page.keyboard.press(index % 2 ? "ArrowRight" : "l");
      await expect(graph).toHaveAttribute("aria-valuenow", String(frequency));
    }
    await page.keyboard.press("Shift+ArrowRight");
    await expect(graph).toHaveAttribute(
      "aria-valuenow",
      String(level.frequencies.at(-1)),
    );
    for (const frequency of [...level.frequencies].reverse().slice(1)) {
      await page.keyboard.press("h");
      await expect(graph).toHaveAttribute("aria-valuenow", String(frequency));
    }
    await page.keyboard.press("ArrowLeft");
    await expect(graph).toHaveAttribute(
      "aria-valuenow",
      String(level.frequencies[0]),
    );
    // Click slightly off the exact center: both preview and answer snap to the target.
    const target = difficulty === "beginner" ? 160 : level.frequencies[0];
    const bounds = (await graph.boundingBox())!;
    const x =
      bounds.x +
      (Math.log((target * 1.03) / 20) / Math.log(1000)) * bounds.width;
    await page.mouse.move(x, bounds.y + bounds.height / 2);
    if (!test.info().project.use.isMobile) {
      await expect(graph).toHaveAttribute("aria-valuenow", String(target));
    }
    await graph.click({ position: { x: x - bounds.x, y: bounds.height / 2 } });
    await expect(page.locator("#feedback")).toContainText("On target.");
    await expect(page.locator("#feedback")).toContainText(
      `You picked ${formatFrequency(target)}.`,
    );
  });
}
