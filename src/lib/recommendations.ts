import { CATEGORY_ORDER, type VideoCategory } from "./categories";
import type { Video } from "./youtube";

const MAX_RECOMMENDATION_VIDEOS = 4;

export interface RecommendationDefinition {
  slug: string;
  title: string;
  reason: string;
  category: Exclude<VideoCategory, "other">;
  videoIds: string[];
}

export interface RecommendationsData {
  recommendations: RecommendationDefinition[];
}

export interface Recommendation extends RecommendationDefinition {
  videos: Video[];
}

function isRecommendationCategory(value: unknown): value is RecommendationDefinition["category"] {
  return CATEGORY_ORDER.includes(value as VideoCategory) && value !== "other";
}

export function parseRecommendationsData(data: unknown): RecommendationsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("recommendations.json: オブジェクトではありません");
  }
  const { recommendations } = data as { recommendations?: unknown };
  if (!Array.isArray(recommendations)) {
    throw new Error("recommendations.json: recommendations は配列である必要があります");
  }

  const parsed: RecommendationDefinition[] = [];
  const slugs = new Set<string>();
  for (const item of recommendations) {
    if (typeof item !== "object" || item === null) {
      throw new Error("recommendations.json: recommendation はオブジェクトである必要があります");
    }
    const recommendation = item as Record<string, unknown>;
    const { slug, title, reason, category, videoIds } = recommendation;
    if (
      typeof slug !== "string" ||
      slug.length === 0 ||
      typeof title !== "string" ||
      title.length === 0 ||
      typeof reason !== "string" ||
      reason.length === 0
    ) {
      throw new Error("recommendations.json: slug/title/reason は必須文字列です");
    }
    if (slugs.has(slug)) {
      throw new Error(`recommendations.json: slug が重複しています(${slug})`);
    }
    slugs.add(slug);
    if (!isRecommendationCategory(category)) {
      throw new Error(`recommendations.json: category が不正です(${slug})`);
    }
    if (
      !Array.isArray(videoIds) ||
      videoIds.length === 0 ||
      videoIds.length > MAX_RECOMMENDATION_VIDEOS ||
      videoIds.some((id) => typeof id !== "string" || id.length === 0)
    ) {
      throw new Error(
        `recommendations.json: videoIds は1〜${MAX_RECOMMENDATION_VIDEOS}件の文字列配列が必要です(${slug})`,
      );
    }
    if (new Set(videoIds).size !== videoIds.length) {
      throw new Error(`recommendations.json: videoIds が重複しています(${slug})`);
    }
    parsed.push({ slug, title, reason, category, videoIds });
  }
  return { recommendations: parsed };
}

export function resolveRecommendations(
  recommendations: readonly RecommendationDefinition[],
  videos: readonly Video[],
): Recommendation[] {
  const byId = new Map(videos.map((video) => [video.id, video]));
  return recommendations
    .map((recommendation) => ({
      ...recommendation,
      videos: recommendation.videoIds
        .map((videoId) => byId.get(videoId))
        .filter((video): video is Video => video !== undefined),
    }))
    .filter((recommendation) => recommendation.videos.length > 0);
}
