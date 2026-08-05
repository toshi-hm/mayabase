import { categorizeVideo, type VideoCategory } from "./categories";
import type { Video } from "./youtube";

/**
 * 動画詳細ページの「関連動画」を選ぶ。
 * - 同カテゴリの動画から自分自身を除外
 * - 公開日の新しい順(videos.json は既に新しい順で並んでいるが、呼び出し元の順序に依存しないよう明示的にソートする)
 * - 上限件数で打ち切る
 */
export function getRelatedVideos(
  video: Pick<Video, "id" | "title" | "publishedAt">,
  videos: readonly Video[],
  category: VideoCategory,
  limit: number,
): Video[] {
  return videos
    .filter((v) => v.id !== video.id && categorizeVideo(v) === category)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

export interface AdjacentVideos {
  /** 公開日が1つ前(より古い)動画。最古の動画なら null */
  older: Video | null;
  /** 公開日が1つ後(より新しい)動画。最新の動画なら null */
  newer: Video | null;
}

/**
 * 動画詳細ページの「前の動画・次の動画」ナビゲーション用に、公開日時で隣接する動画を返す。
 * 呼び出し元の順序に依存しないよう公開日の新しい順に明示的にソートしてから探索する。
 */
export function getAdjacentVideos(
  video: Pick<Video, "id" | "publishedAt">,
  videos: readonly Video[],
): AdjacentVideos {
  const sorted = [...videos].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const index = sorted.findIndex((v) => v.id === video.id);
  if (index === -1) return { older: null, newer: null };
  return {
    older: sorted[index + 1] ?? null,
    newer: index > 0 ? (sorted[index - 1] ?? null) : null,
  };
}
