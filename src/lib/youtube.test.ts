import { describe, expect, test } from "bun:test";
import {
  createEmptyVideosData,
  embedUrl,
  extractChannelId,
  type FetchLike,
  formatDurationLabel,
  mapWithConcurrency,
  mergeVideos,
  parseFeed,
  parseIso8601Duration,
  parsePlaylistItemsPage,
  parseVideoDurationsResponse,
  parseVideoStatisticsResponse,
  parseVideosData,
  probeIsShort,
  thumbnailFallbackUrl,
  thumbnailUrl,
  uploadsPlaylistId,
  type Video,
  videoUrl,
  videoUrlAtTime,
} from "./youtube";

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns="http://www.w3.org/2005/Atom">
  <title>MayaBase</title>
  <entry>
    <id>yt:video:abc123DEF45</id>
    <yt:videoId>abc123DEF45</yt:videoId>
    <title>新作動画のタイトル</title>
    <published>2026-07-01T12:00:00+00:00</published>
    <media:group>
      <media:title>新作動画のタイトル</media:title>
      <media:description>動画の説明文です。</media:description>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:xyz789GHI01</id>
    <yt:videoId>xyz789GHI01</yt:videoId>
    <title>2本目の動画</title>
    <published>2026-06-15T09:30:00+00:00</published>
    <media:group>
      <media:description></media:description>
    </media:group>
  </entry>
</feed>`;

describe("parseFeed", () => {
  test("エントリを抽出できる", () => {
    const entries = parseFeed(FEED_XML);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: "abc123DEF45",
      title: "新作動画のタイトル",
      description: "動画の説明文です。",
      publishedAt: "2026-07-01T12:00:00+00:00",
    });
  });

  test("説明が空でも動作する", () => {
    const entries = parseFeed(FEED_XML);
    expect(entries[1]?.description).toBe("");
  });

  test("エントリが 1 件だけでも配列になる", () => {
    const single = FEED_XML.replace(/<entry>[\s\S]*?<\/entry>\s*(?=<entry>)/, "");
    const entries = parseFeed(single);
    expect(entries).toHaveLength(1);
  });

  test("空のフィードは空配列", () => {
    expect(parseFeed("<feed></feed>")).toEqual([]);
  });

  test("不正な XML でも例外を投げない", () => {
    expect(parseFeed("これはXMLではない")).toEqual([]);
  });

  test("数字のみのタイトル・説明も文字列として扱う(パーサの number 変換対策)", () => {
    const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
      <entry>
        <yt:videoId>num00000001</yt:videoId>
        <title>2024</title>
        <published>2026-07-01T12:00:00+00:00</published>
        <media:group><media:description>42</media:description></media:group>
      </entry>
    </feed>`;
    const entries = parseFeed(xml);
    expect(entries[0]?.title).toBe("2024");
    expect(entries[0]?.description).toBe("42");
  });

  test("全桁数字の動画IDも文字列として扱う(パーサの number 変換対策)", () => {
    const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
      <entry>
        <yt:videoId>12345678901</yt:videoId>
        <title>数字IDの動画</title>
        <published>2026-07-01T12:00:00+00:00</published>
        <media:group><media:description>説明</media:description></media:group>
      </entry>
    </feed>`;
    const entries = parseFeed(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: "12345678901",
      title: "数字IDの動画",
      description: "説明",
      publishedAt: "2026-07-01T12:00:00+00:00",
    });
  });

  test("media:group 自体が無いエントリでも動作する", () => {
    const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
      <entry>
        <yt:videoId>nogroup0001</yt:videoId>
        <title>グループなし</title>
        <published>2026-07-01T12:00:00+00:00</published>
      </entry>
    </feed>`;
    const entries = parseFeed(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe("");
  });
});

