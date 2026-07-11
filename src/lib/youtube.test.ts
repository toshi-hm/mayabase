import { describe, expect, test } from "bun:test";
import {
  createEmptyVideosData,
  embedUrl,
  extractChannelId,
  type FetchLike,
  mapWithConcurrency,
  mergeVideos,
  parseFeed,
  parseVideosData,
  probeIsShort,
  thumbnailFallbackUrl,
  thumbnailUrl,
  type Video,
  videoUrl,
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

describe("mergeVideos", () => {
  const existing: Video[] = [
    {
      id: "old0000000A",
      title: "RSS から消えた過去動画",
      description: "",
      publishedAt: "2025-01-01T00:00:00+00:00",
      isShort: false,
    },
    {
      id: "abc123DEF45",
      title: "古いタイトル",
      description: "古い説明",
      publishedAt: "2026-07-01T12:00:00+00:00",
      isShort: true,
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

  test("新規動画は isShort: null(未判定)で追加される", () => {
    const merged = mergeVideos(existing, parseFeed(FEED_XML));
    expect(merged.find((v) => v.id === "xyz789GHI01")?.isShort).toBeNull();
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

  test("createEmptyVideosData は毎回新しいオブジェクトを返す", () => {
    const a = createEmptyVideosData();
    const b = createEmptyVideosData();
    expect(a).not.toBe(b);
    expect(a.videos).not.toBe(b.videos);
  });
});
