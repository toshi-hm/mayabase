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

/** data-binge-queue の値を検証し、不正値は空キューとして扱う。 */
export function parseVideoQueue(value: string | undefined): VideoQueueItem[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVideoQueueItem);
  } catch {
    return [];
  }
}

function isVideoQueueItem(value: unknown): value is VideoQueueItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Record<keyof VideoQueueItem, unknown>>;
  return (
    typeof item.id === "string" &&
    /^[A-Za-z0-9_-]+$/.test(item.id) &&
    typeof item.title === "string" &&
    item.title.length > 0 &&
    (item.aspect === "video" || item.aspect === "short")
  );
}
