import { expect, test } from "@playwright/test";

const widths = [390, 768, 1180, 1440, 1920] as const;

for (const width of widths) {
  test(`layout has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("不再从零开始");
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("core actions and public team data are correct", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /下载最新版本/ }).first()).toHaveAttribute(
    "href",
    "https://github.com/MihYux/ReHoYo/releases/latest",
  );
  await expect(page.getByRole("link", { name: /查看 GitHub 仓库/ }).first()).toHaveAttribute(
    "href",
    "https://github.com/MihYux/ReHoYo",
  );
  await expect(page.locator(".contributor-card")).toHaveCount(3);
  await expect(page.getByText("Claude", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /SHA256SUMS/ })).toHaveAttribute(
    "href",
    /v0\.1\.2\/SHA256SUMS\.txt$/,
  );
});

test("workflow selection and gallery lightbox work by keyboard", async ({ page }) => {
  await page.goto("/");
  const releaseTab = page.getByRole("tab", { name: /角色发行/ });
  await releaseTab.click();
  await expect(releaseTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("可控、可撤回");

  const galleryTrigger = page.getByRole("button", { name: /放大查看/ }).first();
  await galleryTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("all locally rendered images load", async ({ page }) => {
  await page.goto("/");
  await page.locator("#workflow").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.locator("#preview").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.locator("#team").scrollIntoViewIfNeeded();
  await expect.poll(async () => page.locator("img").count()).toBeGreaterThan(0);
  const failed = await page.locator("img").evaluateAll((images) =>
    images.filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0)
      .map((image) => (image as HTMLImageElement).src),
  );
  expect(failed).toEqual([]);
});
