/** 「あとで見る」に保存した動画IDを保持する localStorage のキー(#216) */
export const WATCH_LATER_STORAGE_KEY = "mayabase-watch-later";

/** 保存できる動画ID数の上限。無制限の localStorage 肥大化を防ぐための安全弁 */
export const WATCH_LATER_MAX_ITEMS = 200;

/** YouTubeの一時プレイリストURLへ渡す動画ID数の上限 */
export const WATCH_LATER_PLAYLIST_MAX_ITEMS = 50;

/** 保存済み動画をYouTubeの一時プレイリストとして開くURLを組み立てる */
export function buildWatchLaterPlaylistUrl(ids: readonly string[]): string {
  const videoIds = ids
    .slice(0, WATCH_LATER_PLAYLIST_MAX_ITEMS)
    .map((id) => encodeURIComponent(id))
    .join(",");
  return `https://www.youtube.com/watch_videos?video_ids=${videoIds}`;
}

/** 値が動画IDの配列として妥当か判定する(localStorage から読んだ値の検証・型ガードに使う) */
function isIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

/**
 * localStorage から読み出した生のJSON文字列(未設定の場合は null)から
 * 保存済み動画IDの配列を決定する。JSON として解釈できない・配列でない・
 * 要素が文字列でない等の不正な値はすべて空配列にフォールバックする。
 */
export function parseStoredWatchLaterIds(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return isIdArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 指定した動画IDが保存済みか判定する */
export function isWatchLaterSaved(ids: readonly string[], id: string): boolean {
  return ids.includes(id);
}

/**
 * 指定した動画IDを末尾に追加した新しい配列を返す(元の配列は変更しない)。
 * 既に存在する場合、または上限(WATCH_LATER_MAX_ITEMS)に達している場合は変更せずコピーを返す。
 */
export function addWatchLaterId(ids: readonly string[], id: string): string[] {
  if (isWatchLaterSaved(ids, id) || ids.length >= WATCH_LATER_MAX_ITEMS) return [...ids];
  return [...ids, id];
}

/**
 * 指定した動画IDへの追加操作が、上限(WATCH_LATER_MAX_ITEMS)到達により
 * 反映されない(サイレントな no-op になる)かどうかを判定する。
 * 既に保存済みのID(削除方向のトグル)は上限に関係なく常に成功するため false になる。
 */
export function isWatchLaterAddBlockedByLimit(ids: readonly string[], id: string): boolean {
  return !isWatchLaterSaved(ids, id) && ids.length >= WATCH_LATER_MAX_ITEMS;
}

/** 指定した動画IDを取り除いた新しい配列を返す(元の配列は変更しない) */
export function removeWatchLaterId(ids: readonly string[], id: string): string[] {
  return ids.filter((existing) => existing !== id);
}

/** 指定した動画IDの保存/未保存を反転した新しい配列を返す(元の配列は変更しない) */
export function toggleWatchLaterId(ids: readonly string[], id: string): string[] {
  return isWatchLaterSaved(ids, id) ? removeWatchLaterId(ids, id) : addWatchLaterId(ids, id);
}
