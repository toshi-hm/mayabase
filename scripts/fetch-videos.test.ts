import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { site } from "../src/config/site";
import type { FetchLike } from "../src/lib/youtube";
import {
  fetchAllViaApi,
  fetchVideoDetails,
  main,
  resolveChannelId,
  updateChannelStats,
} from "./fetch-videos";

// main() / updateChannelStats() は VIDEOS_JSON_PATH / CHANNEL_STATS_JSON_PATH という
// (import.meta.url から算出した)実ファイルのパスへ直接書き込む実装になっており、
// テストから安全に差し替えられるパラメータが無い。そのため実ファイルの内容を
// beforeEach で退避し、afterEach で必ず書き戻すことでコミット済みデータへの
// 汚染を防ぐ(このファイル内の scripts/fetch-videos.ts と同じ相対パスで解決する)。
const VIDEOS_JSON_PATH = fileURLToPath(new URL("../src/data/videos.json", import.meta.url));
const CHANNEL_STATS_JSON_PATH = fileURLToPath(
  new URL("../src/data/channel-stats.json", import.meta.url),
);

let originalVideosJson: string;
let originalChannelStatsJson: string;

beforeEach(async () => {
  originalVideosJson = await Bun.file(VIDEOS_JSON_PATH).text();
  originalChannelStatsJson = await Bun.file(CHANNEL_STATS_JSON_PATH).text();
});

afterEach(async () => {
  await Bun.write(VIDEOS_JSON_PATH, originalVideosJson);
  await Bun.write(CHANNEL_STATS_JSON_PATH, originalChannelStatsJson);
});

/** 呼ばれたら失敗させる fetchFn(このパスでは fetch が発生しないはず、を検証するため) */
const unreachableFetch: FetchLike = async (url) => {
  throw new Error(`fetch は呼ばれないはずです: ${url}`);
};

describe("resolveChannelId", () => {
  // site.ts の channelId は「意図的に string へ widening」されているプロパティだが、
  // 外側の `as const` により TS 上は readonly 扱いになるため、テストでの一時的な
  // 差し替えにはキャストが必要(実行時は普通の書き換え可能なオブジェクト)。
  const mutableYoutubeConfig = site.youtube as { channelId: string };
  const originalChannelId = mutableYoutubeConfig.channelId;

  afterEach(() => {
    mutableYoutubeConfig.channelId = originalChannelId;
  });

  test("site.ts に channelId が設定されていればそれを返し、fetch は行わない", async () => {
    expect(originalChannelId).not.toBe("");
    const result = await resolveChannelId(
      { channelId: "", fetchedAt: null, videos: [] },
      unreachableFetch,
    );
    expect(result).toBe(originalChannelId);
  });

  test("site.ts が未設定なら既存 videos.json の channelId にフォールバックする", async () => {
    mutableYoutubeConfig.channelId = "";
    const result = await resolveChannelId(
      { channelId: "UCexisting000000000000AA", fetchedAt: null, videos: [] },
      unreachableFetch,
    );
    expect(result).toBe("UCexisting000000000000AA");
  });

  test("両方未設定ならチャンネルページの HTML から externalId を抽出する", async () => {
    mutableYoutubeConfig.channelId = "";
    const fetchFn: FetchLike = async (url) => {
      expect(url).toBe(`https://www.youtube.com/${site.youtube.handle}`);
      return new Response(
        `<script>var data = {"externalId":"UCabcdefghij0123456789AB","other":1};</script>`,
        { status: 200 },
      );
    };
    const result = await resolveChannelId({ channelId: "", fetchedAt: null, videos: [] }, fetchFn);
    expect(result).toBe("UCabcdefghij0123456789AB");
  });

  test("チャンネルページの取得に失敗したら null を返す", async () => {
    mutableYoutubeConfig.channelId = "";
    const fetchFn: FetchLike = async () => new Response(null, { status: 500 });
    const result = await resolveChannelId({ channelId: "", fetchedAt: null, videos: [] }, fetchFn);
    expect(result).toBeNull();
  });

  test("チャンネルページに externalId が含まれなければ null を返す", async () => {
    mutableYoutubeConfig.channelId = "";
    const fetchFn: FetchLike = async () => new Response("<html></html>", { status: 200 });
    const result = await resolveChannelId({ channelId: "", fetchedAt: null, videos: [] }, fetchFn);
    expect(result).toBeNull();
  });
});

