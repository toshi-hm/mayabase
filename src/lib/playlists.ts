/**
 * series.json の `youtubePlaylistId` に対応する、YouTube 再生リストの所属動画IDスナップショット(#408)。
 * `scripts/fetch-videos.ts` が `YOUTUBE_API_KEY` 設定時にのみ、series.json が参照する再生リストだけを
 * 取得して `src/data/playlists.json` に永続化する。未設定時・取得失敗時は前回値を維持する
 * (videos.json の isShort 判定などと同じ方針)。
 */

/** 再生リスト 1 件分の所属動画ID一覧 */
export interface PlaylistMembership {
  /** YouTube 再生リストID(series.json の youtubePlaylistId と対応する) */
  id: string;
  videoIds: string[];
}

/** playlists.json 全体の構造 */
export interface PlaylistsData {
  /** 最終取得日時(ISO 8601)。一度も取得していなければ null */
  fetchedAt: string | null;
  playlists: PlaylistMembership[];
}

export function createEmptyPlaylistsData(): PlaylistsData {
  return { fetchedAt: null, playlists: [] };
}

/**
 * playlists.json の内容を検証しつつパースする(videos.json の parseVideosData と同じ方針)。
 * 不正データは具体的なメッセージ付きで throw する(呼び出し側でフォールバック)。
 */
export function parsePlaylistsData(data: unknown): PlaylistsData {
  if (typeof data !== "object" || data === null) {
    throw new Error("playlists.json: オブジェクトではありません");
  }
  const { fetchedAt, playlists } = data as { fetchedAt?: unknown; playlists?: unknown };
  if (fetchedAt !== null && typeof fetchedAt !== "string") {
    throw new Error("playlists.json: fetchedAt は string または null である必要があります");
  }
  if (!Array.isArray(playlists)) {
    throw new Error("playlists.json: playlists は配列である必要があります");
  }
  const seenIds = new Set<string>();
  const parsed: PlaylistMembership[] = playlists.map((raw, i) => {
    const item = raw as Partial<Record<keyof PlaylistMembership, unknown>>;
    if (typeof item.id !== "string" || item.id.length === 0) {
      throw new Error(`playlists.json: playlists[${i}].id が不正です`);
    }
    if (seenIds.has(item.id)) {
      throw new Error(`playlists.json: playlists[${i}].id "${item.id}" が重複しています`);
    }
    seenIds.add(item.id);
    if (!Array.isArray(item.videoIds) || item.videoIds.some((v) => typeof v !== "string")) {
      throw new Error(`playlists.json: playlists[${i}].videoIds は文字列配列である必要があります`);
    }
    return { id: item.id, videoIds: item.videoIds as string[] };
  });
  return { fetchedAt: fetchedAt ?? null, playlists: parsed };
}

/** シリーズ判定で使いやすいよう、再生リストID → 所属動画IDの集合へ変換する(#408) */
export function buildPlaylistVideoIdIndex(data: PlaylistsData): Map<string, Set<string>> {
  return new Map(data.playlists.map((playlist) => [playlist.id, new Set(playlist.videoIds)]));
}
