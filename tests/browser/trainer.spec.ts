import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function start(page: Page) {
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeEnabled();
}
async function clickFrequency(page: Page, frequency: number, force = false) {
  const graph = page.locator("#eq-graph");
  await graph.scrollIntoViewIfNeeded();
  const bounds = await graph.boundingBox();
  if (!bounds) throw new Error("Graph is not visible");
  await graph.click({
    force,
    position: {
      x: (Math.log(frequency / 20) / Math.log(1000)) * bounds.width,
      y: bounds.height / 2,
    },
  });
}
async function openPracticeHistory(page: Page) {
  await page.locator("#help-button").click();
  await page.locator("#stats-details > summary").click();
}
function wavFile() {
  const sampleRate = 8000;
  const frames = 4000;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    bytes.writeInt16LE(
      Math.round(Math.sin((i / sampleRate) * 440 * Math.PI * 2) * 8000),
      44 + i * 2,
    );
  return bytes;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto("/");
});

test("complete a blind round, compare A/B, score once, and persist stats", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Find the frequency.",
  );
  await expect(page.locator(".intro, .tip-card, .how-it-works")).toHaveCount(0);
  const graphPosition = await page.locator("#eq-graph").boundingBox();
  expect(graphPosition).not.toBeNull();
  expect(graphPosition!.y + graphPosition!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await expect(page.locator(".frequency-button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check answer" })).toHaveCount(
    0,
  );
  await expect(page.locator("#next-button")).toBeHidden();
  await clickFrequency(page, 160, true);
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(0);
  await start(page);
  await page.locator("#original-button").click();
  await expect(page.locator("#original-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#eq-button").click();
  await expect(page.locator("#eq-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(0);
  await clickFrequency(page, 160);
  await expect(page.locator("#feedback")).toContainText("On target.");
  await expect(page.locator("#feedback")).toContainText("+100 pts");
  await expect(page.locator("#accuracy-value")).toHaveText("100%");
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(1);
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
  await expect(page.locator("#eq-graph .answer-label")).toHaveText("160 Hz");
  await clickFrequency(page, 5000, true);
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
  await page.getByRole("button", { name: "Next round" }).click();
  await expect(page.locator("#round-label")).toHaveText("ROUND 02");
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(page.locator("#accuracy-value")).toHaveText("50%");
  await expect(page.locator("#streak-value")).toHaveText("0 in a row");
  await expect(page.locator("#attempts-label")).toHaveText("2 played");
  await page.reload();
  await expect(page.locator("#accuracy-value")).toHaveText("50%");
  await expect(page.locator("#points-value")).toHaveText("100");
  expect(errors).toEqual([]);
});

test("difficulty, cut, and mixed settings reset only the current challenge", async ({
  page,
}) => {
  await start(page);
  await page.locator("#difficulty").click();
  await page
    .locator("#difficulty-menu")
    .getByRole("button", { name: "Advanced", exact: true })
    .click();
  await expect(page.locator("#eq-graph")).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect(page.locator("#gain-label")).toHaveText("+6 dB");
  await expect(page.locator("#q-label")).toHaveText("Q 3");
  await page.locator("#change-type").click();
  await page.locator('[data-change="mixed"]').click();
  await expect(page.locator("#gain-label")).toHaveText("±6 dB");
  await expect(page.locator("#eq-graph")).not.toHaveAttribute(
    "aria-label",
    /Answer:/,
  );
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(page.locator("#gain-label")).toHaveText("−6 dB");
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(1);
  await page.locator("#change-type").click();
  await page.locator('[data-change="cut"]').click();
  await expect(page.locator("#gain-label")).toHaveText("−6 dB");
  await expect(page.locator("#eq-graph .response-line")).toHaveCount(0);
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
});

test("audio sources, valid local upload, and failed upload recovery", async ({
  page,
}) => {
  await start(page);
  await page.locator("#source").click();
  await page.locator('[data-source="groove"]').click();
  await expect(page.locator("#source-value")).toHaveText("Studio groove");
  await page.locator("#audio-file").setInputFiles({
    name: "test-tone.wav",
    mimeType: "audio/wav",
    buffer: wavFile(),
  });
  await expect(page.locator('[data-source="upload"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#source-value")).toHaveText("test-tone.wav");
  await page.locator("#audio-file").setInputFiles({
    name: "invalid.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("not audio"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be decoded");
  await expect(page.locator('[data-source="upload"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#source-value")).toHaveText("test-tone.wav");
  await expect(page.locator("#upload-button")).toBeEnabled();
  await page.getByRole("button", { name: "Pause audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play audio", exact: true }),
  ).toBeEnabled();
});

test("help dialog and reset confirmation work with keyboard", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Help" }).click();
  await expect(page.locator("#help-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-dialog")).not.toBeVisible();
  await start(page);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await openPracticeHistory(page);
  await page.getByRole("button", { name: "Reset stats", exact: true }).click();
  await expect(page.locator("#reset-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep practicing" }).click();
  await expect(page.locator("#attempts-label")).toHaveText("1 played");
  await page.getByRole("button", { name: "Reset stats", exact: true }).click();
  await page.locator("#confirm-reset").click();
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  await expect(page.locator("#accuracy-value")).toHaveText("—");
});

test("compact keyboard controls switch modes, focus the graph, and show help without intercepting forms", async ({
  page,
}) => {
  await page.keyboard.press("t");
  await expect(page.locator("#learn-mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#eq-graph")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  expect(
    Number(await page.locator("#eq-graph").getAttribute("aria-valuenow")),
  ).toBeGreaterThan(1000);
  await page.keyboard.press("t");
  await expect(page.locator("#train-mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#eq-graph")).toBeFocused();
  await page.keyboard.press("?");
  await expect(page.locator("#help-dialog")).toBeVisible();
  await expect(page.locator("#help-dialog")).toContainText(
    "Subtler Train / lower Learn dB",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-dialog")).toBeHidden();
  await page.locator("#difficulty").focus();
  await page.keyboard.press("t");
  await expect(page.locator("#train-mode")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#difficulty")).toBeFocused();
  await page.locator("#help-button").focus();
  await page.keyboard.press("g");
  await expect(page.locator("#eq-graph")).toBeFocused();
});

test("A/B and playback shortcuts work while transport buttons have focus", async ({
  page,
}) => {
  await start(page);
  await page.locator("#original-button").click();
  await page.keyboard.press("b");
  await expect(page.locator("#eq-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("a");
  await expect(page.locator("#original-button")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Play audio", exact: true }),
  ).toBeEnabled();
});

test("a finished upload does not override a newer source selection", async ({
  page,
}) => {
  await page.evaluate(() => {
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = async function (
      bytes: ArrayBuffer,
    ) {
      const buffer = await decode.call(this, bytes);
      await new Promise((resolve) => setTimeout(resolve, 350));
      return buffer;
    };
  });
  await start(page);
  await page.locator("#audio-file").setInputFiles({
    name: "delayed.wav",
    mimeType: "audio/wav",
    buffer: wavFile(),
  });
  await page.locator("#source").click();
  await page.locator('[data-source="groove"]').click();
  await expect(page.locator("#upload-label")).toHaveText("Use your audio");
  await expect(page.locator("#source-value")).toHaveText("Studio groove");
  await expect(page.locator("#upload-title")).toHaveText("delayed.wav");
});

test("pending playback is cancelled when the page is hidden or leaves", async ({
  page,
}) => {
  for (const event of ["visibilitychange", "pagehide"]) {
    await page.reload();
    await page.evaluate(() => {
      const resume = AudioContext.prototype.resume;
      AudioContext.prototype.resume = async function () {
        await resume.call(this);
        await new Promise((resolve) => setTimeout(resolve, 250));
      };
    });
    await page.getByRole("button", { name: "Play audio", exact: true }).click();
    await page.evaluate((event) => {
      if (event === "visibilitychange") {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event(event));
      } else window.dispatchEvent(new Event(event));
    }, event);
    await page.waitForTimeout(400);
    await expect(
      page.getByRole("button", { name: "Play audio", exact: true }),
    ).toBeEnabled();
    await expect(page.locator("#skip-button")).toBeDisabled();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
    });
    await start(page);
  }
});

test("pause resumes the audio position rather than restarting the loop", async ({
  page,
}) => {
  await page.evaluate(() => {
    const offsets: number[] = [];
    Object.assign(window, { testOffsets: offsets });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      when = 0,
      offset = 0,
      duration?: number,
    ) {
      offsets.push(offset);
      if (duration === undefined) start.call(this, when, offset);
      else start.call(this, when, offset, duration);
    };
  });
  await start(page);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Pause audio", exact: true }).click();
  await start(page);
  const offsets = await page.evaluate(
    () => (window as unknown as { testOffsets: number[] }).testOffsets,
  );
  expect(offsets).toHaveLength(2);
  expect(offsets[0]).toBe(0);
  expect(offsets[1]).toBeGreaterThan(0.1);
});

test("multiple tabs synchronize scores and resets without lost updates", async ({
  page,
  context,
}) => {
  await start(page);
  const other = await context.newPage();
  await other.addInitScript(() => {
    Math.random = () => 0;
  });
  await other.goto("/");
  await start(other);
  await Promise.all([
    page.getByRole("button", { name: "Reveal answer", exact: true }).click(),
    other.getByRole("button", { name: "Reveal answer", exact: true }).click(),
  ]);
  await expect(page.locator("#attempts-label")).toHaveText("2 played");
  await expect(other.locator("#attempts-label")).toHaveText("2 played");
  await openPracticeHistory(other);
  await other.getByRole("button", { name: "Reset stats", exact: true }).click();
  await other.locator("#confirm-reset").click();
  await expect(page.locator("#attempts-label")).toHaveText("0 played");
  await expect(other.locator("#attempts-label")).toHaveText("0 played");
  await other.close();
});

test("layout stays within the viewport and renders cleanly", async ({
  page,
}, testInfo) => {
  await page.evaluate(() => document.fonts.ready);
  const overflowing = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflowing).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("trainer.png"),
    fullPage: true,
  });
  await start(page);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("answer.png"),
    fullPage: true,
  });
});