describe("fetchAllViaApi", () => {
  // uploadsPlaylistId が UU... を導出できる、実在チャンネル ID と同じ形式の値
  const channelId = "UC3ELUpDyBSGZfZJib67t4Sg";

  function playlistPage(opts: { videoId: string; nextPageToken?: string }): Response {
    return new Response(
      JSON.stringify({
        nextPageToken: opts.nextPageToken,
        items: [
          {
            contentDetails: { videoId: opts.videoId, videoPublishedAt: "2026-01-01T00:00:00Z" },
            snippet: { title: `動画 ${opts.videoId}`, description: "" },
          },
        ],
      }),
      { status: 200 },
    );
  }

  test("nextPageToken が尽きるまでページを辿り、全ページ分を集約する", async () => {
    let calls = 0;
    const fetchFn: FetchLike = async (url) => {
      calls += 1;
      const pageToken = new URL(url).searchParams.get("pageToken");
      if (!pageToken) return playlistPage({ videoId: "vid00000001", nextPageToken: "PAGE2" });
      if (pageToken === "PAGE2") return playlistPage({ videoId: "vid00000002" });
      throw new Error(`想定外の pageToken: ${pageToken}`);
    };
    const entries = await fetchAllViaApi(channelId, "dummy-key", fetchFn);
    expect(calls).toBe(2);
    expect(entries?.map((e) => e.id)).toEqual(["vid00000001", "vid00000002"]);
  });

  test("API キーは URL クエリではなく X-goog-api-key ヘッダで渡す", async () => {
    const fetchFn: FetchLike = async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers["X-goog-api-key"]).toBe("dummy-key");
      return playlistPage({ videoId: "vid00000001" });
    };
    await fetchAllViaApi(channelId, "dummy-key", fetchFn);
  });

  test("0 件しか取得できなかった場合は null を返す(RSS フォールバック用シグナル)", async () => {
    const fetchFn: FetchLike = async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 });
    const entries = await fetchAllViaApi(channelId, "dummy-key", fetchFn);
    expect(entries).toBeNull();
  });

  test("HTTP エラー応答のときは null を返す", async () => {
    const fetchFn: FetchLike = async () => new Response(null, { status: 403 });
    const entries = await fetchAllViaApi(channelId, "dummy-key", fetchFn);
    expect(entries).toBeNull();
  });

  test("channelId から uploads プレイリストを導出できない場合は fetch せず null を返す", async () => {
    const entries = await fetchAllViaApi("not-a-channel-id", "dummy-key", unreachableFetch);
    expect(entries).toBeNull();
  });

  test("ページ数上限に達したら打ち切り、警告を出しつつそれまでの取得分を返す", async () => {
    // API_MAX_PAGES はモジュール内部の定数でエクスポートされていないため、
    // 「常に nextPageToken を返し続けるモック」で有限回で打ち切られること自体を検証する
    // (無限ループに陥らないことの確認を兼ねる)。この方法だと定数の正確な値
    // (現状 40)を独立に検証できない点はカバレッジの限界として PR に明記する。
    let calls = 0;
    const fetchFn: FetchLike = async () => {
      calls += 1;
      return playlistPage({
        videoId: `vid${String(calls).padStart(8, "0")}`,
        nextPageToken: "NEXT",
      });
    };
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };
    try {
      const entries = await fetchAllViaApi(channelId, "dummy-key", fetchFn);
      expect(entries).not.toBeNull();
      expect(entries?.length).toBe(calls);
      expect(calls).toBeGreaterThan(1);
      expect(warnings.some((w) => w.includes("ページ数上限"))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("updateChannelStats", () => {
  test("HTTP エラー応答のときはファイルを更新せず終了する(例外を投げない)", async () => {
    const fetchFn: FetchLike = async () => new Response(null, { status: 500 });
    await updateChannelStats("UC3ELUpDyBSGZfZJib67t4Sg", "dummy-key", fetchFn);
    const after = await Bun.file(CHANNEL_STATS_JSON_PATH).text();
    expect(after).toBe(originalChannelStatsJson);
  });

  test("成功時は channel-stats.json を更新する", async () => {
    const fetchFn: FetchLike = async () =>
      new Response(JSON.stringify({ items: [{ statistics: { subscriberCount: "999" } }] }), {
        status: 200,
      });
    await updateChannelStats("UC3ELUpDyBSGZfZJib67t4Sg", "dummy-key", fetchFn);
    const after = JSON.parse(await Bun.file(CHANNEL_STATS_JSON_PATH).text());
    expect(after.subscriberCount).toBe(999);
  });
});

describe("fetchVideoDetails", () => {
  test("50 件を超える ID は複数バッチ(50 件区切り)に分割してリクエストする", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `vid${String(i).padStart(8, "0")}`);
    const requestedBatches: string[][] = [];
    const fetchFn: FetchLike = async (url) => {
      const batchIds = (new URL(url).searchParams.get("id") ?? "").split(",");
      requestedBatches.push(batchIds);
      const items = batchIds.map((id) => ({
        id,
        statistics: { viewCount: "1" },
        contentDetails: { duration: "PT1M0S" },
      }));
      return new Response(JSON.stringify({ items }), { status: 200 });
    };
    const result = await fetchVideoDetails(ids, "dummy-key", fetchFn);
    expect(requestedBatches).toHaveLength(2);
    expect(requestedBatches.map((b) => b.length).sort()).toEqual([10, 50]);
    expect(result.viewCounts.size).toBe(60);
    expect(result.durations.size).toBe(60);
  });

  test("part クエリに statistics と contentDetails の両方を指定する(#173)", async () => {
    const fetchFn: FetchLike = async (url) => {
      expect(new URL(url).searchParams.get("part")).toBe("statistics,contentDetails");
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    };
    await fetchVideoDetails(["vid00000001"], "dummy-key", fetchFn);
  });

  test("再生回数と再生時間を同じレスポンスから取り出す", async () => {
    const fetchFn: FetchLike = async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "vid00000001",
              statistics: { viewCount: "12345" },
              contentDetails: { duration: "PT4M13S" },
            },
          ],
        }),
        { status: 200 },
      );
    const result = await fetchVideoDetails(["vid00000001"], "dummy-key", fetchFn);
    expect(result.viewCounts.get("vid00000001")).toBe(12345);
    expect(result.durations.get("vid00000001")).toBe("PT4M13S");
  });

  test("個別バッチが失敗しても他のバッチの結果は失われない", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `vid${String(i).padStart(8, "0")}`);
    const fetchFn: FetchLike = async (url) => {
      const batchIds = (new URL(url).searchParams.get("id") ?? "").split(",");
      if (batchIds[0] === ids[0]) {
        // 最初のバッチのみ失敗させる
        return new Response(null, { status: 500 });
      }
      const items = batchIds.map((id) => ({
        id,
        statistics: { viewCount: "42" },
        contentDetails: { duration: "PT2M0S" },
      }));
      return new Response(JSON.stringify({ items }), { status: 200 });
    };
    const result = await fetchVideoDetails(ids, "dummy-key", fetchFn);
    expect(result.viewCounts.has(ids[0] as string)).toBe(false);
    expect(result.viewCounts.get(ids[59] as string)).toBe(42);
    expect(result.viewCounts.size).toBe(10);
    expect(result.durations.has(ids[0] as string)).toBe(false);
    expect(result.durations.get(ids[59] as string)).toBe("PT2M0S");
    expect(result.durations.size).toBe(10);
  });

  test("ネットワークエラー(例外)も個別バッチの失敗として扱う", async () => {
    const ids = ["vid00000001", "vid00000002"];
    const fetchFn: FetchLike = async () => {
      throw new Error("network error");
    };
    const result = await fetchVideoDetails(ids, "dummy-key", fetchFn);
    expect(result.viewCounts.size).toBe(0);
    expect(result.durations.size).toBe(0);
  });

  test("0 件なら fetch を呼ばず空の Map を返す", async () => {
    const result = await fetchVideoDetails([], "dummy-key", unreachableFetch);
    expect(result.viewCounts.size).toBe(0);
    expect(result.durations.size).toBe(0);
  });
});

