import { describe, expect, test } from "bun:test";
import videosJson from "../data/videos.json";
import { categorizeVideo, categoryUrl, getAvailableCategories } from "./categories";
import { buildRssFeed } from "./rss";
import type { Video } from "./youtube";
import { parseVideosData } from "./youtube";

const SITE_URL = new URL("https://portal.mayabase.workers.dev");
const FEED_URL = new URL("https://portal.mayabase.workers.dev/rss.xml");
const CHANNEL = { title: "MayaBase | ITで日常をより便利に", description: "サイトの説明文" };

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "abc123DEF45",
    title: "動画タイトル",
    description: "本文の内容です。",
    publishedAt: "2026-07-01T12:00:00+00:00",
    isShort: false,
    viewCount: null,
    ...overrides,
  };
}

describe("buildRssFeed", () => {
  test("チャンネル情報を出力する", () => {
    const xml = buildRssFeed([], SITE_URL, FEED_URL, CHANNEL);
    expect(xml).toContain("<title>MayaBase | ITで日常をより便利に</title>");
    expect(xml).toContain("<link>https://portal.mayabase.workers.dev/</link>");
    expect(xml).toContain("<description>サイトの説明文</description>");
    expect(xml).toContain("<language>ja</language>");
    expect(xml).toContain(
      '<atom:link href="https://portal.mayabase.workers.dev/rss.xml" rel="self" type="application/rss+xml" />',
    );
  });

  test("動画0件でも壊れたXMLにならない", () => {
    const xml = buildRssFeed([], SITE_URL, FEED_URL, CHANNEL);
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).not.toContain("<item>");
  });

  test("各動画をitemとして出力し、リンク先は動画個別ページになる", () => {
    const xml = buildRssFeed([makeVideo()], SITE_URL, FEED_URL, CHANNEL);
    expect(xml).toContain("<title>動画タイトル</title>");
    expect(xml).toContain("<link>https://portal.mayabase.workers.dev/videos/abc123DEF45/</link>");
    expect(xml).toContain(
      '<guid isPermaLink="true">https://portal.mayabase.workers.dev/videos/abc123DEF45/</guid>',
    );
    expect(xml).toContain("<pubDate>Wed, 01 Jul 2026 12:00:00 GMT</pubDate>");
    expect(xml).toContain("<description>本文の内容です。</description>");
  });

  test("公開日時の降順に並び替える(videos.jsonの並びに依存しない)", () => {
    const older = makeVideo({ id: "older00000A", publishedAt: "2026-01-01T00:00:00+00:00" });
    const newer = makeVideo({ id: "newer00000B", publishedAt: "2026-06-01T00:00:00+00:00" });
    const xml = buildRssFeed([older, newer], SITE_URL, FEED_URL, CHANNEL);
    expect(xml.indexOf("newer00000B")).toBeLessThan(xml.indexOf("older00000A"));
  });

  test("公開日時が不正な動画はフィードから除外する", () => {
    const invalid = makeVideo({ id: "invalid0000", publishedAt: "not-a-date" });
    const xml = buildRssFeed([invalid], SITE_URL, FEED_URL, CHANNEL);
    expect(xml).not.toContain("invalid0000");
    expect(xml).not.toContain("<item>");
  });

  test("最大30件を超える動画は新しい順に切り詰める", () => {
    const videos = Array.from({ length: 35 }, (_, i) =>
      makeVideo({
        id: `video${String(i).padStart(7, "0")}`,
        publishedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      }),
    );
    const xml = buildRssFeed(videos, SITE_URL, FEED_URL, CHANNEL);
    const itemCount = xml.match(/<item>/g)?.length ?? 0;
    expect(itemCount).toBe(30);
    // 最も新しい(1月35日相当=2月4日)動画は含まれ、最も古い動画は切り詰められて含まれない
    expect(xml).toContain("video0000034");
    expect(xml).not.toContain("video0000000");
  });

  test("概要欄はextractSearchableTextと同じ方針で署名欄ハッシュタグ・定型文を除いて要約する", () => {
    const video = makeVideo({
      description: "#chatgpt #ai\n本文の内容です。\n【Profile】\nダミー",
    });
    const xml = buildRssFeed([video], SITE_URL, FEED_URL, CHANNEL);
    expect(xml).toContain("<description>本文の内容です。</description>");
    expect(xml).not.toContain("chatgpt");
    expect(xml).not.toContain("Profile");
  });

  test("本文がXML特殊文字を含む場合はエスケープする", () => {
    const video = makeVideo({
      title: "タイトル <script> & \"test\" 'quote'",
      description: "本文 <b>強調</b> & テスト",
    });
    const xml = buildRssFeed([video], SITE_URL, FEED_URL, CHANNEL);
    expect(xml).toContain(
      "<title>タイトル &lt;script&gt; &amp; &quot;test&quot; &apos;quote&apos;</title>",
    );
    expect(xml).toContain("<description>本文 &lt;b&gt;強調&lt;/b&gt; &amp; テスト</description>");
    expect(xml).not.toContain("<script>");
  });

  test("pageUrlを渡すと<channel><link>にそのURLを出力する(カテゴリ別フィード用・#240)", () => {
    const categoryPageUrl = new URL("https://portal.mayabase.workers.dev/videos/category/ai/");
    const xml = buildRssFeed([], SITE_URL, FEED_URL, CHANNEL, categoryPageUrl);
    expect(xml).toContain("<link>https://portal.mayabase.workers.dev/videos/category/ai/</link>");
  });

  test("pageUrlを省略するとsiteUrlを<channel><link>に出力する(全動画版フィード用)", () => {
    const xml = buildRssFeed([], SITE_URL, FEED_URL, CHANNEL);
    expect(xml).toContain("<link>https://portal.mayabase.workers.dev/</link>");
  });

  test("空の概要欄はタイトルにフォールバックする", () => {
    const video = makeVideo({ description: "" });
    const xml = buildRssFeed([video], SITE_URL, FEED_URL, CHANNEL);
    expect(xml).toContain("<description>動画タイトル</description>");
  });

  test("カテゴリで絞り込んだ動画一覧を渡すと、そのカテゴリのitemのみを含むフィードになる(videos/category/[category]/rss.xml.ts の実データ回帰テスト)", () => {
    // src/pages/videos/category/[category]/rss.xml.ts(#214)と同じ絞り込み方法で
    // 実データを使い、各カテゴリのフィードが空にならず、他カテゴリの動画を含まないことを検証する
    const { videos } = parseVideosData(videosJson);
    const categorized = videos.map((video) => ({ video, category: categorizeVideo(video) }));
    const available = getAvailableCategories(categorized);
    expect(available.length).toBeGreaterThan(0);

    for (const category of available) {
      const categoryVideos = videos.filter((video) => categorizeVideo(video) === category);
      expect(categoryVideos.length).toBeGreaterThan(0);

      const feedUrl = new URL(`videos/category/${category}/rss.xml`, SITE_URL);
      const pageUrl = new URL(categoryUrl(category), SITE_URL);
      const xml = buildRssFeed(categoryVideos, SITE_URL, feedUrl, CHANNEL, pageUrl);
      const itemCount = xml.match(/<item>/g)?.length ?? 0;
      expect(itemCount).toBeGreaterThan(0);
      // <channel><link> はカテゴリアーカイブページを指し、サイトルートには固定されない(#240)
      expect(xml).toContain(`<link>${pageUrl.toString()}</link>`);

      // フィードに含まれる動画がすべて対象カテゴリに属することを、他カテゴリ動画のIDが
      // リンクとして出現しないことで確認する
      const otherCategoryVideoIds = videos
        .filter((video) => categorizeVideo(video) !== category)
        .map((video) => video.id);
      for (const otherId of otherCategoryVideoIds) {
        expect(xml).not.toContain(`videos/${otherId}/`);
      }
    }
  });
});
