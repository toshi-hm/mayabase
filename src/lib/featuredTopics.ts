import { CATEGORY_ORDER, type VideoCategory } from "./categories";
import type { Video } from "./youtube";

const MAX_TOPIC_VIDEOS = 4;

export interface FeaturedTopicDefinition {
  slug: string;
  title: string;
  description: string;
  category: Exclude<VideoCategory, "other">;
  videoIds: string[];
  expiresAt?: string;
}

export interface FeaturedTopicsData {
  topics: FeaturedTopicDefinition[];
}

export interface FeaturedTopic extends FeaturedTopicDefinition {
  videos: Video[];
}

function isFeaturedTopicCategory(value: unknown): value is FeaturedTopicDefinition["category"] {
  return CATEGORY_ORDER.includes(value as VideoCategory) && value !== "other";
}

/**
 * featured-topics.json を検証しつつパースする。
 * 公開ページに表示する編集データのため、不正なIDや重複したslugはビルド時に検知する。
 */
export function parseFeaturedTopicsData(data: unknown): FeaturedTopicsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("featured-topics.json: オブジェクトではありません");
  }
  const { topics } = data as { topics?: unknown };
  if (!Array.isArray(topics)) {
    throw new Error("featured-topics.json: topics は配列である必要があります");
  }

  const parsed: FeaturedTopicDefinition[] = [];
  const slugs = new Set<string>();
  for (const item of topics) {
    if (typeof item !== "object" || item === null) {
      throw new Error("featured-topics.json: topic はオブジェクトである必要があります");
    }
    const topic = item as Record<string, unknown>;
    const { slug, title, description, category, videoIds, expiresAt } = topic;
    if (
      typeof slug !== "string" ||
      slug.length === 0 ||
      typeof title !== "string" ||
      title.length === 0 ||
      typeof description !== "string" ||
      description.length === 0
    ) {
      throw new Error("featured-topics.json: slug/title/description は必須文字列です");
    }
    if (slugs.has(slug)) {
      throw new Error(`featured-topics.json: slug が重複しています(${slug})`);
    }
    slugs.add(slug);
    if (!isFeaturedTopicCategory(category)) {
      throw new Error(`featured-topics.json: category が不正です(${slug})`);
    }
    if (
      !Array.isArray(videoIds) ||
      videoIds.length === 0 ||
      videoIds.length > MAX_TOPIC_VIDEOS ||
      videoIds.some((id) => typeof id !== "string" || id.length === 0)
    ) {
      throw new Error(
        `featured-topics.json: videoIds は1〜${MAX_TOPIC_VIDEOS}件の文字列配列が必要です(${slug})`,
      );
    }
    if (new Set(videoIds).size !== videoIds.length) {
      throw new Error(`featured-topics.json: videoIds が重複しています(${slug})`);
    }
    if (
      expiresAt !== undefined &&
      (typeof expiresAt !== "string" || Number.isNaN(Date.parse(`${expiresAt}T23:59:59Z`)))
    ) {
      throw new Error(`featured-topics.json: expiresAt が不正です(${slug})`);
    }
    parsed.push({
      slug,
      title,
      description,
      category,
      videoIds,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    });
  }
  return { topics: parsed };
}

/**
 * 編集データのvideoIdsを動画一覧へ解決し、期限切れや動画が全て欠損したテーマを除外する。
 * videoIdsの順序は代表動画→関連動画の表示順として維持する。
 */
export function resolveFeaturedTopics(
  topics: readonly FeaturedTopicDefinition[],
  videos: readonly Video[],
  now = new Date(),
): FeaturedTopic[] {
  const byId = new Map(videos.map((video) => [video.id, video]));
  return topics
    .filter(
      (topic) =>
        topic.expiresAt === undefined ||
        now.getTime() <= Date.parse(`${topic.expiresAt}T23:59:59Z`),
    )
    .map((topic) => ({
      ...topic,
      videos: topic.videoIds
        .map((videoId) => byId.get(videoId))
        .filter((video): video is Video => video !== undefined),
    }))
    .filter((topic) => topic.videos.length > 0);
}
