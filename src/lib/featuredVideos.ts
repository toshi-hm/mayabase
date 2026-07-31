import type { Video } from "./youtube";

/** featured-videos.json 全体の構造。運営者が手動でキュレーションする代表動画の ID リスト */
export interface FeaturedVideosData {
  /** 表示したい順(先頭が最優先)の video ID リスト */
  featuredVideoIds: string[];
}

/**
 * featured-videos.json の内容を検証しつつパースする。
 * 不正データは具体的なメッセージ付きで throw する(ビルドを落として混入を検知する)。
 */
export function parseFeaturedVideosData(data: unknown): FeaturedVideosData {
  if (typeof data !== "object" || data === null) {
    throw new Error("featured-videos.json: オブジェクトではありません");
  }
  const { featuredVideoIds } = data as { featuredVideoIds?: unknown };
  if (!Array.isArray(featuredVideoIds) || featuredVideoIds.some((id) => typeof id !== "string")) {
    throw new Error("featured-videos.json: featuredVideoIds は文字列配列である必要があります");
  }
  return { featuredVideoIds };
}

/**
 * featuredVideoIds を videos.json 由来の一覧から解決する。
 * - featuredVideoIds の順序を維持する
 * - videos に存在しない ID(削除済み・入力ミス等)は黙ってスキップする
 */
export function resolveFeaturedVideos(featuredVideoIds: string[], videos: Video[]): Video[] {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const resolved: Video[] = [];
  for (const id of featuredVideoIds) {
    const video = byId.get(id);
    if (video) resolved.push(video);
  }
  return resolved;
}