describe("uploadsPlaylistId", () => {
  test("UC 始まりのチャンネル ID から UU プレイリスト ID を導出する", () => {
    expect(uploadsPlaylistId("UC3ELUpDyBSGZfZJib67t4Sg")).toBe("UU3ELUpDyBSGZfZJib67t4Sg");
  });

  test("形式が不正なら null(短すぎる / UC 以外)", () => {
    expect(uploadsPlaylistId("")).toBeNull();
    expect(uploadsPlaylistId("UCshort")).toBeNull();
    expect(uploadsPlaylistId("XX3ELUpDyBSGZfZJib67t4Sg")).toBeNull();
  });
});

describe("parsePlaylistItemsPage", () => {
  const page = {
    nextPageToken: "CAUQAA",
    items: [
      {
        contentDetails: { videoId: "vid00000001", videoPublishedAt: "2026-07-01T12:00:00Z" },
        snippet: {
          title: "API 動画1",
          description: "説明1",
          publishedAt: "2026-07-02T00:00:00Z", // プレイリスト追加日時(公開日時とは別)
          resourceId: { videoId: "vid00000001" },
        },
      },
      {
        // contentDetails.videoId 欠落 → snippet.resourceId.videoId でフォールバック
        contentDetails: { videoPublishedAt: "2026-06-15T09:30:00Z" },
        snippet: {
          title: "API 動画2",
          description: "",
          publishedAt: "2026-06-16T00:00:00Z",
          resourceId: { videoId: "vid00000002" },
        },
      },
    ],
  };

  test("items を FeedEntry に正規化する", () => {
    const { entries } = parsePlaylistItemsPage(page);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: "vid00000001",
      title: "API 動画1",
      description: "説明1",
      publishedAt: "2026-07-01T12:00:00Z", // contentDetails.videoPublishedAt 優先
    });
  });

  test("contentDetails.videoId が無ければ resourceId.videoId を使う", () => {
    const { entries } = parsePlaylistItemsPage(page);
    expect(entries[1]?.id).toBe("vid00000002");
  });

  test("nextPageToken を取り出す。無ければ null", () => {
    expect(parsePlaylistItemsPage(page).nextPageToken).toBe("CAUQAA");
    expect(parsePlaylistItemsPage({ items: [] }).nextPageToken).toBeNull();
  });

  test("videoId や公開日時を欠くアイテム(非公開・削除済み)はスキップする", () => {
    const withDeleted = {
      items: [
        { contentDetails: {}, snippet: { title: "削除済み", description: "" } },
        {
          contentDetails: { videoId: "vidOK000001", videoPublishedAt: "2026-05-01T00:00:00Z" },
          snippet: { title: "生きてる動画", description: "" },
        },
      ],
    };
    const { entries } = parsePlaylistItemsPage(withDeleted);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("vidOK000001");
  });

  test("削除済み/非公開動画(resourceId と snippet.publishedAt は残るが videoPublishedAt を欠く)はスキップ", () => {
    // 実際の API は死んだ動画でも resourceId.videoId と snippet.publishedAt(追加日時)を返すため、
    // videoPublishedAt を有効性シグナルにしないと死んだ動画が混入してしまう
    const deadVideos = {
      items: [
        {
          contentDetails: {}, // videoPublishedAt を欠く = 死んだ動画
          snippet: {
            title: "Deleted video",
            description: "",
            publishedAt: "2020-01-01T00:00:00Z", // プレイリスト追加日時(公開日時ではない)
            resourceId: { videoId: "deadVid0001" },
          },
        },
        {
          contentDetails: { videoId: "liveVid0001", videoPublishedAt: "2026-05-01T00:00:00Z" },
          snippet: {
            title: "生きてる動画",
            description: "",
            resourceId: { videoId: "liveVid0001" },
          },
        },
      ],
    };
    expect(parsePlaylistItemsPage(deadVideos).entries.map((e) => e.id)).toEqual(["liveVid0001"]);
  });

  test("id 形式が不正なアイテムはスキップする(インライン属性への注入防止)", () => {
    const bad = {
      items: [
        {
          contentDetails: { videoId: "abc';alert(1)", videoPublishedAt: "2026-01-01T00:00:00Z" },
          snippet: { title: "不正 ID", description: "" },
        },
      ],
    };
    expect(parsePlaylistItemsPage(bad).entries).toEqual([]);
  });

  test("items が無い・不正でも例外を投げず空配列", () => {
    expect(parsePlaylistItemsPage({}).entries).toEqual([]);
    expect(parsePlaylistItemsPage(null).entries).toEqual([]);
  });

  test("mergeVideos と組み合わせて全動画を蓄積できる(RSS と同じ FeedEntry 形)", () => {
    const { entries } = parsePlaylistItemsPage(page);
    const merged = mergeVideos([], entries);
    expect(merged.map((v) => v.id)).toEqual(["vid00000001", "vid00000002"]);
    expect(merged.every((v) => v.isShort === null)).toBe(true);
  });
});

