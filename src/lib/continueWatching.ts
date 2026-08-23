/** 「前回の続きから」導線(#188)で、視聴・クリックした動画IDを保持する localStorage のキー */
export const CONTINUE_WATCHING_STORAGE_KEY = "mayabase-continue-watching";

/**
 * 保存する動画ID数の上限。表示は1件のみだが、直近の1件が削除・非公開等で
 * データに存在しなくなっていた場合に備えて数件分の履歴を保持する。
 */
export const CONTINUE_WATCHING_MAX_ITEMS = 5;

/** 値が動画IDの配列として妥当か判定する(localStorage から読んだ値の検証・型ガードに使う) */
function isIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

/**
 * localStorage から読み出した生のJSON文字列(未設定の場合は null)から
 * 記録済み動画IDの配列(新しい順)を決定する。JSON として解釈できない・配列でない・
 * 要素が文字列でない等の不正な値はすべて空配列にフォールバックする。
 */
export function parseStoredContinueWatchingIds(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return isIdArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 指定した動画IDを「直近に視聴・クリックした」先頭へ記録した新しい配列を返す
 * (元の配列は変更しない)。既に含まれる場合は重複させず先頭へ移動する。
 * 上限(CONTINUE_WATCHING_MAX_ITEMS)を超えた古い分は切り捨てる。
 */
export function recordContinueWatchingId(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter((existing) => existing !== id)].slice(0, CONTINUE_WATCHING_MAX_ITEMS);
}

/** トップページの「前回の続きから」バナー描画に必要な最小限の動画情報 */
export interface ContinueWatchingCandidate {
  id: string;
  title: string;
  isShort: boolean | null;
}

/** 値が ContinueWatchingCandidate として妥当か判定する */
function isCandidate(value: unknown): value is ContinueWatchingCandidate {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<Record<keyof ContinueWatchingCandidate, unknown>>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.title === "string" &&
    (typeof v.isShort === "boolean" || v.isShort === null)
  );
}

/**
 * ページに埋め込まれた候補動画一覧(JSON文字列。未設定の場合は null)をパースする。
 * JSON として解釈できない・配列でない・要素の形式が不正な値はすべて空配列にフォールバックする。
 */
export function parseContinueWatchingCandidates(raw: string | null): ContinueWatchingCandidate[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isCandidate) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 記録済み動画ID一覧(新しい順)の中から、現在も候補一覧に存在する最も新しい動画を選ぶ。
 * 該当する動画が1件もなければ null を返す(削除・非公開等で存在しない動画のためだけに
 * バナーを出さないようにする)。
 */
export function selectContinueWatchingVideo<T extends { id: string }>(
  ids: readonly string[],
  candidates: readonly T[],
): T | null {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const id of ids) {
    const candidate = byId.get(id);
    if (candidate) return candidate;
  }
  return null;
}
