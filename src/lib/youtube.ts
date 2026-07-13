import { XMLParser } from "fast-xml-parser";

/** 動画 1 件分のデータ。videos.json に永続化される */
export interface Video {
  /** YouTube video ID */
  id: string;
  title: string;
  /** RSS の media:description(JSON-LD VideoObject の必須プロパティ) */
  description: string;
  /** ISO 8601 */
  publishedAt: string;
  /**
   * Shorts かどうか。null は未判定(横動画として表示し、次回ビルドで再判定する)。
   * 判定は非公式挙動に依存するため、一度確定した値は再判定しない。
   */
  isShort: boolean | null;
}

/** videos.json 全体の構造 */
export interface VideosData {
  channelId: string;
  /** 最終取得日時(ISO 8601)。一度も取得していなければ null */
  fetchedAt: string | null;
  videos: Video[];
}

export function createEmptyVideosData(): VideosData {
  return { channelId: "", fetchedAt: null, videos: [] };
}

/**
 * videos.json の内容を検証しつつパースする。
 * スキーマ不一致は具体的なメッセージ付きで throw する(呼び出し側でフォールバック)。
 */
export function parseVideosData(data: unknown): VideosData {
  if (typeof data !== "object" || data === null) {
    throw new Error("videos.json: オブジェクトではありません");
  }
  const { channelId, fetchedAt, videos } = data as {
    channelId?: unknown;
    fetchedAt?: unknown;
    videos?: unknown;
  };
  if (typeof channelId !== "string") {
    throw new Error("videos.json: channelId は文字列である必要があります");
  }
  if (fetchedAt !== null && typeof fetchedAt !== "string") {
    throw new Error("videos.json: fetchedAt は文字列か null である必要があります");
  }
  if (!Array.isArray(videos)) {
    throw new Error("videos.json: videos は配列である必要があります");
  }
  const parsed: Video[] = videos.map((raw, i) => {
    const v = raw as Partial<Record<keyof Video, unknown>>;
    // 形式検証はインライン属性(onerror)への注入防止も兼ねる
    if (typeof v.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(v.id)) {
      throw new Error(`videos.json: videos[${i}].id が不正です`);
    }
    if (typeof v.title !== "string" || typeof v.description !== "string") {
      throw new Error(`videos.json: videos[${i}] の title / description が不正です`);
    }
    if (typeof v.publishedAt !== "string") {
      throw new Error(`videos.json: videos[${i}].publishedAt が不正です`);
    }
    if (typeof v.isShort !== "boolean" && v.isShort !== null) {
      throw new Error(`videos.json: videos[${i}].isShort は boolean か null である必要があります`);
    }
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      isShort: v.isShort,
    };
  });
  return { channelId, fetchedAt, videos: parsed };
}

/** 動画の視聴 URL(Shorts 判定済みなら shorts URL) */
export function videoUrl(video: Pick<Video, "id" | "isShort">): string {
  return video.isShort
    ? `https://www.youtube.com/shorts/${video.id}`
    : `https://www.youtube.com/watch?v=${video.id}`;
}

