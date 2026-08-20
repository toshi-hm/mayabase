import { describe, expect, test } from "bun:test";
import videosJson from "../data/videos.json";
import { buildVideoSitemap } from "./videoSitemap";
import type { Video } from "./youtube";
import { parseVideosData } from "./youtube";

const SITE_URL = new URL("https://portal.mayabase.workers.dev");

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

describe("buildVideoSitemap", () => {
  test("動画0件でも壊れたXMLにならない", () => {
    const xml = buildVideoSitemap([], SITE_URL);
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
    );
    expect(xml).not.toContain("<url>");
  });

  test("各動画をurlとして出力し、locは動画個別ページになる", () => {
    const xml = buildVideoSitemap([makeVideo()], SITE_URL);
    expect(xml).toContain("<loc>https://portal.mayabase.workers.dev/videos/abc123DEF45/</loc>");
    expect(xml).toContain(
      "<video:thumbnail_loc>https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg</video:thumbnail_loc>",
    );
    expect(xml).toContain("<video:title>動画タイトル</video:title>");
    expect(xml).toContain("<video:description>本文の内容です。</video:description>");
    expect(xml).toContain(
      "<video:player_loc>https://www.youtube.com/embed/abc123DEF45</video:player_loc>",
    );
    expect(xml).toContain(
      "<video:publication_date>2026-07-01T12:00:00.000Z</video:publication_date>",
    );
  });

  test("概要欄はextractSearchableTextと同じ方針で署名欄ハッシュタグ・定型文を除いて要約する", () => {
    const video = makeVideo({
      description: "#chatgpt #ai\n本文の内容です。\n【Profile】\nダミー",
    });
    const xml = buildVideoSitemap([video], SITE_URL);
    expect(xml).toContain("<video:description>本文の内容です。</video:description>");
    expect(xml).not.toContain("chatgpt");
    expect(xml).not.toContain("Profile");
  });

  test("空の概要欄はタイトルにフォールバックする", () => {
    const video = makeVideo({ description: "" });
    const xml = buildVideoSitemap([video], SITE_URL);
    expect(xml).toContain("<video:description>動画タイトル</video:description>");
  });

  test("公開日時が不正な動画はサイトマップから除外する", () => {
    const invalid = makeVideo({ id: "invalid0000", publishedAt: "not-a-date" });
    const xml = buildVideoSitemap([invalid], SITE_URL);
    expect(xml).not.toContain("invalid0000");
    expect(xml).not.toContain("<url>");
  });

  test("長い概要欄は仕様上限(2048文字)以内に切り詰める", () => {
    const video = makeVideo({ description: "あ".repeat(3000) });
    const xml = buildVideoSitemap([video], SITE_URL);
    const description = xml.match(/<video:description>([\s\S]*?)<\/video:description>/)?.[1] ?? "";
    expect([...description].length).toBe(2048);
    expect(description).toEndWith("…");
  });

  test("タイトル・概要欄のXML特殊文字をエスケープする", () => {
    const video = makeVideo({
      title: "タイトル <script> & \"test\" 'quote'",
      description: "本文 <b>強調</b> & テスト",
    });
    const xml = buildVideoSitemap([video], SITE_URL);
    expect(xml).toContain(
      "<video:title>タイトル &lt;script&gt; &amp; &quot;test&quot; &apos;quote&apos;</video:title>",
    );
    expect(xml).toContain(
      "<video:description>本文 &lt;b&gt;強調&lt;/b&gt; &amp; テスト</video:description>",
    );
    expect(xml).not.toContain("<script>");
  });

  test("実データ(videos.json)で複数動画分のurlを壊れずに生成できる", () => {
    const { videos } = parseVideosData(videosJson);
    expect(videos.length).toBeGreaterThan(0);
    const xml = buildVideoSitemap(videos, SITE_URL);
    const urlCount = xml.match(/<url>/g)?.length ?? 0;
    expect(urlCount).toBeGreaterThan(0);
    expect(urlCount).toBeLessThanOrEqual(videos.length);
  });
});