describe("parseVideoStatisticsResponse", () => {
  test("videos.list(part=statistics) のレスポンスから id→再生回数のマップを取り出す(#35)", () => {
    const data = {
      items: [
        { id: "vid00000001", statistics: { viewCount: "12345" } },
        { id: "vid00000002", statistics: { viewCount: "0" } },
      ],
    };
    const result = parseVideoStatisticsResponse(data);
    expect(result.get("vid00000001")).toBe(12345);
    expect(result.get("vid00000002")).toBe(0);
    expect(result.size).toBe(2);
  });

  test("statistics や viewCount が欠けているアイテムはマップに含めない", () => {
    const data = {
      items: [{ id: "vid00000001" }, { id: "vid00000002", statistics: {} }],
    };
    expect(parseVideoStatisticsResponse(data).size).toBe(0);
  });

  test("viewCount が数値文字列でなければ無視する", () => {
    const data = { items: [{ id: "vid00000001", statistics: { viewCount: "not-a-number" } }] };
    expect(parseVideoStatisticsResponse(data).size).toBe(0);
  });

  test("items が無い・不正・null でも例外を投げず空マップ", () => {
    expect(parseVideoStatisticsResponse({}).size).toBe(0);
    expect(parseVideoStatisticsResponse(null).size).toBe(0);
    expect(parseVideoStatisticsResponse({ items: "not-an-array" }).size).toBe(0);
  });
});

describe("parseVideoDurationsResponse", () => {
  test("videos.list(part=contentDetails) のレスポンスから id→再生時間のマップを取り出す(#173)", () => {
    const data = {
      items: [
        { id: "vid00000001", contentDetails: { duration: "PT4M13S" } },
        { id: "vid00000002", contentDetails: { duration: "PT1H2M10S" } },
      ],
    };
    const result = parseVideoDurationsResponse(data);
    expect(result.get("vid00000001")).toBe("PT4M13S");
    expect(result.get("vid00000002")).toBe("PT1H2M10S");
    expect(result.size).toBe(2);
  });

  test("contentDetails や duration が欠けているアイテムはマップに含めない", () => {
    const data = {
      items: [{ id: "vid00000001" }, { id: "vid00000002", contentDetails: {} }],
    };
    expect(parseVideoDurationsResponse(data).size).toBe(0);
  });

  test("duration が ISO 8601 として不正な形式なら無視する", () => {
    const data = { items: [{ id: "vid00000001", contentDetails: { duration: "not-a-duration" } }] };
    expect(parseVideoDurationsResponse(data).size).toBe(0);
  });

  test("items が無い・不正・null でも例外を投げず空マップ", () => {
    expect(parseVideoDurationsResponse({}).size).toBe(0);
    expect(parseVideoDurationsResponse(null).size).toBe(0);
    expect(parseVideoDurationsResponse({ items: "not-an-array" }).size).toBe(0);
  });
});

