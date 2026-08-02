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
