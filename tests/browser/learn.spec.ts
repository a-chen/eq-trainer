import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function graphBounds(page: Page) {
  const graph = page.locator("#eq-graph");
  await graph.scrollIntoViewIfNeeded();
  const bounds = await graph.boundingBox();
  if (!bounds) throw new Error("No graph");
  return bounds;
}
async function barPixels(page: Page) {
  return page.locator("#spectrum-canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const image = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < image.length; i += 4)
      if (image[i] === 120 && image[i + 1] === 153 && image[i + 2] === 105)
        count++;
    return count;
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
});

test("Learn previews its own curve, click starts listening, drag sweeps and clamps", async ({
  page,
  isMobile,
}) => {
  await page.locator("#learn-mode").click();
  await expect(page.locator("#training-controls")).toBeHidden();
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(1);
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-valuenow",
    "1000",
  );
  await expect(page.locator("#learn-frequency-value")).toHaveText("1 kHz");
  await expect(page.locator("#live-analysis")).toBeVisible();
  const bounds = await graphBounds(page);
  const y = bounds.y + bounds.height / 2;
  if (isMobile) await page.touchscreen.tap(bounds.x + bounds.width / 2, y);
  else await page.mouse.click(bounds.x + bounds.width / 2, y);
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("#learn-frequency-value")).toHaveText(
    /6[0-9]{2} Hz/,
  );
  await page.mouse.move(bounds.x + bounds.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, y, { steps: 8 });
  expect(
    Number(await page.locator("#eq-graph").getAttribute("aria-valuenow")),
  ).toBeGreaterThan(4900);
  await page.mouse.move(bounds.x - 10, y, { steps: 5 });
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-valuenow",
    "20",
  );
  await page.mouse.up();
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("learn sliders, presets, A/B, and both sources drive a real live spectrum", async ({
  page,
}, testInfo) => {
  await page.locator("#learn-mode").click();
  await page.locator('[data-learn-frequency="1250"]').click();
  await expect(page.locator("#learn-frequency-value")).toHaveText("1.25 kHz");
  await expect.poll(() => barPixels(page)).toBeGreaterThan(500);
  await page.locator("#learn-gain").fill("-6");
  await page.locator("#learn-q").fill("3");
  await expect(page.locator("#learn-gain-value")).toHaveText("−6 dB");
  await expect(page.locator("#learn-q-value")).toHaveText("3");
  await page.locator("#source").click();
  await page.locator('[data-source="groove"]').click();
  await expect.poll(() => barPixels(page)).toBeGreaterThan(500);
  await page.locator("#original-button").click();
  await expect(page.locator("#analysis-status")).toHaveText("LIVE · ORIGINAL");
  await expect(page.locator("#eq-graph .response-line")).toHaveClass(
    /bypassed/,
  );
  await page.locator("#eq-button").click();
  await expect(page.locator("#analysis-status")).toHaveText("LIVE · WITH EQ");
  await page.screenshot({
    path: testInfo.outputPath("learn.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pause audio", exact: true }).click();
  expect(await barPixels(page)).toBe(0);
  await expect(page.locator("#analysis-status")).toContainText("paused");
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
});

test("mode switching restores the hidden challenge, does not leak the answer, and remembers learning settings", async ({
  page,
}) => {
  await page.locator("#learn-mode").click();
  await page.locator('[data-learn-frequency="5000"]').click();
  await page.locator("#train-mode").click();
  await expect(page.locator("#live-analysis")).toBeHidden();
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(0);
  await expect(page.locator("#round-label")).toHaveText("ROUND 01");
  const bounds = await graphBounds(page);
  await page.locator("#eq-graph").click({
    position: {
      x: (Math.log(160 / 20) / Math.log(1000)) * bounds.width,
      y: bounds.height / 2,
    },
  });
  await expect(page.locator("#feedback")).toContainText("On target.");
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
  await page.locator("#learn-mode").click();
  await expect(page.locator("#learn-frequency-value")).toHaveText("5 kHz");
  await page.locator("#train-mode").click();
  await expect(page.locator("#feedback")).toContainText("On target.");
  await expect(page.locator("#eq-graph .answer-label")).toHaveText("160 Hz");
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
});

test("Learn discards the hidden training FFT history and waits for a fresh window", async ({
  page,
}) => {
  await page.evaluate(() => {
    const create = AudioContext.prototype.createAnalyser;
    const frames: { elapsed: number; required: number }[] = [];
    const created: AnalyserNode[] = [];
    Object.assign(window, {
      testSpectrumFrames: frames,
      testAnalysers: created,
    });
    AudioContext.prototype.createAnalyser = function () {
      const node = create.call(this);
      const start = this.currentTime;
      const read = node.getFloatFrequencyData.bind(node);
      node.getFloatFrequencyData = (array) => {
        frames.push({
          elapsed: this.currentTime - start,
          required: 0.035 + node.fftSize / this.sampleRate,
        });
        read(array);
      };
      created.push(node);
      return node;
    };
  });
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(450);
  await page.locator("#learn-mode").click();
  await expect.poll(() => barPixels(page)).toBeGreaterThan(500);
  const values = await page.evaluate(() => {
    const state = window as unknown as {
      testSpectrumFrames: { elapsed: number; required: number }[];
      testAnalysers: AnalyserNode[];
    };
    return {
      frames: state.testSpectrumFrames,
      analysers: state.testAnalysers.length,
    };
  });
  expect(values.analysers).toBeGreaterThanOrEqual(2);
  expect(values.frames.length).toBeGreaterThan(0);
  expect(values.frames.every((frame) => frame.elapsed >= frame.required)).toBe(
    true,
  );
});

test("low sample rates clamp learning controls to the applied frequency and never draw NaN paths", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeContext = AudioContext;
    Object.defineProperty(window, "AudioContext", {
      value: class extends NativeContext {
        constructor() {
          super({ sampleRate: 32000 });
        }
      },
      configurable: true,
    });
  });
  await page.reload();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.locator("#learn-mode").click();
  await page.locator("#eq-graph").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#learn-frequency-value")).toHaveText("20 kHz");
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-valuemax",
    "15680",
  );
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-valuenow",
    "15680",
  );
  await expect(page.locator("#learn-frequency-value")).toHaveText("15.68 kHz");
  await expect(page.locator("#sweep-instructions")).toContainText("15.68 kHz");
  expect(
    await page.locator("#eq-graph .response-line").getAttribute("d"),
  ).not.toContain("NaN");
  expect(errors).toEqual([]);
});

