import { describe, expect, test } from "bun:test";
import {
  embedUrl,
  extractChannelId,
  type FetchLike,
  mapWithConcurrency,
  mergeVideos,
  parseFeed,
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
  const mockFetch = (status: number) => (async () => new Response(null, { status })) as FetchLike;

  test("200 なら Shorts", async () => {
    expect(await probeIsShort("abc", mockFetch(200))).toBe(true);
  });

  test("303 リダイレクトなら横動画", async () => {
    expect(await probeIsShort("abc", mockFetch(303))).toBe(false);
  });

  test("404 は判定不能(null)", async () => {
    expect(await probeIsShort("abc", mockFetch(404))).toBeNull();
  });

  test("HEAD が 405 なら GET にフォールバックする", async () => {
    const calls: string[] = [];
    const fetchFn = (async (_url: unknown, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      return new Response(null, { status: calls.length === 1 ? 405 : 200 });
    }) as FetchLike;
    expect(await probeIsShort("abc", fetchFn)).toBe(true);
    expect(calls).toEqual(["HEAD", "GET"]);
  });

  test("ネットワークエラーは判定不能(null)", async () => {
    const fetchFn = (async () => {
      throw new Error("network error");
    }) as FetchLike;
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
});
