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

  test("検索欄のクリアボタンで絞り込みを解除できる", async ({ page }) => {
    await page.goto("/videos/?q=__definitely-no-match__");

    const search = page.locator("#video-search");
    const clear = page.locator('[data-search-clear-for="video-search"]');
    await expect(search).toHaveValue("__definitely-no-match__");
    await expect(clear).toBeVisible();
    await expect(page.locator("#videos-count")).toHaveText("0 件");

    await clear.click();

    await expect(search).toHaveValue("");
    await expect(clear).toBeHidden();
    await expect(search).toBeFocused();
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.locator("#videos-count")).toHaveText(/^[1-9][0-9]* 件$/);
  });

  test("各検索画面でクリアボタンを利用できる", async ({ page }) => {
    const searchPages = [
      { path: "/videos/", id: "video-search" },
      { path: "/videos/category/ai/", id: "archive-search" },
      { path: "/videos/series/futatsu-no-waraji/", id: "archive-search" },
      { path: "/gear/", id: "gear-search" },
      { path: "/faq/", id: "faq-search" },
      { path: "/glossary/", id: "glossary-search" },
      { path: "/topics/", id: "topics-search" },
    ];

    for (const { path, id } of searchPages) {
      await page.goto(`${path}?q=__clearable__`);
      const search = page.locator(`#${id}`);
      const clear = page.locator(`[data-search-clear-for="${id}"]`);
      await expect(search).toHaveValue("__clearable__");
      await expect(clear).toBeVisible();
      await clear.click();
      await expect(search).toHaveValue("");
      await expect(clear).toBeHidden();
      await expect(search).toBeFocused();
      await expect(page).not.toHaveURL(/q=/);
    }
  });

  test("ヘッダー検索のクリアボタンを利用できる", async ({ page }) => {
    await page.goto("/videos/");
    const toggle = page.locator("#site-search-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const search = page.locator("#site-search-input");
    const clear = page.locator('[data-search-clear-for="site-search-input"]');
    await expect(search).toBeVisible();
    await search.fill("動画");
    await expect(clear).toBeVisible();

    await clear.click();

    await expect(search).toHaveValue("");
    await expect(clear).toBeHidden();
    await expect(search).toBeFocused();

    await toggle.click();
    await expect(page.locator("#site-search-panel")).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
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
