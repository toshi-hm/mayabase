import type { Video } from "./youtube";

/**
 * 本番サイトのオリジン(astro.config.mjs の SITE_URL と同一値)。
 * 通知クリック時の遷移先URLを組み立てるために、ビルド成果物に依存せずここでも保持する。
 */
export const PORTAL_ORIGIN = "https://portal.mayabase.workers.dev";

/** ブラウザの PushSubscription.toJSON() が返す keys 部分 */
export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

/** クライアントから /api/push/subscribe へ送られる購読情報 */
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

/** Cloudflare Workers KV に永続化する購読レコード(購読日時を付与したもの) */
export interface StoredPushSubscription extends PushSubscriptionPayload {
  subscribedAt: string;
}

/** 新着動画1件分の通知内容 */
export interface NewVideoNotification {
  /** 同一通知の再試行時にService Workerで表示を置き換えるための安定したID */
  id: string;
  title: string;
  body: string;
  url: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** 公開APIから受け入れるWeb Push値の上限。異常に大きなKVレコードの保存を防ぐ。 */
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;
export const PUSH_KEY_MAX_LENGTH = 256;

/**
 * Web Push の endpoint として正当な主要プッシュサービスのホスト名(完全一致)。
 * ここに無いホストは拒否する(#312。認証・レート制限の無い /api/push/subscribe に
 * 任意のURLを endpoint として登録され、CIから第三者サーバーへリクエストが送られる経路を塞ぐ)。
 */
const ALLOWED_PUSH_ENDPOINT_HOSTS = new Set([
  // Chrome / Edge / Android(Firebase Cloud Messaging)
  "fcm.googleapis.com",
  "android.googleapis.com",
  // Firefox
  "updates.push.services.mozilla.com",
  // Safari / iOS / macOS
  "web.push.apple.com",
]);

/** サブドメイン込みで許可するホストのサフィックス(Windows/Edge の WNS 等、インスタンスごとに変わるもの) */
const ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES = [".notify.windows.com"];

function isAllowedPushEndpointHost(hostname: string): boolean {
  if (ALLOWED_PUSH_ENDPOINT_HOSTS.has(hostname)) return true;
  return ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

/**
 * クライアントから届いた購読情報(PushSubscription.toJSON() 相当)の形式を検証する。
 * worker/index.ts の /api/push/subscribe から、リクエストボディの妥当性チェックに使う。
 */
export function isValidPushSubscriptionPayload(value: unknown): value is PushSubscriptionPayload {
  if (typeof value !== "object" || value === null) return false;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: unknown };
  if (!isNonEmptyString(endpoint) || endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) return false;
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return false;
  }
  if (endpointUrl.protocol !== "https:" || !isAllowedPushEndpointHost(endpointUrl.hostname)) {
    return false;
  }
  if (typeof keys !== "object" || keys === null) return false;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  return (
    isNonEmptyString(p256dh) &&
    p256dh.length <= PUSH_KEY_MAX_LENGTH &&
    isNonEmptyString(auth) &&
    auth.length <= PUSH_KEY_MAX_LENGTH
  );
}

/**
 * VAPID公開鍵(URL-safe Base64文字列)を、pushManager.subscribe() の
 * applicationServerKey が要求する Uint8Array 形式に変換する。
 * PushNotificationController.astro のクライアントスクリプトから使う。
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = `${base64}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * 直前の取得結果(previous)には無く、今回の取得結果(next)にのみ存在する動画を、
 * next の並び順を保ったまま抽出する(＝新規公開された動画)。
 *
 * `publishedSince` を渡した場合、`publishedAt` がそれより前の動画は除外する。
 * YOUTUBE_API_KEY を新規設定した際、RSS(最新15件)のみで運用していた previous には
 * 存在しなかった過去動画が一気に merged 側へ取り込まれ、実際には数か月/数年前に
 * 公開済みの動画が「新着」として誤検知・誤通知されるのを防ぐため(#404)。
 */
export function newlyPublishedVideos(
  previous: readonly Video[],
  next: readonly Video[],
  publishedSince?: string | null,
): Video[] {
  const previousIds = new Set(previous.map((video) => video.id));
  return next.filter((video) => {
    if (previousIds.has(video.id)) return false;
    if (publishedSince && video.publishedAt < publishedSince) return false;
    return true;
  });
}

/** 通知クリック時の遷移先(ポータル内の動画詳細ページ) */
export function notificationTargetUrl(videoId: string): string {
  return `${PORTAL_ORIGIN}/videos/${videoId}/`;
}

/**
 * 新着動画一覧からプッシュ通知の内容を組み立てる。
 * 1件のみなら動画タイトル・動画詳細ページへの直接リンク、複数件ならまとめて件数のみ通知する
 * (通知の乱発を避けるため)。0件なら null(呼び出し側で送信をスキップする)。
 */
export function buildNewVideoNotification(videos: readonly Video[]): NewVideoNotification | null {
  if (videos.length === 0) return null;
  const [first] = videos;
  if (videos.length === 1 && first) {
    return {
      id: `new-video:${first.id}`,
      title: "新着動画を公開しました",
      body: first.title,
      url: notificationTargetUrl(first.id),
    };
  }
  return {
    id: `new-videos:${videos.map((video) => video.id).join(",")}`,
    title: "新着動画を公開しました",
    body: `${videos.length}件の新着動画があります`,
    url: `${PORTAL_ORIGIN}/videos/`,
  };
}