test("H/L sweep frequency with octave modifiers, repeat, and native form protection", async ({
  page,
}) => {
  await page.locator("#learn-mode").click();
  const graph = page.locator("#eq-graph");
  for (const [key, frequency] of [
    ["l", "1059"],
    ["h", "1000"],
    ["ArrowRight", "1059"],
    ["ArrowLeft", "1000"],
    ["Shift+L", "2000"],
    ["Shift+H", "1000"],
  ]) {
    await page.keyboard.press(key);
    await expect(graph).toBeFocused();
    await expect(graph).toHaveAttribute("aria-valuenow", frequency);
  }
  await graph.dispatchEvent("keydown", { key: "l", repeat: true });
  await expect(graph).toHaveAttribute("aria-valuenow", "1059");
  for (const id of ["learn-frequency", "source"]) {
    await page.locator(`#${id}`).focus();
    await page.keyboard.press("h");
    await expect(page.locator(`#${id}`)).toBeFocused();
    await expect(graph).toHaveAttribute("aria-valuenow", "1059");
  }
  await page.locator("#help-button").focus();
  await page.keyboard.press("l");
  await expect(graph).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("l");
  await expect(graph).toHaveAttribute("aria-valuenow", "20000");
  await page.keyboard.press("Home");
  await page.keyboard.press("h");
  await expect(graph).toHaveAttribute("aria-valuenow", "20");
  await page.keyboard.press("t");
  await page.keyboard.press("l");
  await expect(graph).toHaveAttribute("aria-valuenow", "1250");
  await page.keyboard.press("Space");
  await expect(page.locator("#play-button")).toHaveAttribute(
    "aria-label",
    "Pause audio",
  );
  await page.keyboard.press("Home");
  await page.keyboard.press("l");
  await expect(graph).toHaveAttribute("aria-valuenow", "160");
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  await page.keyboard.press("Enter");
  await expect(page.locator("#feedback")).toContainText("On target.");
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
});

test("graph keyboard controls sweep in Learn and aim then immediately score in Train", async ({
  page,
}) => {
  await page.locator("#learn-mode").click();
  await page.locator("#eq-graph").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-valuenow",
    "2000",
  );
  await page.keyboard.press("Home");
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-valuenow",
    "20",
  );
  await page.keyboard.press("End");
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-valuenow",
    "20000",
  );
  await page.locator("#train-mode").click();
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeEnabled();
  await page.locator("#eq-graph").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-valuenow",
    "160",
  );
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  await page.keyboard.press("Enter");
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
  await expect(page.locator("#feedback")).toContainText("On target.");
  await expect(page.locator("#round-label")).toHaveText("ROUND 01");
});
