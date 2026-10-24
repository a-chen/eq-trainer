import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function expectInViewport(page: Page, selector: string) {
  const element = page.locator(selector);
  await expect(element).toBeVisible();
  const box = await element.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, selector).not.toBeNull();
  expect(box!.y, selector).toBeGreaterThanOrEqual(0);
  expect(box!.x, selector).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, selector).toBeLessThanOrEqual(
    viewport.height + 1,
  );
  expect(box!.x + box!.width, selector).toBeLessThanOrEqual(viewport.width + 1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
});

test("Learn fits the plots, controls, and contextual right-hand guide on common desktop screens", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Desktop viewport contract");
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator("#learn-mode").click();
    await page.evaluate(() => document.fonts.ready);
    for (const selector of [
      "#eq-graph",
      "#spectrum-canvas",
      "#source",
      "#play-button",
      "#learn-frequency",
      "#learn-gain",
      "#learn-q",
      ".learn-presets",
    ]) {
      await expectInViewport(page, selector);
    }
    await expectInViewport(page, ".sidebar");
    await expectInViewport(page, "#learn-region");
    await expectInViewport(page, "#learn-description");
    await expectInViewport(page, ".sidebar .key-hints");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const graph = await page.locator("#eq-graph").boundingBox();
    const guide = await page.locator(".sidebar").boundingBox();
    expect(guide!.x).toBeGreaterThan(graph!.x + graph!.width);
    await page.locator('[data-learn-frequency="315"]').click();
    await expect(page.locator(".sidebar #learn-region")).toHaveText(
      "315 Hz · Low mids",
    );
    await expect(page.locator(".sidebar #learn-description")).toContainText(
      "boxiness",
    );
    await expect(page.locator(".sidebar #accuracy-value")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`learn-${viewport.width}.png`),
    });
  }
});

test("training guidance stays generic until the answer is revealed", async ({
  page,
}) => {
  await expect(page.locator("#train-region")).toHaveText(
    "Compare Original and With EQ",
  );
  expect(await page.locator(".sidebar").innerText()).not.toContain("160 Hz");
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeEnabled();
  await page.locator("#skip-button").click();
  await expect(page.locator("#train-region")).toHaveText("160 Hz · Bass");
  await expect(page.locator("#train-description")).toContainText("warmth");
  await page.locator("#next-button").click();
  await expect(page.locator("#train-region")).toHaveText(
    "Compare Original and With EQ",
  );
  expect(await page.locator(".sidebar").innerText()).not.toContain("160 Hz");
});

test("the current learning hint remains beside the interaction on narrow screens", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(!isMobile, "Mobile viewport contract");
  await page.locator("#learn-mode").click();
  await page.locator('[data-learn-frequency="2500"]').click();
  await page.locator("#eq-graph").scrollIntoViewIfNeeded();
  await expect(page.locator("#learn-region")).toHaveText(
    "2.5 kHz · Upper mids",
  );
  await expectInViewport(page, "#eq-graph");
  await expectInViewport(page, "#learn-region");
  await expectInViewport(page, "#learn-description");
  await expectInViewport(page, "#source");
  await expectInViewport(page, "#play-button");
  await expectInViewport(page, "#spectrum-canvas");
  await expectInViewport(page, "#learn-controls");
  const guide = await page.locator(".sidebar").boundingBox();
  const graph = await page.locator("#eq-graph").boundingBox();
  expect(guide!.y + guide!.height).toBeLessThanOrEqual(graph!.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("mobile-learn.png") });
});
