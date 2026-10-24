import { test, expect } from "@playwright/test";

test("footer links to source, issue reporting, and donations", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  for (const [name, url] of [
    ["Source on GitHub", "https://github.com/a-chen/eq-trainer"],
    ["Report an issue", "https://github.com/a-chen/eq-trainer/issues"],
    ["Buy me a coffee", "https://buymeacoffee.com/andrew.chen"],
  ]) {
    const link = footer.getByRole("link", { name });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});
