import { expect, test } from "@playwright/test";

test.describe("主要導線", () => {
  test("動画ライブラリのカテゴリ絞り込みと検索を操作できる", async ({ page }) => {
    await page.goto("/videos/");

    const aiFilter = page.locator('[data-filter-category="ai"]');
    await expect(aiFilter).toBeVisible();
    await aiFilter.click();
    await expect(aiFilter).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/videos\/\?category=ai$/);
    const visibleNonAiCards = page.locator(
      '#videos-grid > li:not([hidden]):not([data-category="ai"])',
    );
    await expect(visibleNonAiCards).toHaveCount(0);
    await expect(page.locator("#videos-count")).toHaveText(/^[1-9][0-9]* 件$/);

    const search = page.locator("#video-search");
    await search.fill("__definitely-no-match__");
    await expect(page).toHaveURL(/q=__definitely-no-match__/);
    await expect(page.locator("#videos-count")).toHaveText("0 件");
    await expect(page.locator("#videos-empty")).toBeVisible();
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
    const selectedBefore = await carousel
      .locator('[data-carousel-dots] button[aria-current="true"]')
      .getAttribute("aria-label");
    await next.click();
    await expect
      .poll(() =>
        carousel
          .locator('[data-carousel-dots] button[aria-current="true"]')
          .getAttribute("aria-label"),
      )
      .not.toBe(selectedBefore);
  });

  test("動画カードのライトボックスを開閉できる", async ({ page }) => {
    await page.goto("/videos/");

    await page.locator("button[data-lightbox-video-id]").first().click();
    await expect(page.locator("#video-lightbox")).toBeVisible();
    await expect(page.locator("#video-lightbox-iframe")).toHaveAttribute("src", /autoplay=1/);

    await page.locator("[data-lightbox-close]").click();
    await expect(page.locator("#video-lightbox")).toBeHidden();
  });

  test("カテゴリ別ページで「もっと見る」から未実体化の動画を表示できる(#419)", async ({ page }) => {
    // vlog カテゴリは INITIAL_COUNT(12件)を超える動画数があり、超過分が <template> として
    // 描画される(未クリック時は #archive-grid > li が12件のみ存在するはず)
    await page.goto("/videos/category/vlog/");

    const grid = page.locator("#archive-grid");
    await expect(grid.locator(":scope > li")).toHaveCount(12);
    await expect(grid.locator(":scope > template[data-video-slot]").first()).toBeAttached();

    const moreButton = page.locator("#archive-more");
    await expect(moreButton).toBeVisible();
    await expect(moreButton).toHaveText(/もっと見る/);

    await moreButton.click();

    await expect(moreButton).toBeHidden();
    await expect(grid.locator(":scope > template[data-video-slot]")).toHaveCount(0);
    // フォーカスが新たに実体化された最初のカードのリンクへ移る
    await expect(page.locator(":focus")).toHaveAttribute("target", "_blank");
  });

  test("動画詳細ページの「次の動画」オーバーレイをEscapeキーで閉じられる(#382)", async ({
    page,
  }) => {
    // 実際の YouTube IFrame Player API を読み込まず、ENDED イベントを直接発火できるように
    // window.YT をモックへ差し替える(本物のAPIも読み込み完了時に window.onYouTubeIframeAPIReady()
    // を呼び出すため、その契約だけを再現する)。
    await page.route("https://www.youtube.com/iframe_api", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `
          window.YT = {
            PlayerState: { ENDED: 0, PLAYING: 1 },
            Player: function (_el, options) {
              window.__ytEvents = options.events;
              return {
                destroy() {},
                seekTo() {},
                playVideo() {},
                getCurrentTime() { return 0; },
              };
            },
          };
          if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
        `,
      }),
    );

    // 最新動画ではない(＝「次の動画」が存在する)動画を使う
    await page.goto("/videos/ewXEHL6jKIw/");

    await page.waitForFunction(() => "__ytEvents" in window);
    await page.evaluate(() => {
      const { onStateChange } = window.__ytEvents;
      onStateChange({ data: window.YT.PlayerState.ENDED });
    });

    const overlay = page.locator("#next-video-overlay");
    await expect(overlay).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
  });
});

declare global {
  interface Window {
    __ytEvents: { onStateChange: (event: { data: number }) => void };
    YT: { PlayerState: { ENDED: number; PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}
