import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { LEVELS } from "../../src/game.ts";

async function expectInViewport(page: Page, locator: Locator) {
  const bounds = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
}

const difficultyOption = (page: Page, name: string) =>
  page.locator("#difficulty-menu").getByRole("button", { name, exact: true });

async function reveal(page: Page) {
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeEnabled();
  await page.locator("#skip-button").click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
});

test("difficulty dropdown explains every preset without shifting the workspace", async ({
  page,
}, testInfo) => {
  await page.evaluate(() => document.fonts.ready);
  const graphBefore = await page.locator("#eq-graph").boundingBox();
  await page.locator("#difficulty").click();
  const menu = page.getByRole("dialog", { name: "Choose difficulty" });
  await expect(menu).toBeVisible();
  await expect(page.locator("#difficulty")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(menu).toContainText("higher Q (narrower EQ)");
  for (const level of Object.values(LEVELS)) {
    const option = difficultyOption(page, level.label);
    await expect(option).toContainText(`+${level.gain} dB`);
    await expect(option).toContainText(`Q ${level.q}`);
    await expect(option).toContainText(
      `${level.frequencies.length} target bands`,
    );
    await expect(option.locator(".difficulty-description")).not.toBeEmpty();
    await expect(option).toHaveAttribute(
      "aria-pressed",
      String(level.label === "Beginner"),
    );
  }
  await expect(difficultyOption(page, "Beginner")).toBeFocused();
  expect(await page.locator("#eq-graph").boundingBox()).toEqual(graphBefore);
  await expectInViewport(page, menu);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("difficulty.png") });
  await difficultyOption(page, "Intermediate").click();
  await expect(menu).toBeHidden();
  await expect(page.locator("#difficulty")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator("#difficulty")).toBeFocused();
  await expect(page.locator("#difficulty-value")).toHaveText("Intermediate");
  await expect(page.locator("#gain-label")).toHaveText("+9 dB");
  await expect(page.locator("#q-label")).toHaveText("Q 2");
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
});

test("difficulty selection preserves stats, matches EQ mode, and never discloses a mixed sign", async ({
  page,
}) => {
  await reveal(page);
  await page.locator("#difficulty").click();
  await difficultyOption(page, "Beginner").click();
  await expect(page.locator("#next-button")).toBeVisible();
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
  await page.locator("#change-type").click();
  await page.locator('[data-change="cut"]').click();
  await page.locator("#difficulty").click();
  for (const level of Object.values(LEVELS))
    await expect(difficultyOption(page, level.label)).toContainText(
      `−${level.gain} dB`,
    );
  await difficultyOption(page, "Advanced").click();
  await expect(page.locator("#gain-label")).toHaveText("−6 dB");
  await expect(page.locator("#q-label")).toHaveText("Q 3");
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(0);
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeEnabled();
  await page.locator("#change-type").click();
  await page.locator('[data-change="mixed"]').click();
  await page.locator("#difficulty").click();
  for (const level of Object.values(LEVELS))
    await expect(difficultyOption(page, level.label)).toContainText(
      `±${level.gain} dB`,
    );
  await difficultyOption(page, "Intermediate").click();
  await expect(page.locator("#gain-label")).toHaveText("±9 dB");
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(0);
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
});