describe("parseIso8601Duration", () => {
  test("時分秒を含む形式を総秒数に変換する", () => {
    expect(parseIso8601Duration("PT4M13S")).toBe(253);
    expect(parseIso8601Duration("PT1H2M10S")).toBe(3730);
    expect(parseIso8601Duration("PT45S")).toBe(45);
    expect(parseIso8601Duration("PT1H")).toBe(3600);
  });

  test("0 秒(PT0S)は 0 を返す(null ではない)", () => {
    expect(parseIso8601Duration("PT0S")).toBe(0);
  });

  test("小数秒は切り捨てる", () => {
    expect(parseIso8601Duration("PT1M30.5S")).toBe(90);
  });

  test("不正な形式は null", () => {
    expect(parseIso8601Duration("")).toBeNull();
    expect(parseIso8601Duration("PT")).toBeNull();
    expect(parseIso8601Duration("12:34")).toBeNull();
    expect(parseIso8601Duration("P1Y2M")).toBeNull(); // 年/月単位は未対応
  });
});

describe("formatDurationLabel", () => {
  test("1時間未満は m:ss 形式", () => {
    expect(formatDurationLabel("PT4M13S")).toBe("4:13");
    expect(formatDurationLabel("PT0M5S")).toBe("0:05");
  });

  test("1時間以上は h:mm:ss 形式", () => {
    expect(formatDurationLabel("PT1H2M10S")).toBe("1:02:10");
  });

  test("null は null", () => {
    expect(formatDurationLabel(null)).toBeNull();
  });

  test("パースできない値は null", () => {
    expect(formatDurationLabel("invalid")).toBeNull();
  });
});

