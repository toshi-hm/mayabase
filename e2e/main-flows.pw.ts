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

  test("カテゴリ別・シリーズ別ページの検索がタイトルだけでなく概要欄本文にも一致する(#442)", async ({
    page,
  }) => {
    for (const path of ["/videos/category/ai/", "/videos/series/futatsu-no-waraji/"]) {
      await page.goto(path);

      const grid = page.locator("#archive-grid");
      const firstCard = grid.locator(":scope > li").first();
      const videoId = await firstCard.getAttribute("data-video-id");
      expect(videoId).toBeTruthy();

      // /video-descriptions.json をモックし、対象動画の概要欄にしか登場しない語を仕込む。
      // タイトルには含まれない語のため、概要欄検索が機能して初めてヒットする。
      await page.route("**/video-descriptions.json", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ [videoId as string]: "__description-only-keyword__" }),
        }),
      );

      const search = page.locator("#archive-search");
      await search.fill("__description-only-keyword__");

      // 説明データの取得(非同期)完了後に再フィルタされ、対象動画だけがヒットする
      await expect(page.locator("#archive-count")).toHaveText("1 件");
      await expect(grid.locator(`:scope > li[data-video-id="${videoId}"]`)).toBeVisible();

      await page.unroute("**/video-descriptions.json");
    }
  });

  test("概要欄データの取得に失敗してもカテゴリ別ページのタイトル検索は継続する(#442)", async ({
    page,
  }) => {
    await page.route("**/video-descriptions.json", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );

    await page.goto("/videos/category/ai/");

    const search = page.locator("#archive-search");
    await search.fill("__definitely-no-match__");

    await expect(page.locator("#archive-count")).toHaveText("0 件");
    await expect(page.locator("#archive-empty")).toBeVisible();
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
