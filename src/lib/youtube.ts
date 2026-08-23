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
  /**
   * 再生回数。YOUTUBE_API_KEY 未設定時(RSSのみ)・取得失敗時は null(#35)。
   * RSS フィードには再生回数が含まれないため、Data API 経路でのみ取得できる。
   */
  viewCount: number | null;
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
  const seenIds = new Set<string>();
  const parsed: Video[] = videos.map((raw, i) => {
    const v = raw as Partial<Record<keyof Video, unknown>>;
    // 形式検証はインライン属性(onerror)への注入防止も兼ねる
    if (typeof v.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(v.id)) {
      throw new Error(`videos.json: videos[${i}].id が不正です`);
    }
    if (seenIds.has(v.id)) {
      throw new Error(`videos.json: videos[${i}].id "${v.id}" が重複しています`);
    }
    seenIds.add(v.id);
    if (typeof v.title !== "string" || typeof v.description !== "string") {
      throw new Error(`videos.json: videos[${i}] の title / description が不正です`);
    }
    if (typeof v.publishedAt !== "string") {
      throw new Error(`videos.json: videos[${i}].publishedAt が不正です`);
    }
    if (typeof v.isShort !== "boolean" && v.isShort !== null) {
      throw new Error(`videos.json: videos[${i}].isShort は boolean か null である必要があります`);
    }
    // 既存データ(#35 導入前)には viewCount フィールド自体が存在しないため、
    // undefined も null と同様に許容する。
    if (v.viewCount !== undefined && v.viewCount !== null && typeof v.viewCount !== "number") {
      throw new Error(`videos.json: videos[${i}].viewCount は数値か null である必要があります`);
    }
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      isShort: v.isShort,
      viewCount: typeof v.viewCount === "number" ? v.viewCount : null,
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

/**
 * 動画詳細ページのプレイヤー用埋め込み URL(#175)。
 * IFrame Player API(onStateChange で再生終了を検知し「次の動画」を提示する)を
 * 有効化するため enablejsapi=1 を付与する。origin は API 側のセキュリティ要件
 * (postMessage の送信元検証)として公式に付与が推奨されているパラメータ。
 * JSON-LD 等には不要なため embedUrl とは別関数にしている。
 */
export function playerEmbedUrl(videoId: string, origin: string): string {
  const url = new URL(embedUrl(videoId));
  url.searchParams.set("enablejsapi", "1");
  url.searchParams.set("origin", origin);
  return url.toString();
}

/** X(Twitter) Player Card / og:video 用のメタ情報(Base.astro に渡す) */
export interface PlayerCardMeta {
  /** 埋め込みプレイヤーの URL(twitter:player / og:video 系に使う) */
  playerUrl: string;
  width: number;
  height: number;
}

/** YouTube 標準の 16:9 埋め込みサイズ(X Player Card / og:video の width・height に使う既定値) */
const PLAYER_CARD_WIDTH = 1280;
const PLAYER_CARD_HEIGHT = 720;

/**
 * 動画個別ページ用の X(Twitter) Player Card / og:video メタ情報を組み立てる(#243)。
 * Shorts(縦動画)は X Player Card が正しく扱えない可能性があるため対象外とし、null を返す
 * (呼び出し側は null なら従来どおり summary_large_image カードにフォールバックする)。
 */
export function buildPlayerCardMeta(video: Pick<Video, "id" | "isShort">): PlayerCardMeta | null {
  if (video.isShort) return null;
  return {
    playerUrl: embedUrl(video.id),
    width: PLAYER_CARD_WIDTH,
    height: PLAYER_CARD_HEIGHT,
  };
}

/** 指定秒数から再生開始する視聴 URL(チャプター一覧のリンク先。#154) */
export function videoUrlAtTime(video: Pick<Video, "id" | "isShort">, seconds: number): string {
  const base = videoUrl(video);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}t=${seconds}s`;
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
    // 全桁数字の動画IDは XML パーサが number 型へ変換するため、title/description と
    // 同様に toText() で文字列化してから扱う(数値化されたまま typeof 判定すると
    // そのエントリがサイレントに読み飛ばされてしまう)。
    const id = toText(entry["yt:videoId"]);
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
 * - 公開日時は contentDetails.videoPublishedAt のみ採用する。snippet.publishedAt は
 *   「プレイリストへの追加日時」であり公開日時ではないため使わない。これを有効性シグナルとし、
 *   非公開・削除済み動画(videoPublishedAt を欠くが resourceId/publishedAt は残る)は確実にスキップする
 * - id 形式が不正なアイテムもスキップ(videos.json → parseVideosData の制約と一致させ、
 *   後段のインライン属性への注入や astro build 時の検証失敗を未然に防ぐ)
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
      typeof content.videoPublishedAt === "string" ? content.videoPublishedAt : "";
    if (!id || !publishedAt || !/^[A-Za-z0-9_-]+$/.test(id)) continue;
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
 * YouTube Data API v3 `videos.list`(part=statistics)のレスポンスから
 * 動画ID→再生回数のマップを取り出す(#35)。統計が非公開・欠損の動画はマップに含めない
 * (呼び出し側で既存値へフォールバックする)。
 */
export function parseVideoStatisticsResponse(data: unknown): Map<string, number> {
  const result = new Map<string, number>();
  if (typeof data !== "object" || data === null) return result;
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return result;
  for (const raw of items) {
    const item = raw as { id?: unknown; statistics?: { viewCount?: unknown } };
    if (typeof item.id !== "string") continue;
    const viewCount = item.statistics?.viewCount;
    if (typeof viewCount === "string" && /^\d+$/.test(viewCount)) {
      result.set(item.id, Number(viewCount));
    }
  }
  return result;
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
      viewCount: prev ? prev.viewCount : null,
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
