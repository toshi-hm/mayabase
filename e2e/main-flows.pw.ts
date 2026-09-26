import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { WATCH_LATER_STORAGE_KEY } from "../src/lib/watchLater";

const videosDataPath = fileURLToPath(new URL("../src/data/videos.json", import.meta.url));
const videosData: { videos: { id: string }[] } = JSON.parse(readFileSync(videosDataPath, "utf-8"));

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

  test("カルーセルのループ折り返し地点(最後→最初)でもスライド間と同じ gap が効いている(#489)", async ({
    page,
  }) => {
    await page.goto("/");

    const container = page.locator("section:has(#shorts-heading) [data-carousel-container]");
    const gap = await container.evaluate((el) => getComputedStyle(el).columnGap);
    const lastChildMarginEnd = await container.evaluate((el) => {
      const last = el.lastElementChild as HTMLElement;
      return getComputedStyle(last).marginInlineEnd;
    });

    expect(lastChildMarginEnd).toBe(gap);
  });

  test("「気になる」ボタンをキーボード操作すると送信失敗後もフォーカスが維持される(#505)", async ({
    page,
  }) => {
    await page.goto("/videos/");

    await page.route("**/api/video-reaction*", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ count: 0 }),
        });
      }
      // わざと失敗させ、ボタンが再度有効化される経路(disabled→focus復元)を検証する
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "fail" }),
      });
    });

    const button = page.locator("[data-interest-video-id]").first();
    await button.focus();
    await expect(button).toBeFocused();

    await page.keyboard.press("Enter");

    await expect(button).toBeEnabled();
    await expect(button).toBeFocused();
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

  test("動画ライブラリ・カテゴリ別・シリーズ別ページの検索が文字起こし本文にも一致する(#480)", async ({
    page,
  }) => {
    for (const { path, gridSelector, countSelector, searchSelector } of [
      {
        path: "/videos/",
        gridSelector: "#videos-grid",
        countSelector: "#videos-count",
        searchSelector: "#video-search",
      },
      {
        path: "/videos/category/ai/",
        gridSelector: "#archive-grid",
        countSelector: "#archive-count",
        searchSelector: "#archive-search",
      },
      {
        path: "/videos/series/futatsu-no-waraji/",
        gridSelector: "#archive-grid",
        countSelector: "#archive-count",
        searchSelector: "#archive-search",
      },
    ]) {
      await page.goto(path);

      const grid = page.locator(gridSelector);
      const firstCard = grid.locator(":scope > li").first();
      const videoId = await firstCard.getAttribute("data-video-id");
      expect(videoId).toBeTruthy();

      // /video-transcripts.json をモックし、対象動画の字幕にしか登場しない語を仕込む。
      // タイトル・概要欄には含まれない語のため、文字起こし検索が機能して初めてヒットする。
      await page.route("**/video-transcripts.json", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ [videoId as string]: "__transcript-only-keyword__" }),
        }),
      );

      const search = page.locator(searchSelector);
      await search.fill("__transcript-only-keyword__");

      // 文字起こしデータの取得(非同期)完了後に再フィルタされ、対象動画だけがヒットする
      await expect(page.locator(countSelector)).toHaveText("1 件");
      await expect(grid.locator(`:scope > li[data-video-id="${videoId}"]`)).toBeVisible();

      await page.unroute("**/video-transcripts.json");
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

  test("検索を使わずに/videos/を開いても概要欄データを取得しない(#459)", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/video-descriptions.json", (route) => {
      requestCount += 1;
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });

    await page.goto("/videos/");
    await expect(page.locator("#videos-count")).toHaveText(/^[1-9][0-9]* 件$/);
    expect(requestCount).toBe(0);

    // 検索語を入力した時点で初めて取得される(遅延取得そのものが壊れていないことも確認する)
    await page.locator("#video-search").fill("keyword");
    await expect.poll(() => requestCount).toBe(1);

    await page.unroute("**/video-descriptions.json");
  });

  test("ブラウザ「戻る」で検索状態に復元された際も概要欄検索が機能する(#461)", async ({ page }) => {
    for (const { path, gridSelector, countSelector, searchSelector } of [
      {
        path: "/videos/category/ai/",
        gridSelector: "#archive-grid",
        countSelector: "#archive-count",
        searchSelector: "#archive-search",
      },
      {
        path: "/videos/",
        gridSelector: "#videos-grid",
        countSelector: "#videos-count",
        searchSelector: "#video-search",
      },
    ]) {
      await page.goto(path);

      const grid = page.locator(gridSelector);
      const firstCard = grid.locator(":scope > li").first();
      const videoId = await firstCard.getAttribute("data-video-id");
      expect(videoId).toBeTruthy();

      await page.route("**/video-descriptions.json", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ [videoId as string]: "__description-only-keyword__" }),
        }),
      );

      // 検索 → 別ページへ遷移 → 戻る、という操作で popstate 経由の状態復元を発生させる
      await page.locator(searchSelector).fill("__description-only-keyword__");
      await expect(page.locator(countSelector)).toHaveText("1 件");

      await page.goto("/");
      await page.goBack();

      await expect(page.locator(searchSelector)).toHaveValue("__description-only-keyword__");
      await expect(page.locator(countSelector)).toHaveText("1 件");
      await expect(grid.locator(`:scope > li[data-video-id="${videoId}"]`)).toBeVisible();

      await page.unroute("**/video-descriptions.json");
    }
  });

  test("動画リンクをクリックすると視聴済みバッジが表示される(#423)", async ({ page, context }) => {
    await page.goto("/videos/");

    const card = page.locator("#videos-grid > li").first();
    const link = card.locator("a[data-watch-track-id]");
    const videoId = await link.getAttribute("data-watch-track-id");
    const badge = card.locator(`[data-watched-badge="${videoId}"]`);
    await expect(badge).toBeHidden();

    // サムネイル部分は PreviewButton(プレビュー再生ボタン)が全面に重なっておりクリックを奪うため、
    // その下にあるタイトル(h3)をクリックしてリンクへのクリックとして扱う(#464のe2e失敗の修正)。
    // 動画リンクは target="_blank" で新しいタブを開く。視聴済み記録はクリックイベントの
    // ハンドラ(WatchedController)が同期的に行うため、外部ドメイン(YouTube)への実際の
    // 遷移完了は待たない。開いた場合のタブは後始末として閉じるが、実行環境のネットワーク
    // 制限等で開かなくてもテスト自体はブロックしない。
    context.on("page", (popup) => {
      popup.close().catch(() => {});
    });
    await link.locator("h3").click();

    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("視聴済み");

    // 再読み込み後も localStorage の記録から視聴済み状態を復元できる
    await page.reload();
    const badgeAfterReload = page
      .locator("#videos-grid > li")
      .first()
      .locator(`[data-watched-badge="${videoId}"]`);
    await expect(badgeAfterReload).toBeVisible();
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

  test("「あとで見る」51件保存時、一括再生リンクは直近保存した50件になる(#449)", async ({
    page,
  }) => {
    // storedIds は保存順(古い→新しい)。id[0] が最も古く、末尾が最も新しい。
    const storedIds = videosData.videos.slice(0, 51).map((video) => video.id);
    await page.addInitScript(([key, ids]) => localStorage.setItem(key, JSON.stringify(ids)), [
      WATCH_LATER_STORAGE_KEY,
      storedIds,
    ] as const);

    await page.goto("/watch-later/");

    const playlistLink = page.locator("#watch-later-playlist");
    await expect(playlistLink).toBeVisible();
    const href = await playlistLink.getAttribute("href");
    expect(href).toContain(storedIds.at(-1));
    expect(href).not.toContain(storedIds[0]);
  });

  test("「あとで見る」の一気見キューはDOM構築順(公開日時順)ではなく保存順で再生される", async ({
    page,
  }) => {
    // videos[0] は videos[1] より公開日時が新しい(=構築時のDOM順で先に来る)。
    // 保存順をその逆(videos[1] を先に保存)にすることで、「DOM順とたまたま一致しているだけ」
    // ではなく、保存順が一気見キューの並びに実際に反映されていることを検証する。
    const [newerVideo, olderVideo] = videosData.videos;
    const savedIds = [olderVideo.id, newerVideo.id];
    await page.addInitScript(([key, ids]) => localStorage.setItem(key, JSON.stringify(ids)), [
      WATCH_LATER_STORAGE_KEY,
      savedIds,
    ] as const);

    await page.goto("/watch-later/");

    const grid = page.locator("#watch-later-grid");
    const visibleCards = grid.locator(":scope > li:not([hidden])");
    await expect(visibleCards).toHaveCount(2);
    // グリッドのDOM順も一括再生リンク(#364)と同じ保存順に揃う
    await expect(visibleCards.nth(0)).toHaveAttribute("data-video-id", olderVideo.id);
    await expect(visibleCards.nth(1)).toHaveAttribute("data-video-id", newerVideo.id);

    await visibleCards.nth(0).locator("button[data-lightbox-video-id]").click();
    await expect(page.locator("#video-lightbox")).toBeVisible();
    await expect(page.locator("#video-lightbox-queue-status")).toHaveText("一気見 1 / 2");
    await page.locator("[data-lightbox-close]").click();

    await visibleCards.nth(1).locator("button[data-lightbox-video-id]").click();
    await expect(page.locator("#video-lightbox-queue-status")).toHaveText("一気見 2 / 2");
  });

  test("一気見キューの自動遷移でも「続きから」「視聴済み」に記録される(#503)", async ({ page }) => {
    const [firstVideo, secondVideo] = videosData.videos;
    const savedIds = [firstVideo.id, secondVideo.id];
    await page.addInitScript(([key, ids]) => localStorage.setItem(key, JSON.stringify(ids)), [
      WATCH_LATER_STORAGE_KEY,
      savedIds,
    ] as const);

    // 実際のYouTube IFrame APIの代わりに、テストから onStateChange を直接呼び出せる
    // 最小限のモックを注入する(ENDED状態は本物のYouTube再生なしでは発生させられないため)。
    await page.route("https://www.youtube.com/iframe_api", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
          window.YT = {
            PlayerState: { ENDED: 0 },
            Player: function (element, options) {
              window.__mockYTPlayers = window.__mockYTPlayers || [];
              window.__mockYTPlayers.push(options);
              this.destroy = function () {};
            },
          };
          if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
        `,
      }),
    );

    await page.goto("/watch-later/");
    const grid = page.locator("#watch-later-grid");
    await grid
      .locator(":scope > li:not([hidden])")
      .first()
      .locator("button[data-lightbox-video-id]")
      .click();
    await expect(page.locator("#video-lightbox-queue-status")).toHaveText("一気見 1 / 2");

    await expect.poll(() => page.evaluate(() => window.__mockYTPlayers?.length ?? 0)).toBe(1);

    // 1本目の再生終了(ENDED)を発火させ、2本目への自動遷移を引き起こす
    await page.evaluate(() => {
      const options = window.__mockYTPlayers.at(-1);
      options.events.onStateChange({ data: window.YT.PlayerState.ENDED });
    });
    await expect(page.locator("#video-lightbox-queue-status")).toHaveText("一気見 2 / 2");

    const [continueWatchingIds, watchedIds] = await page.evaluate(() => [
      JSON.parse(localStorage.getItem("mayabase-continue-watching") ?? "[]"),
      JSON.parse(localStorage.getItem("mayabase-watched") ?? "[]"),
    ]);
    expect(continueWatchingIds).toContain(secondVideo.id);
    expect(watchedIds).toContain(secondVideo.id);
  });

  test("「あとで見る」の追加/解除が別タブへ自動で反映される(#478)", async ({ context }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await pageA.goto("/videos/");
    await pageB.goto("/videos/");

    const buttonOnA = pageA.locator("[data-watch-later-id]").first();
    const videoId = await buttonOnA.getAttribute("data-watch-later-id");
    const buttonOnB = pageB.locator(`[data-watch-later-id="${videoId}"]`);

    await expect(buttonOnA).toHaveAttribute("aria-pressed", "false");
    await expect(buttonOnB).toHaveAttribute("aria-pressed", "false");

    await buttonOnA.click();
    await expect(buttonOnA).toHaveAttribute("aria-pressed", "true");
    // タブB は storage イベント経由で自動的に反映される(操作していない)
    await expect(buttonOnB).toHaveAttribute("aria-pressed", "true");

    await buttonOnA.click();
    await expect(buttonOnB).toHaveAttribute("aria-pressed", "false");

    // localStorage.clear()(event.key === null)による全解除もタブBへ反映される
    await buttonOnA.click();
    await expect(buttonOnB).toHaveAttribute("aria-pressed", "true");
    await pageA.evaluate(() => localStorage.clear());
    await expect(buttonOnB).toHaveAttribute("aria-pressed", "false");

    await pageA.close();
    await pageB.close();
  });

  test("テーマ切替が別タブへ自動で反映される(#504)", async ({ context }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await pageA.goto("/");
    await pageB.goto("/");

    const toggleA = pageA.locator("#theme-toggle");
    const htmlB = pageB.locator("html");

    // system → light。タブB は storage イベント経由で自動的に反映される(操作していない)
    await toggleA.click();
    await expect(htmlB).toHaveClass(/theme-light/);

    // light → dark
    await toggleA.click();
    await expect(htmlB).toHaveClass(/theme-dark/);

    await pageA.close();
    await pageB.close();
  });

  test("視聴済みバッジが別タブへ自動で反映される(#478)", async ({ context }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await pageA.goto("/videos/");
    await pageB.goto("/videos/");

    const linkOnA = pageA.locator("a[data-watch-track-id]").first();
    const videoId = await linkOnA.getAttribute("data-watch-track-id");
    const badgeOnB = pageB.locator(`[data-watched-badge="${videoId}"]`);
    await expect(badgeOnB).toBeHidden();

    context.on("page", (popup) => {
      popup.close().catch(() => {});
    });
    await linkOnA.locator("h3").click();

    // タブB は storage イベント経由で自動的に反映される(操作していない)
    await expect(badgeOnB).toBeVisible();

    // localStorage.clear()(event.key === null)による全解除もタブBへ反映される
    await pageA.evaluate(() => localStorage.clear());
    await expect(badgeOnB).toBeHidden();

    await pageA.close();
    await pageB.close();
  });

  test("navigator.share対応環境ではシェアボタンからネイティブ共有シートを呼び出す(#479)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__shareCalls = [];
      Object.defineProperty(window.navigator, "share", {
        configurable: true,
        value: (data: ShareData) => {
          window.__shareCalls.push(data);
          return Promise.resolve();
        },
      });
    });
    await page.goto("/videos/");

    const shareButton = page.locator("a[data-share-url]").first();
    const expectedUrl = await shareButton.getAttribute("data-share-url");
    const expectedTitle = await shareButton.getAttribute("data-share-title");
    await shareButton.click();

    await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);
    const call = await page.evaluate(() => window.__shareCalls[0]);
    expect(call.url).toBe(expectedUrl);
    expect(call.title).toBe(expectedTitle);
  });

  test("navigator.shareがキャンセルされても(AbortError)エラー扱いにならない(#479)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "share", {
        configurable: true,
        value: () => {
          const rejection = Promise.reject(new DOMException("cancelled", "AbortError"));
          rejection
            .catch(() => {})
            .finally(() => {
              window.__shareSettled = true;
            });
          return rejection;
        },
      });
    });
    await page.goto("/videos/");

    await page.locator("a[data-share-url]").first().click();
    await page.waitForFunction(() => window.__shareSettled === true);

    expect(pageErrors).toHaveLength(0);
  });

  test("Ctrl/Cmdクリック等の修飾キー付きクリックではnavigator.shareを呼び出さず標準のリンク挙動を維持する(#479)", async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      window.__shareCalls = [];
      Object.defineProperty(window.navigator, "share", {
        configurable: true,
        value: (data: ShareData) => {
          window.__shareCalls.push(data);
          return Promise.resolve();
        },
      });
    });
    await page.goto("/videos/");

    const shareButton = page.locator("a[data-share-url]").first();
    const [newPage] = await Promise.all([
      context.waitForEvent("page"),
      shareButton.click({ modifiers: ["ControlOrMeta"] }),
    ]);
    await newPage.waitForLoadState();

    // 修飾キー付きクリックは target="_blank" の標準挙動(新しいタブで開く)のままであり、
    // preventDefault によるネイティブ共有シートへの横取りは発生しない(#479 レビュー指摘)。
    expect(await page.evaluate(() => window.__shareCalls.length)).toBe(0);
    await newPage.close();
  });

  test("navigator.share非対応環境ではXの共有リンクへのフォールバックを維持する(#479)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Web Share API 非対応環境(デスクトップ等)を模す(#479)。
      const proto = Object.getPrototypeOf(navigator) as { share?: unknown };
      if (proto && "share" in proto) delete proto.share;
    });
    await page.goto("/videos/");

    const shareLink = page.locator("a[data-share-url]").first();
    await expect(shareLink).toHaveAttribute("href", /^https:\/\/x\.com\/intent\/tweet\?/);
    await expect(shareLink).toHaveAttribute("target", "_blank");
  });

  test("navigator.shareがAbortError以外で失敗した場合はXの共有リンクへフォールバック遷移する(#493)", async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "share", {
        configurable: true,
        value: () => Promise.reject(new DOMException("failed", "NotAllowedError")),
      });
    });
    // 実際のX(x.com)への外部アクセスに依存しないよう、共有インテントURLへの遷移をブラウザ側で横取りする。
    await context.route("https://x.com/intent/tweet**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }),
    );
    await page.goto("/videos/");

    const shareButton = page.locator("a[data-share-url]").first();
    const expectedHref = await shareButton.getAttribute("href");
    const [newPage] = await Promise.all([context.waitForEvent("page"), shareButton.click()]);
    await newPage.waitForLoadState();

    // navigator.share が preventDefault 後に AbortError 以外で失敗しても、
    // 無言のデッドエンドにならず本来のX共有インテントへ遷移する(#493)。
    expect(newPage.url()).toBe(expectedHref);
    await newPage.close();
  });
});

declare global {
  interface Window {
    __ytEvents: { onStateChange: (event: { data: number }) => void };
    YT: { PlayerState: { ENDED: number; PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
    __shareCalls: ShareData[];
    __shareSettled?: boolean;
  }
}
