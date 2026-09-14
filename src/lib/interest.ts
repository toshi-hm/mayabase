export const INTEREST_REACTED_STORAGE_KEY = "mayabase:interest-reacted:v1";

/**
 * 保存できるリアクション済み動画ID数の上限。無制限の localStorage 肥大化を防ぐための
 * 安全弁(WATCH_LATER_MAX_ITEMS 等と同じ方針、#434)。
 */
export const INTEREST_REACTED_MAX_ITEMS = 200;

export function parseReactedVideoIds(value: string | null): string[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : [];
  } catch {
    return [];
  }
}

export function addReactedVideoId(videoIds: readonly string[], videoId: string): string[] {
  const merged = [...new Set([...videoIds, videoId])];
  return merged.slice(Math.max(0, merged.length - INTEREST_REACTED_MAX_ITEMS));
}