/** サムネイル URL(16:9)。hq720 が無い動画があるため UI 側で hqdefault にフォールバックする */
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hq720.jpg`;
}

/** フォールバック用サムネイル URL(4:3 だが全動画に存在する) */
export function thumbnailFallbackUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** 埋め込み URL(JSON-LD VideoObject の embedUrl 用) */
export function embedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

/** RSS フィードから取り出した 1 エントリ(Shorts 判定前) */
export interface FeedEntry {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
}

/**
 * YouTube チャンネル RSS(videos.xml)をパースする。
 * RSS は最新 15 件しか含まない点に注意(呼び出し側で既存データとマージする)。
 */
export function parseFeed(xml: string): FeedEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    // 単一エントリでも配列になるように
    isArray: (name) => name === "entry",
  });
  const doc: unknown = parser.parse(xml);
  const feed = (doc as { feed?: { entry?: unknown[] } }).feed;
  if (!feed?.entry) return [];

  const entries: FeedEntry[] = [];
  for (const raw of feed.entry) {
    const entry = raw as {
      "yt:videoId"?: unknown;
      title?: unknown;
      published?: unknown;
      "media:group"?: { "media:description"?: unknown };
    };
    const id = typeof entry["yt:videoId"] === "string" ? entry["yt:videoId"] : "";
    const title = toText(entry.title);
    const publishedAt = typeof entry.published === "string" ? entry.published : "";
    if (!id || !publishedAt) continue;
    entries.push({
      id,
      title,
      description: toText(entry["media:group"]?.["media:description"]),
      publishedAt,
    });
  }
  return entries;
}

/** XML パース結果のテキストノードを安全に文字列化する(数値のみのタイトル等も考慮) */
function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/**
 * チャンネルの「アップロード動画」プレイリスト ID を導出する。
 * YouTube では channelId(UC...)の接頭辞を UU に置き換えたものが
 * 全アップロードを含むプレイリスト ID になる(公式仕様)。
 * RSS の 15 件上限を超えて全動画を取得するために使う。
 */
export function uploadsPlaylistId(channelId: string): string | null {
  return /^UC[0-9A-Za-z_-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null;
}

/** playlistItems.list 1 ページ分のパース結果 */
export interface PlaylistItemsPage {
  entries: FeedEntry[];
  /** 次ページのトークン。無ければ null(最終ページ) */
  nextPageToken: string | null;
}

/**
 * YouTube Data API v3 `playlistItems.list`(part=snippet,contentDetails)の
 * レスポンス 1 ページ分をパースする。RSS と同じ FeedEntry 形へ正規化する。
 * - videoId は contentDetails.videoId を優先(snippet.resourceId.videoId をフォールバック)
 * - 公開日時は contentDetails.videoPublishedAt を優先(snippet.publishedAt はプレイリスト追加日時のため)
 * - 非公開/削除済みで videoId や公開日時を欠くアイテムはスキップする
 */
export function parsePlaylistItemsPage(data: unknown): PlaylistItemsPage {
  if (typeof data !== "object" || data === null) return { entries: [], nextPageToken: null };
  const root = data as { items?: unknown; nextPageToken?: unknown };
  const nextPageToken = typeof root.nextPageToken === "string" ? root.nextPageToken : null;
  if (!Array.isArray(root.items)) return { entries: [], nextPageToken };

  const entries: FeedEntry[] = [];
  for (const raw of root.items) {
    const item = raw as {
      contentDetails?: { videoId?: unknown; videoPublishedAt?: unknown };
      snippet?: {
        title?: unknown;
        description?: unknown;
        publishedAt?: unknown;
        resourceId?: { videoId?: unknown };
      };
    };
    const content = item.contentDetails ?? {};
    const snippet = item.snippet ?? {};
    const id =
      typeof content.videoId === "string"
        ? content.videoId
        : typeof snippet.resourceId?.videoId === "string"
          ? snippet.resourceId.videoId
          : "";
    const publishedAt =
      typeof content.videoPublishedAt === "string"
        ? content.videoPublishedAt
        : typeof snippet.publishedAt === "string"
          ? snippet.publishedAt
          : "";
    if (!id || !publishedAt) continue;
    entries.push({
      id,
      title: toText(snippet.title),
      description: toText(snippet.description),
      publishedAt,
    });
  }
  return { entries, nextPageToken };
}

/**
 * 既存データと RSS の取得結果をマージする。
 * - RSS に存在する動画: タイトル・説明・公開日時を更新(isShort の確定値は維持)
 * - RSS から溢れた過去動画: そのまま保持(RSS は最新 15 件のみのため)
 * - 公開日時の降順に整列
 */
export function mergeVideos(existing: Video[], fetched: FeedEntry[]): Video[] {
  const byId = new Map<string, Video>(existing.map((v) => [v.id, v]));
  for (const entry of fetched) {
    const prev = byId.get(entry.id);
    byId.set(entry.id, {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      publishedAt: entry.publishedAt,
      isShort: prev ? prev.isShort : null,
    });
  }
  return [...byId.values()].sort((a, b) => sortTime(b) - sortTime(a));
}

/** ソート用の時刻値。不正な日付は最古扱いにして降順リストの末尾へ寄せる(NaN 比較を避ける) */
function sortTime(video: Pick<Video, "publishedAt">): number {
  const time = Date.parse(video.publishedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * チャンネルページの HTML から channelId(externalId)を抽出する。
 * マークアップ変更で壊れ得るため、site.ts の channelId 設定が一次手段(これは補助)。
 */
export function extractChannelId(html: string): string | null {
  const match =
    html.match(/"externalId"\s*:\s*"(UC[0-9A-Za-z_-]{22})"/) ??
    html.match(/channel_id=(UC[0-9A-Za-z_-]{22})/);
  return match ? (match[1] ?? null) : null;
}

/** fetch 互換関数(テストや タイムアウト付きラッパーを注入できるよう最小のシグネチャにする) */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Shorts 判定: https://www.youtube.com/shorts/{id} が 200 なら Shorts、
 * watch への 3xx リダイレクトなら横動画。判定不能なら null。
 * - consent ページ等、watch 以外への 3xx は判定不能として扱う(EU 圏の同意リダイレクト対策)
 * - HEAD 不許可(405 / 501)の場合は GET にフォールバックする
 */
export async function probeIsShort(
  videoId: string,
  fetchFn: FetchLike = fetch,
): Promise<boolean | null> {
  const url = `https://www.youtube.com/shorts/${videoId}`;
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetchFn(url, { method, redirect: "manual" });
      if (res.status === 200) return true;
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location") ?? "";
        return location.includes("/watch") ? false : null;
      }
      // 405 / 501 は GET でリトライ、それ以外の 4xx/5xx は判定不能
      if (method === "GET" || (res.status !== 405 && res.status !== 501)) return null;
    } catch {
      return null;
    }
  }
  return null;
}

/** 並列数を制限しつつ map する(YouTube への同時リクエストを抑える) */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit は 1 以上の整数を指定してください: ${limit}`);
  }
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
