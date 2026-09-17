/** 視聴済みバッジ(#423)表示用に、クリックした動画IDを保持する localStorage のキー */
export const WATCHED_STORAGE_KEY = "mayabase-watched";

/**
 * 保存する動画ID数の上限。
 * CONTINUE_WATCHING_STORAGE_KEY(直近5件のみ保持)をそのまま流用すると6件目以降の視聴履歴が
 * 失われ、視聴済みバッジが正しく表示されなくなるため専用のキーを用意しているが、
 * こちらも無制限の localStorage 肥大化を防ぐ安全弁として上限を設ける
 * (WATCH_LATER_MAX_ITEMS と同じ方針。バッジ用途のため保存件数はやや多めにしている)。
 */
export const WATCHED_MAX_ITEMS = 500;

/** 値が動画IDの配列として妥当か判定する(localStorage から読んだ値の検証・型ガードに使う) */
function isIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

/**
 * localStorage から読み出した生のJSON文字列(未設定の場合は null)から
 * 視聴済み動画IDの配列を決定する。JSON として解釈できない・配列でない・
 * 要素が文字列でない等の不正な値はすべて空配列にフォールバックする。
 */
export function parseStoredWatchedIds(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return isIdArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 指定した動画IDが視聴済みとして記録されているか判定する */
export function isWatchedId(ids: readonly string[], id: string): boolean {
  return ids.includes(id);
}

/**
 * 指定した動画IDを「視聴済み」として記録した新しい配列を返す(元の配列は変更しない)。
 * 既に含まれる場合は重複させずそのまま返す。上限(WATCHED_MAX_ITEMS)を超えた場合は
 * 古い方(先頭)から間引く。
 */
export function recordWatchedId(ids: readonly string[], id: string): string[] {
  if (isWatchedId(ids, id)) return [...ids];
  const next = [...ids, id];
  const overflow = next.length - WATCHED_MAX_ITEMS;
  return overflow > 0 ? next.slice(overflow) : next;
}