describe("mergeVideos", () => {
  const existing: Video[] = [
    {
      id: "old0000000A",
      title: "RSS から消えた過去動画",
      description: "",
      publishedAt: "2025-01-01T00:00:00+00:00",
      isShort: false,
      viewCount: 100,
      duration: "PT3M0S",
    },
    {
      id: "abc123DEF45",
      title: "古いタイトル",
      description: "古い説明",
      publishedAt: "2026-07-01T12:00:00+00:00",
      isShort: true,
      viewCount: 200,
      duration: "PT1M30S",
    },
  ];

  test("RSS から溢れた過去動画を保持する", () => {
    const merged = mergeVideos(existing, parseFeed(FEED_XML));
    expect(merged.map((v) => v.id)).toContain("old0000000A");
    expect(merged).toHaveLength(3);
  });

  test("既存動画のメタデータは更新しつつ isShort の確定値は維持する", () => {
    const merged = mergeVideos(existing, parseFeed(FEED_XML));
    const updated = merged.find((v) => v.id === "abc123DEF45");
    expect(updated?.title).toBe("新作動画のタイトル");
    expect(updated?.isShort).toBe(true);
  });

  test("既存動画の viewCount / duration は維持する(#35, #173: どちらも videos.list 経由の別ステップで更新するため)", () => {
    const merged = mergeVideos(existing, parseFeed(FEED_XML));
    const updated = merged.find((v) => v.id === "abc123DEF45");
    expect(updated?.viewCount).toBe(200);
    expect(updated?.duration).toBe("PT1M30S");
  });

  test("新規動画は isShort: null(未判定)・viewCount: null・duration: null で追加される", () => {
    const merged = mergeVideos(existing, parseFeed(FEED_XML));
    const created = merged.find((v) => v.id === "xyz789GHI01");
    expect(created?.isShort).toBeNull();
    expect(created?.viewCount).toBeNull();
    expect(created?.duration).toBeNull();
  });

  test("公開日時の降順に整列される", () => {
    const merged = mergeVideos(existing, parseFeed(FEED_XML));
    const times = merged.map((v) => Date.parse(v.publishedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test("publishedAt が不正な動画は末尾(最古扱い)に寄せられ例外も出ない", () => {
    const broken: Video[] = [
      {
        id: "broken00001",
        title: "日付が壊れた動画",
        description: "",
        publishedAt: "not-a-date",
        isShort: false,
        viewCount: null,
        duration: null,
      },
    ];
    const merged = mergeVideos(broken, parseFeed(FEED_XML));
    expect(merged.at(-1)?.id).toBe("broken00001");
  });
});

describe("URL ヘルパー", () => {
  test("videoUrl は Shorts と横動画で URL を切り替える", () => {
    expect(videoUrl({ id: "abc", isShort: true })).toBe("https://www.youtube.com/shorts/abc");
    expect(videoUrl({ id: "abc", isShort: false })).toBe("https://www.youtube.com/watch?v=abc");
    expect(videoUrl({ id: "abc", isShort: null })).toBe("https://www.youtube.com/watch?v=abc");
  });

  test("サムネイル・埋め込み URL", () => {
    expect(thumbnailUrl("abc")).toBe("https://i.ytimg.com/vi/abc/hq720.jpg");
    expect(thumbnailFallbackUrl("abc")).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
    expect(embedUrl("abc")).toBe("https://www.youtube.com/embed/abc");
  });

  test("videoUrlAtTime は videoUrl に t= パラメータを付与する(#154)", () => {
    expect(videoUrlAtTime({ id: "abc", isShort: false }, 83)).toBe(
      "https://www.youtube.com/watch?v=abc&t=83s",
    );
    expect(videoUrlAtTime({ id: "abc", isShort: null }, 0)).toBe(
      "https://www.youtube.com/watch?v=abc&t=0s",
    );
    // shorts URL はクエリを持たないため "?" 区切りになる
    expect(videoUrlAtTime({ id: "abc", isShort: true }, 5)).toBe(
      "https://www.youtube.com/shorts/abc?t=5s",
    );
  });
});

describe("extractChannelId", () => {
  test("externalId から抽出できる", () => {
    const html = `<script>var data = {"externalId":"UCabcdefghij0123456789AB","other":1};</script>`;
    expect(extractChannelId(html)).toBe("UCabcdefghij0123456789AB");
  });

  test("RSS リンクの channel_id からも抽出できる", () => {
    const html = `<link rel="alternate" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghij0123456789AB">`;
    expect(extractChannelId(html)).toBe("UCabcdefghij0123456789AB");
  });

  test("見つからなければ null", () => {
    expect(extractChannelId("<html></html>")).toBeNull();
  });
});

describe("probeIsShort", () => {
  const mockFetch = (status: number, location?: string): FetchLike => {
    // Response コンストラクタはリダイレクト系ステータスを受け付けないため status を後付けする
    return async () =>
      Object.defineProperty(
        new Response(null, { headers: location ? { location } : {} }),
        "status",
        { value: status },
      );
  };
  const watchUrl = "https://www.youtube.com/watch?v=abc";

  test("200 なら Shorts", async () => {
    expect(await probeIsShort("abc", mockFetch(200))).toBe(true);
  });

  test("watch への 3xx リダイレクトなら横動画(境界値 300 / 303 / 399)", async () => {
    expect(await probeIsShort("abc", mockFetch(300, watchUrl))).toBe(false);
    expect(await probeIsShort("abc", mockFetch(303, watchUrl))).toBe(false);
    expect(await probeIsShort("abc", mockFetch(399, watchUrl))).toBe(false);
  });

  test("watch 以外への 3xx(consent ページ等)は判定不能(null)", async () => {
    expect(
      await probeIsShort("abc", mockFetch(302, "https://consent.youtube.com/m?continue=x")),
    ).toBeNull();
  });

  test("Location の無い 3xx は判定不能(null)", async () => {
    expect(await probeIsShort("abc", mockFetch(303))).toBeNull();
  });

  test("404 は判定不能(null)", async () => {
    expect(await probeIsShort("abc", mockFetch(404))).toBeNull();
  });

  test.each([405, 501])("HEAD が %d なら GET にフォールバックする", async (status) => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (_url, init) => {
      calls.push(init?.method ?? "GET");
      return new Response(null, { status: calls.length === 1 ? status : 200 });
    };
    expect(await probeIsShort("abc", fetchFn)).toBe(true);
    expect(calls).toEqual(["HEAD", "GET"]);
  });

  test("HEAD が 500 のときは GET へフォールバックせず判定不能(null)", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (_url, init) => {
      calls.push(init?.method ?? "GET");
      return new Response(null, { status: 500 });
    };
    expect(await probeIsShort("abc", fetchFn)).toBeNull();
    expect(calls).toEqual(["HEAD"]);
  });

  test("ネットワークエラーは判定不能(null)", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("network error");
    };
    expect(await probeIsShort("abc", fetchFn)).toBeNull();
  });
});

