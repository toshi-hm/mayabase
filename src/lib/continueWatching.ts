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

/** 動画ごとの再生位置。既存のID履歴とは別キーにして後方互換を保つ。 */
export const CONTINUE_WATCHING_PROGRESS_STORAGE_KEY = "mayabase-continue-watching-progress";

/**
 * 保存する再生位置エントリ数の上限。「続きから」の対象候補になり得るのは
 * CONTINUE_WATCHING_MAX_ITEMS(5件)のIDのみだが、サイト内リンクで巡回した
 * 動画すべての再生位置がこのマップには記録され得るため、無制限な肥大化を防ぐ安全弁として
 * WATCH_LATER_MAX_ITEMS 等と同じ方針で上限を設ける(#397)。
 */
export const CONTINUE_WATCHING_PROGRESS_MAX_ITEMS = 20;
export interface ContinueWatchingProgress {
  videoId: string;
  seconds: number;
}

export function parseStoredContinueWatchingProgress(raw: string | null): Record<string, number> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const result: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (
        /^[A-Za-z0-9_-]+$/.test(id) &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0
      ) {
        result[id] = Math.floor(value);
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function recordContinueWatchingProgress(
  progress: Readonly<Record<string, number>>,
  videoId: string,
  seconds: number,
): Record<string, number> {
  if (!/^[A-Za-z0-9_-]+$/.test(videoId) || !Number.isFinite(seconds) || seconds < 0) {
    return { ...progress };
  }
  const next = { ...progress, [videoId]: Math.floor(seconds) };
  const ids = Object.keys(next);
  const overflow = ids.length - CONTINUE_WATCHING_PROGRESS_MAX_ITEMS;
  if (overflow > 0) {
    // オブジェクトの列挙順(=挿入順)の先頭から、上限を超えた分の古いエントリを間引く
    for (const id of ids.slice(0, overflow)) {
      delete next[id];
    }
  }
  return next;
}

/**
 * 指定した動画IDの再生位置エントリを取り除いた新しいマップを返す(元のマップは変更しない)。
 * 動画を最後まで視聴した(YouTube IFrame Player API の ENDED)場合に、
 * 終了間際の位置をそのまま「続きから」として提示しないよう呼び出す想定(#396)。
 */
export function clearContinueWatchingProgress(
  progress: Readonly<Record<string, number>>,
  videoId: string,
): Record<string, number> {
  if (!(videoId in progress)) return { ...progress };
  const next = { ...progress };
  delete next[videoId];
  return next;
}
