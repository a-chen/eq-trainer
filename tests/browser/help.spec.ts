import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Help dismisses with ?, Escape, or outside click and restores focus", async ({
  page,
}) => {
  const help = page.getByRole("dialog", { name: "Listening tips & shortcuts" });
  const trigger = page.locator("#help-button");
  for (const dismiss of ["?", "Escape", "outside"]) {
    await trigger.click();
    await expect(help).toBeVisible();
    await expect(help.locator("#start-practice")).toHaveCount(0);
    await help.locator("h2").click();
    await expect(help).toBeVisible();
    if (dismiss === "outside") await page.mouse.click(2, 2);
    else await page.keyboard.press(dismiss);
    await expect(help).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator("#train-mode")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#play-button")).toHaveAttribute(
      "aria-label",
      "Play audio",
    );
  }
  await page.keyboard.press("?");
  await expect(help).toBeVisible();
  await page.keyboard.press("?");
  await expect(help).toBeHidden();
});

test("Help keeps tips and shortcuts without repeating settings descriptions", async ({
  page,
}) => {
  await page.locator("#help-button").click();
  const help = page.locator("#help-dialog");
  await expect(help).toContainText("Learn is unscored");
  await expect(help).toContainText("Reveal answer earns no points");
  await expect(help).not.toContainText("Beginner:");
  await expect(help).not.toContainText("EQ change:");
  await expect(help).not.toContainText("Sound source:");
  await page.keyboard.press("t");
  await expect(page.locator("#train-mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#stats-details summary").click();
  await expect(page.locator("#reset-button")).toBeVisible();
});
