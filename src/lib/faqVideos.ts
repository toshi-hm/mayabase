import { CATEGORY_LABELS, categorizeVideo, type VideoCategory } from "./categories";
import { type FaqItem, isInternalPath } from "./faq";
import { extractSearchableText, textMatchesKeyword } from "./format";
import type { Video } from "./youtube";

export const FAQ_RELATED_VIDEO_LIMIT = 3;

function categoryFromLink(url: string): VideoCategory | null {
  const match = url.match(/^\/videos\/category\/([^/]+)\/?$/);
  if (!match) return null;
  const category = match[1];
  return (Object.keys(CATEGORY_LABELS) as VideoCategory[]).includes(
    category as VideoCategory,
  )
    ? (category as VideoCategory)
    : null;
}

function videoIdFromLink(url: string): string | null {
  const match = url.match(/^\/videos\/([A-Za-z0-9_-]{1,32})\/?$/);
  return match?.[1] ?? null;
}

function matchesKeyword(video: Video, keyword: string): boolean {
  const categoryLabel = CATEGORY_LABELS[categorizeVideo(video)];
  return (
    textMatchesKeyword(video.title, keyword) ||
    textMatchesKeyword(extractSearchableText(video.description), keyword) ||
    textMatchesKeyword(categoryLabel, keyword)
  );
}

/**
 * FAQ項目から関連動画を解決する。
 * - videoIds: FAQデータで明示した動画
 * - link: 個別動画URLまたはカテゴリURL
 * - keywords: タイトル・概要欄・カテゴリラベルへのキーワードマッチ
 *
 * 複数の条件で同じ動画に一致しても1件にまとめ、公開日時順(videos.jsonの順序)を維持する。
 */
export function resolveFaqVideos(
  item: FaqItem,
  videos: readonly Video[],
  limit = FAQ_RELATED_VIDEO_LIMIT,
): Video[] {
  const directVideoIds = new Set(item.videoIds ?? []);
  const linkedVideoId = item.link && isInternalPath(item.link.url) ? videoIdFromLink(item.link.url) : null;
  if (linkedVideoId) directVideoIds.add(linkedVideoId);
  const linkedCategory =
    item.link && isInternalPath(item.link.url) ? categoryFromLink(item.link.url) : null;
  const keywords = item.keywords ?? [];

  return videos
    .filter((video) => {
      if (directVideoIds.has(video.id)) return true;
      if (linkedCategory && categorizeVideo(video) === linkedCategory) return true;
      return keywords.some((keyword) => matchesKeyword(video, keyword));
    })
    .slice(0, limit);
}

/** 動画詳細ページに表示するFAQを解決する。FAQ側と同じ判定結果を逆方向に利用する。 */
export function findFaqItemsForVideo(
  items: readonly FaqItem[],
  video: Video,
): FaqItem[] {
  return items.filter((item) => resolveFaqVideos(item, [video], 1).length > 0);
}