test("difficulty dropdown supports keyboard navigation, dismissal, and native activation without game shortcuts", async ({
  page,
}) => {
  await page.locator("#difficulty").focus();
  await page.keyboard.press("ArrowDown");
  await expect(difficultyOption(page, "Beginner")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(difficultyOption(page, "Intermediate")).toBeFocused();
  await page.keyboard.press("End");
  await expect(difficultyOption(page, "Advanced")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(difficultyOption(page, "Beginner")).toBeFocused();
  await page.keyboard.press("a");
  await expect(difficultyOption(page, "Advanced")).toBeFocused();
  await page.keyboard.press("t");
  await expect(page.locator("#train-mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#eq-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Space");
  await expect(page.locator("#difficulty-value")).toHaveText("Advanced");
  await expect(page.locator("#difficulty")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Play audio", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.locator("#difficulty-menu")).toBeHidden();
  await expect(page.locator("#difficulty")).toBeFocused();
  await page.locator("#difficulty").click();
  await page.locator("#trainer-title").click();
  await expect(page.locator("#difficulty-menu")).toBeHidden();
  await expect(page.locator("#difficulty")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.locator("#difficulty").click();
  await expect(page.locator("#difficulty-menu")).toBeVisible();
  await page.locator("#difficulty").click();
  await expect(page.locator("#difficulty-menu")).toBeHidden();
  await page.locator("#difficulty").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#difficulty-menu")).toBeHidden();
  await expect(page.locator("#difficulty")).toBeFocused();
});

test("dB and Q explanations work on focus and tap and stay inside the viewport", async ({
  page,
}, testInfo) => {
  await page.locator("#gain-label").focus();
  const gainHelp = page.locator("#eq-gain-help");
  await expect(gainHelp).toBeVisible();
  await expect(gainHelp).toContainText(
    "Positive values boost, negative values cut",
  );
  await expect(gainHelp).toContainText("not your listening volume");
  await expectInViewport(page, gainHelp);
  await page.keyboard.press("Escape");
  await expect(gainHelp).toBeHidden();
  await expect(page.locator("#gain-label")).toBeFocused();
  await page.locator("#q-label").click();
  const qHelp = page.locator("#eq-q-help");
  await expect(qHelp).toBeVisible();
  await expect(qHelp).toContainText("Lower Q affects a wider range");
  await expect(qHelp).toContainText("higher Q focuses on a narrower range");
  await expectInViewport(page, qHelp);
  await page.screenshot({ path: testInfo.outputPath("parameter-help.png") });
  await page.locator("#q-label").click();
  await expect(qHelp).toBeHidden();
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  await expect(
    page.getByRole("button", { name: "Play audio", exact: true }),
  ).toBeEnabled();
});

test("hover explanations remain readable under the pointer and also work inside the difficulty popup", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Touch uses tap rather than hover");
  await page.locator("#gain-label").hover();
  const help = page.locator("#eq-gain-help");
  await expect(help).toBeVisible();
  await help.hover();
  await page.waitForTimeout(150);
  await expect(help).toBeVisible();
  await page.locator("#trainer-title").hover();
  await expect(help).toBeHidden();
  await page.locator("#difficulty").click();
  await difficultyOption(page, "Intermediate")
    .locator('[data-parameter-help="q"]')
    .hover();
  await expect(page.locator("#eq-q-help")).toBeVisible();
  await expect(page.locator("#difficulty-menu")).toBeVisible();
  await expectInViewport(page, page.locator("#eq-q-help"));
  await page.keyboard.press("Escape");
  await expect(page.locator("#eq-q-help")).toBeHidden();
  await expect(page.locator("#difficulty-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#difficulty-menu")).toBeHidden();
});

test("Learn labels, values, sliders, and listening guide explain gain and bandwidth without breaking controls", async ({
  page,
}) => {
  await page.locator("#learn-mode").click();
  await page.locator("#learn-q-value").click();
  await expect(page.locator("#eq-q-help")).toBeVisible();
  await expect(page.locator("#learn-q-value")).toHaveText("1.4");
  await page.locator("#learn-gain-value").click();
  await expect(page.locator("#eq-gain-help")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#learn-gain").focus();
  await expect(page.locator("#eq-gain-help")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#learn-gain-value")).toHaveText("+8 dB");
  await expect(page.locator("#guide-gain")).toHaveText("+8 dB");
  await page.locator("#learn-q").focus();
  await expect(page.locator("#eq-q-help")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#learn-q-value")).toHaveText("1.5");
  await expect(page.locator("#guide-q")).toHaveText("Q 1.5");
  await expectInViewport(page, page.locator("#eq-q-help"));
  await page.locator("#guide-q").focus();
  await expect(page.locator("#eq-q-help")).toBeVisible();
  await page.locator("#original-button").click();
  await expect(page.locator("#eq-q-help")).toBeHidden();
  await expect(page.locator("#guide-bypassed")).toBeVisible();
  await expect(page.locator("#guide-bypassed")).toHaveText(
    "Original signal — EQ is bypassed.",
  );
  await expect(page.locator("#guide-active")).toBeHidden();
  await page.locator("#train-mode").click();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
});

test("expanded settings and explanations fit even a small viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.locator("#difficulty").click();
  await expectInViewport(page, page.locator("#difficulty-menu"));
  await difficultyOption(page, "Advanced").click();
  await expect(page.locator("#difficulty-value")).toHaveText("Advanced");
  await page.locator("#q-label").click();
  await expect(page.locator("#eq-q-help")).toBeVisible();
  await expectInViewport(page, page.locator("#eq-q-help"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("revealed gain explains its value without duplicating presets in Help", async ({
  page,
}) => {
  await reveal(page);
  await page.locator('#feedback [data-parameter-help="gain"]').focus();
  await expect(page.locator("#eq-gain-help")).toBeVisible();
  await page.locator("#help-button").click();
  await expect(page.locator("#eq-gain-help")).toBeHidden();
  await expect(page.locator("#help-dialog [data-parameter-help]")).toHaveCount(
    0,
  );
  await expect(page.locator("#help-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-dialog")).toBeHidden();
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
});
