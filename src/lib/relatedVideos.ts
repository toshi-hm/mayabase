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
    .sort((a, b) => sortTime(b) - sortTime(a))
    .slice(0, limit);
}

/** ソート用の時刻値。不正な日付は最古扱いにして降順リストの末尾へ寄せる(youtube.ts / rss.ts の sortTime と同じ方針) */
function sortTime(video: Pick<Video, "publishedAt">): number {
  const time = Date.parse(video.publishedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
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
  const sorted = [...videos].sort((a, b) => sortTime(b) - sortTime(a));
  const index = sorted.findIndex((v) => v.id === video.id);
  if (index === -1) return { older: null, newer: null };
  return {
    older: sorted[index + 1] ?? null,
    newer: index > 0 ? (sorted[index - 1] ?? null) : null,
  };
}

/**
 * 再生終了後に提示する「次の動画」を選ぶ(#175)。
 * 公開日順ナビゲーションの adjacentVideos.newer(1つ新しい動画)を優先し、
 * 最新動画で newer が無ければ同カテゴリの関連動画(relatedVideos)の先頭で代替する。
 * どちらも無ければ null を返し、呼び出し元は提示UI自体を出さない。
 */
export function pickNextVideo(
  adjacent: Pick<AdjacentVideos, "newer">,
  related: readonly Video[],
): Video | null {
  return adjacent.newer ?? related[0] ?? null;
}
