import { extractSearchableText, truncate } from "./format";
import { escapeXml } from "./rss";
import type { Video } from "./youtube";
import { embedUrl, thumbnailFallbackUrl } from "./youtube";

/** video:description の上限文字数(Google Video Sitemap仕様) */
const DESCRIPTION_MAX_LENGTH = 2048;

/**
 * Google動画検索向けの XML Video Sitemap(https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps)
 * を生成する。sitemap-index.xml(@astrojs/sitemap)とは別に robots.txt から個別に参照する(#244)。
 * 公開日時が不正な動画(パース不能)はサイトマップから除外する(rss.ts の buildRssFeed と同じ方針)。
 */
export function buildVideoSitemap(videos: readonly Video[], siteUrl: URL): string {
  const urlsXml = videos
    .filter((video) => !Number.isNaN(Date.parse(video.publishedAt)))
    .map((video) => {
      const loc = new URL(`videos/${video.id}/`, siteUrl).toString();
      // JSON-LD(VideoObject.thumbnailUrl)は hq720 を優先し hqdefault にフォールバックする配列だが、
      // video:thumbnail_loc は単一URLしか持てないため、全動画に必ず存在する hqdefault を採用する
      // (動画個別ページの OGP 画像と同じ「確実な表示」優先の判断・#211)。
      const thumbnailLoc = thumbnailFallbackUrl(video.id);
      // truncate は超過時に末尾へ「…」を1文字加えるため、その分を差し引いて渡し、
      // 出力が仕様上限(2048文字)を超えないようにする
      const description =
        truncate(extractSearchableText(video.description), DESCRIPTION_MAX_LENGTH - 1) ||
        video.title;
      const publicationDate = new Date(video.publishedAt).toISOString();
      return [
        "  <url>",
        `    <loc>${escapeXml(loc)}</loc>`,
        "    <video:video>",
        `      <video:thumbnail_loc>${escapeXml(thumbnailLoc)}</video:thumbnail_loc>`,
        `      <video:title>${escapeXml(video.title)}</video:title>`,
        `      <video:description>${escapeXml(description)}</video:description>`,
        `      <video:player_loc>${escapeXml(embedUrl(video.id))}</video:player_loc>`,
        `      <video:publication_date>${publicationDate}</video:publication_date>`,
        "    </video:video>",
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urlsXml}
</urlset>
`;
}
