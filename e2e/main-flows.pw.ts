import { expect, test } from "@playwright/test";

test.describe("主要導線", () => {
  test("動画ライブラリのカテゴリ絞り込みと検索を操作できる", async ({ page }) => {
    await page.goto("/videos/");

    const aiFilter = page.locator('[data-filter-category="ai"]');
    await expect(aiFilter).toBeVisible();
    await aiFilter.click();
    await expect(aiFilter).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/videos\/\?category=ai$/);
    await expect(page.locator("#videos-count")).not.toHaveText("0 件");

    const search = page.locator("#video-search");
    await search.fill("AI");
    await expect(page).toHaveURL(/q=AI/);
    await expect(page.locator("#videos-count")).not.toHaveText("0 件");
  });

  test("トップページのカルーセルを停止して手動操作できる", async ({ page }) => {
    await page.goto("/");

    const carousel = page.locator("[data-carousel]").first();
    const toggle = carousel.locator("[data-carousel-toggle]");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", "自動切替を再開");

    const next = carousel.locator("[data-carousel-next]");
    await expect(next).toBeEnabled();
    await next.click();
    await expect(carousel.locator('[data-carousel-dots] button[aria-current="true"]')).toHaveCount(
      1,
    );
  });

  test("動画カードのライトボックスを開閉できる", async ({ page }) => {
    await page.goto("/videos/");

    await page.locator("button[data-lightbox-video-id]").first().click();
    await expect(page.locator("#video-lightbox")).toBeVisible();
    await expect(page.locator("#video-lightbox-iframe")).toHaveAttribute("src", /autoplay=1/);

    await page.locator("[data-lightbox-close]").click();
    await expect(page.locator("#video-lightbox")).toBeHidden();
  });
});
