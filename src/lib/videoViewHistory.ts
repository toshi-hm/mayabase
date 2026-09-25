import type { Video } from "./youtube";

export const MAX_VIDEO_VIEW_HISTORY_SNAPSHOTS = 90;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface VideoViewHistorySnapshot {
  /** 取得日(YYYY-MM-DD)。1日に複数回取得しても1件にまとめる */
  date: string;
  /** 動画IDごとの、その日時点の再生回数 */
  viewCounts: Record<string, number>;
}

export interface VideoViewHistoryData {
  snapshots: VideoViewHistorySnapshot[];
}

export interface RecentViewGrowthItem {
  video: Video;
  increase: number;
  baselineDate: string;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function createEmptyVideoViewHistory(): VideoViewHistoryData {
  return { snapshots: [] };
}

export function parseVideoViewHistory(data: unknown): VideoViewHistoryData {
  if (typeof data !== "object" || data === null) {
    throw new Error("video-view-history.json: オブジェクトではありません");
  }
  const { snapshots } = data as { snapshots?: unknown };
  if (!Array.isArray(snapshots)) {
    throw new Error("video-view-history.json: snapshots は配列である必要があります");
  }

  const dates = new Set<string>();
  const parsed = snapshots.map((snapshot, index) => {
    if (typeof snapshot !== "object" || snapshot === null) {
      throw new Error(`video-view-history.json[${index}]: オブジェクトではありません`);
    }
    const { date, viewCounts } = snapshot as {
      date?: unknown;
      viewCounts?: unknown;
    };
    if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
      throw new Error(
        "video-view-history.json[" +
          index +
          "]: date は YYYY-MM-DD 形式の文字列である必要があります",
      );
    }
    if (dates.has(date)) {
      throw new Error(`video-view-history.json: date が重複しています(${date})`);
    }
    dates.add(date);
    if (typeof viewCounts !== "object" || viewCounts === null || Array.isArray(viewCounts)) {
      throw new Error(
        `video-view-history.json[${index}]: viewCounts はオブジェクトである必要があります`,
      );
    }

    const normalized: Record<string, number> = {};
    for (const [videoId, count] of Object.entries(viewCounts as Record<string, unknown>)) {
      if (videoId.length === 0 || !isNonNegativeSafeInteger(count)) {
        throw new Error(
          "video-view-history.json[" +
            index +
            "]: viewCounts の値は0以上の安全な整数である必要があります",
        );
      }
      normalized[videoId] = count;
    }
    return { date, viewCounts: normalized };
  });

  return { snapshots: parsed.sort((a, b) => a.date.localeCompare(b.date)) };
}

export function appendVideoViewHistory(
  history: VideoViewHistoryData,
  date: string,
  viewCounts: ReadonlyMap<string, number>,
  maxSnapshots: number = MAX_VIDEO_VIEW_HISTORY_SNAPSHOTS,
): VideoViewHistoryData {
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`appendVideoViewHistory: date が不正です(${date})`);
  }
  if (maxSnapshots < 1 || !Number.isInteger(maxSnapshots)) {
    throw new Error("appendVideoViewHistory: maxSnapshots は1以上の整数である必要があります");
  }

  const normalized: Record<string, number> = {};
  for (const [videoId, count] of viewCounts) {
    if (videoId.length > 0 && isNonNegativeSafeInteger(count)) {
      normalized[videoId] = count;
    }
  }
  if (Object.keys(normalized).length === 0) {
    return history;
  }

  const snapshots = [
    ...history.snapshots.filter((snapshot) => snapshot.date !== date),
    { date, viewCounts: normalized },
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-maxSnapshots);

  return { snapshots };
}

export function calculateRecentViewGrowth(
  videos: readonly Video[],
  history: VideoViewHistoryData,
  asOfDate: string,
  days = 7,
  limit = 6,
): RecentViewGrowthItem[] {
  if (!DATE_PATTERN.test(asOfDate) || days < 1 || !Number.isInteger(days)) {
    return [];
  }
  const targetDate = new Date(`${asOfDate}T00:00:00Z`);
  targetDate.setUTCDate(targetDate.getUTCDate() - days);
  const targetDateString = targetDate.toISOString().slice(0, 10);

  const baselineSnapshots = history.snapshots
    .filter((snapshot) => snapshot.date <= targetDateString)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (baselineSnapshots.length === 0) return [];

  const current = new Map(videos.map((video) => [video.id, video]));
  const items: RecentViewGrowthItem[] = [];
  for (const [videoId, video] of current) {
    if (video.viewCount === null) continue;
    const baseline = baselineSnapshots.find(
      (snapshot) => snapshot.viewCounts[videoId] !== undefined,
    );
    if (!baseline) continue;
    const increase = Math.max(0, video.viewCount - baseline.viewCounts[videoId]);
    if (increase === 0) continue;
    items.push({ video, increase, baselineDate: baseline.date });
  }

  return items
    .sort(
      (a, b) =>
        b.increase - a.increase ||
        Date.parse(b.video.publishedAt) - Date.parse(a.video.publishedAt) ||
        a.video.id.localeCompare(b.video.id),
    )
    .slice(0, Math.max(0, limit));
}
