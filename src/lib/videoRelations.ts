import type { Video } from "./youtube";

export interface VideoRelation {
  videoId: string;
  relatedVideoIds: string[];
}

export interface VideoRelationsData {
  relations: VideoRelation[];
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function parseVideoRelationsData(data: unknown): VideoRelationsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("video-relations.json: オブジェクトではありません");
  }

  const rawRelations = (data as { relations?: unknown }).relations;
  if (!Array.isArray(rawRelations)) {
    throw new Error("video-relations.json: relations は配列である必要があります");
  }

  const seenVideoIds = new Set<string>();
  const relations = rawRelations.map((raw, index): VideoRelation => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`video-relations.json: relations[${index}] が不正です`);
    }
    const item = raw as { videoId?: unknown; relatedVideoIds?: unknown };
    if (typeof item.videoId !== "string" || !VIDEO_ID_PATTERN.test(item.videoId)) {
      throw new Error(`video-relations.json: relations[${index}].videoId が不正です`);
    }
    if (seenVideoIds.has(item.videoId)) {
      throw new Error(
        `video-relations.json: relations[${index}].videoId "${item.videoId}" が重複しています`,
      );
    }
    seenVideoIds.add(item.videoId);

    if (
      !Array.isArray(item.relatedVideoIds) ||
      item.relatedVideoIds.length < 1 ||
      item.relatedVideoIds.length > 6
    ) {
      throw new Error(
        `video-relations.json: relations[${index}].relatedVideoIds は1〜6件の配列である必要があります`,
      );
    }

    const seenRelatedIds = new Set<string>();
    const relatedVideoIds = item.relatedVideoIds.map((relatedId, relatedIndex) => {
      if (typeof relatedId !== "string" || !VIDEO_ID_PATTERN.test(relatedId)) {
        throw new Error(
          `video-relations.json: relations[${index}].relatedVideoIds[${relatedIndex}] が不正です`,
        );
      }
      if (relatedId === item.videoId || seenRelatedIds.has(relatedId)) {
        throw new Error(
          `video-relations.json: relations[${index}].relatedVideoIds に重複または自身のIDがあります`,
        );
      }
      seenRelatedIds.add(relatedId);
      return relatedId;
    });

    return { videoId: item.videoId, relatedVideoIds };
  });

  return { relations };
}

export function getCuratedRelatedVideos(
  videoId: string,
  videos: readonly Video[],
  relations: readonly VideoRelation[],
  limit: number,
): Video[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit は1以上の整数を指定してください: ${limit}`);
  }

  const relation = relations.find((item) => item.videoId === videoId);
  if (!relation) return [];

  const videosById = new Map(videos.map((video) => [video.id, video]));
  return relation.relatedVideoIds
    .map((relatedId) => videosById.get(relatedId))
    .filter((video): video is Video => video !== undefined)
    .slice(0, limit);
}
