import type { Video } from "./youtube";

/** 一気見ライトボックスで再生する動画の最小情報。 */
export interface VideoQueueItem {
  id: string;
  title: string;
  aspect: "video" | "short";
}

/** 動画データから、HTML属性へ安全に渡せる一気見キューを作る。 */
export function createVideoQueue(
  videos: readonly Pick<Video, "id" | "title" | "isShort">[],
): VideoQueueItem[] {
  return videos.map((video) => ({
    id: video.id,
    title: video.title,
    aspect: video.isShort ? "short" : "video",
  }));
}

/** 現在の動画の直後にある動画を返す。末尾では null を返してループ再生しない。 */
export function nextVideoInQueue(
  queue: readonly VideoQueueItem[],
  currentId: string,
): VideoQueueItem | null {
  const index = queue.findIndex((item) => item.id === currentId);
  return index >= 0 && index + 1 < queue.length ? (queue[index + 1] ?? null) : null;
}

/** 表示中のトリガーだけをDOM順で一気見キューへ変換する。 */
export function createVisibleVideoQueue(
  items: readonly (VideoQueueItem & { hidden?: boolean })[],
): VideoQueueItem[] {
  return items.filter((item) => !item.hidden).map(({ hidden: _hidden, ...item }) => item);
}
