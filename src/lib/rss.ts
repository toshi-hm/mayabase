import { extractSearchableText, truncate } from "./format";
import type { Video } from "./youtube";

/** フィードに含める新着動画の最大件数 */
const RSS_ITEM_LIMIT = 30;

/** RSS description の切り詰め文字数(JSON-LD VideoObject と概ね揃える) */
const DESCRIPTION_MAX_LENGTH = 300;

export interface RssChannelInfo {
  /** チャンネルタイトル(<channel><title>) */
  title: string;
  /** サイト説明文(<channel><description>) */
  description: string;
}

/** XML への挿入前に特殊文字をエスケープする(属性値・テキストノード両方で安全な最小限のセット) */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** ソート用の時刻値。不正な日付は最古扱いにして降順リストの末尾へ寄せる(youtube.ts の sortTime と同じ方針) */
function sortTime(video: Pick<Video, "publishedAt">): number {
  const time = Date.parse(video.publishedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * 新着動画の RSS 2.0 フィード(XML 文字列)を生成する。
 * 各アイテムのリンク先は動画個別ページ(/videos/{id}/)とし、サイトへの回遊も狙う(#186)。
 * 公開日時が不正な動画(パース不能)はフィードから除外する。
 * `<channel><link>` にはこのフィードに対応する閲覧用ページ URL(`pageUrl`)を出力する。
 * 省略時は `siteUrl`(トップページ)を使う(全動画版は siteUrl = トップページで一致するため・#186)。
 */
export function buildRssFeed(
  videos: readonly Video[],
  siteUrl: URL,
  feedUrl: URL,
  channel: RssChannelInfo,
  pageUrl: URL = siteUrl,
): string {
  const items = videos
    .filter((video) => !Number.isNaN(Date.parse(video.publishedAt)))
    .slice()
    .sort((a, b) => sortTime(b) - sortTime(a))
    .slice(0, RSS_ITEM_LIMIT);

  const itemsXml = items
    .map((video) => {
      const link = new URL(`videos/${video.id}/`, siteUrl).toString();
      // 署名欄ハッシュタグ・定型文を除いた本文相当部分のみを要約する(動画ページの meta description と同じ方針・#125)
      const description =
        truncate(extractSearchableText(video.description), DESCRIPTION_MAX_LENGTH) || video.title;
      const pubDate = new Date(video.publishedAt).toUTCString();
      return [
        "    <item>",
        `      <title>${escapeXml(video.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <description>${escapeXml(description)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(pageUrl.toString())}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>ja</language>
    <atom:link href="${escapeXml(feedUrl.toString())}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>
`;
}