describe("mapWithConcurrency", () => {
  test("全要素を順序を保って処理する", async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  test("同時実行数が上限を超えない", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test("limit が 1 未満なら RangeError", () => {
    expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(RangeError);
    expect(mapWithConcurrency([1], -1, async (n) => n)).rejects.toThrow(RangeError);
  });
});

describe("parseVideosData / createEmptyVideosData", () => {
  const validVideo = {
    id: "abc123DEF45",
    title: "動画",
    description: "",
    publishedAt: "2026-07-01T12:00:00+00:00",
    isShort: null,
  };

  test("正常なデータをパースできる", () => {
    const data = parseVideosData({
      channelId: "UCabcdefghij0123456789AB",
      fetchedAt: "2026-07-01T12:00:00Z",
      videos: [validVideo],
    });
    expect(data.videos).toHaveLength(1);
    expect(data.videos[0]?.isShort).toBeNull();
  });

  test("duration フィールドが無い既存データ(#173 導入前)も null として扱う", () => {
    const data = parseVideosData({
      channelId: "",
      fetchedAt: null,
      videos: [validVideo],
    });
    expect(data.videos[0]?.duration).toBeNull();
  });

  test("duration は ISO 8601 文字列を保持する", () => {
    const data = parseVideosData({
      channelId: "",
      fetchedAt: null,
      videos: [{ ...validVideo, duration: "PT4M13S" }],
    });
    expect(data.videos[0]?.duration).toBe("PT4M13S");
  });

  test("duration が数値などの不正値ならエラー", () => {
    expect(() =>
      parseVideosData({
        channelId: "",
        fetchedAt: null,
        videos: [{ ...validVideo, duration: 123 }],
      }),
    ).toThrow("duration");
  });

  test("fetchedAt は null を許容する", () => {
    expect(parseVideosData({ channelId: "", fetchedAt: null, videos: [] }).fetchedAt).toBeNull();
  });

  test("videos が配列でなければエラー", () => {
    expect(() => parseVideosData({ channelId: "", fetchedAt: null, videos: {} })).toThrow(
      "videos は配列",
    );
  });

  test("isShort が数値などの不正値ならエラー", () => {
    expect(() =>
      parseVideosData({
        channelId: "",
        fetchedAt: null,
        videos: [{ ...validVideo, isShort: 1 }],
      }),
    ).toThrow("isShort");
  });

  test("id 欠落はエラー", () => {
    expect(() =>
      parseVideosData({ channelId: "", fetchedAt: null, videos: [{ ...validVideo, id: "" }] }),
    ).toThrow("id");
  });

  test("id に不正な文字(引用符等)が含まれる場合はエラー(インライン属性への注入防止)", () => {
    expect(() =>
      parseVideosData({
        channelId: "",
        fetchedAt: null,
        videos: [{ ...validVideo, id: "abc'};alert(1" }],
      }),
    ).toThrow("id");
  });

  test("id が重複していればエラー", () => {
    expect(() =>
      parseVideosData({
        channelId: "",
        fetchedAt: null,
        videos: [validVideo, { ...validVideo, title: "別の動画" }],
      }),
    ).toThrow("重複");
  });

  test("createEmptyVideosData は毎回新しいオブジェクトを返す", () => {
    const a = createEmptyVideosData();
    const b = createEmptyVideosData();
    expect(a).not.toBe(b);
    expect(a.videos).not.toBe(b.videos);
  });
});