describe("main", () => {
  // このリポジトリでは site.ts に channelId が確定値として設定されているため、
  // resolveChannelId はここでは fetch を伴わずに解決される(existing.videos.json の
  // channelId とも一致する実在値)。
  const existingChannelId = site.youtube.channelId;

  let originalApiKey: string | undefined;
  beforeEach(() => {
    originalApiKey = process.env.YOUTUBE_API_KEY;
  });
  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalApiKey;
  });

  test("YOUTUBE_API_KEY 未設定かつ RSS も失敗した場合は既存データを維持する(書き込みなし)", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const fetchFn: FetchLike = async () => new Response(null, { status: 500 });
    await main(fetchFn);
    const after = await Bun.file(VIDEOS_JSON_PATH).text();
    expect(after).toBe(originalVideosJson);
  });

  test("API キー設定時に fetchAllViaApi が失敗(null)すると RSS へフォールバックする", async () => {
    process.env.YOUTUBE_API_KEY = "dummy-key";

    // 既存 videos.json に実在する動画 ID を使い、isShort 確定済みとして扱うことで
    // probeShorts() 内の実ネットワークアクセス(fetchWithTimeout 直呼び、未リファクタ)を
    // 発生させずに main() の分岐ロジックだけを検証する。
    const existingIdMatch = originalVideosJson.match(/"id":\s*"([^"]+)"/);
    const knownVideoId = existingIdMatch?.[1];
    expect(knownVideoId).toBeTruthy();

    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <yt:videoId>${knownVideoId}</yt:videoId>
    <title>RSS フォールバックで更新されたタイトル</title>
    <published>2026-07-15T00:00:00+00:00</published>
    <media:group><media:description>RSS 経由の説明</media:description></media:group>
  </entry>
</feed>`;

    const fetchFn: FetchLike = async (url) => {
      const u = new URL(url);
      if (u.pathname === "/youtube/v3/playlistItems") {
        // Data API 失敗 → RSS フォールバックさせる
        return new Response(null, { status: 500 });
      }
      if (u.pathname === "/youtube/v3/channels") {
        // updateChannelStats も失敗させる(既存 channel-stats.json を維持させる)
        return new Response(null, { status: 500 });
      }
      if (u.pathname === "/feeds/videos.xml") {
        expect(u.searchParams.get("channel_id")).toBe(existingChannelId);
        return new Response(feedXml, { status: 200 });
      }
      if (u.pathname === "/youtube/v3/videos") {
        // 再生回数の取得も失敗させる(既存値を維持させる)
        return new Response(null, { status: 500 });
      }
      throw new Error(`想定外の fetch: ${url}`);
    };

    await main(fetchFn);

    // channel-stats.json は更新されない(失敗させたため)
    const channelStatsAfter = await Bun.file(CHANNEL_STATS_JSON_PATH).text();
    expect(channelStatsAfter).toBe(originalChannelStatsJson);

    // videos.json は RSS 経由の内容で「原子的に」書き換わっている(tmp → rename が
    // 正しく完了していなければ有効な JSON として読み戻せない)
    const videosAfter = JSON.parse(await Bun.file(VIDEOS_JSON_PATH).text());
    const updated = videosAfter.videos.find((v: { id: string }) => v.id === knownVideoId);
    expect(updated?.title).toBe("RSS フォールバックで更新されたタイトル");
  });

  test("API 経由の取得が成功すると再生時間・再生回数も videos.json に保存される(#173)", async () => {
    process.env.YOUTUBE_API_KEY = "dummy-key";

    // isShort 確定済みの実在動画 ID を使い、probeShorts() 内の実ネットワークアクセスを避ける
    // (上のテストと同じ方針)。
    const existingIdMatch = originalVideosJson.match(/"id":\s*"([^"]+)"/);
    const knownVideoId = existingIdMatch?.[1];
    expect(knownVideoId).toBeTruthy();

    const fetchFn: FetchLike = async (url) => {
      const u = new URL(url);
      if (u.pathname === "/youtube/v3/playlistItems") {
        return new Response(
          JSON.stringify({
            items: [
              {
                contentDetails: {
                  videoId: knownVideoId,
                  videoPublishedAt: "2026-01-01T00:00:00Z",
                },
                snippet: { title: "API 経由のタイトル", description: "API 経由の説明" },
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (u.pathname === "/youtube/v3/channels") {
        // channel-stats 更新は本テストの対象外のため失敗させる
        return new Response(null, { status: 500 });
      }
      if (u.pathname === "/youtube/v3/videos") {
        expect(u.searchParams.get("part")).toBe("statistics,contentDetails");
        return new Response(
          JSON.stringify({
            items: [
              {
                id: knownVideoId,
                statistics: { viewCount: "999" },
                contentDetails: { duration: "PT4M13S" },
              },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`想定外の fetch: ${url}`);
    };

    await main(fetchFn);

    const videosAfter = JSON.parse(await Bun.file(VIDEOS_JSON_PATH).text());
    const updated = videosAfter.videos.find((v: { id: string }) => v.id === knownVideoId);
    expect(updated?.viewCount).toBe(999);
    expect(updated?.duration).toBe("PT4M13S");
  });
});
