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

/**
 * 「気になる」ボタンの件数表示を決める。0件の「0」は視聴の妨げになるノイズのため、
 * 0件のときは件数を出さない(#574)。zeroText は Shorts の円形バッジ(件数のみ表示)で
 * 空にならないよう代わりに出す記号。
 */
export function formatInterestCount(
  count: number,
  zeroText = "",
): { text: string; hidden: boolean } {
  if (count > 0) return { text: String(count), hidden: false };
  return { text: zeroText, hidden: zeroText === "" };
}
