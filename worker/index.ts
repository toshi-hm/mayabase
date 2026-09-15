/**
 * このリポジトリはもともと完全静的サイト(Cloudflare Workers の Assets 配信のみ)だったが、
 * 新着動画プッシュ通知(#157)の購読情報を永続化するため、最小限の Worker スクリプトを追加した。
 * `/api/push/*` 以外の全リクエストは、これまで通り `env.ASSETS`(静的アセット配信)に委譲する。
 *
 * 実際の通知送信(Web Push の送信そのもの)はここでは行わない。動画データ自動更新ワークフロー
 * (.github/workflows/update-videos.yml → scripts/fetch-videos.ts → scripts/send-push-notifications.ts)
 * が、この Worker が書き込んだ購読情報を Cloudflare API 経由で読み出して送信する。
 *
 * デプロイ前提条件(README/PR説明を参照。手動セットアップが必要):
 * - `wrangler kv namespace create PUSH_SUBSCRIPTIONS` で作成した KV の **実在する id** を
 *   wrangler.jsonc の kv_namespaces に設定すること
 *
 * この手動セットアップが未実施の環境では KV バインディング自体が存在しない。その場合でも
 * 静的配信は通常どおり行い、/api/push/* だけが 503 を返す(リポジトリ内の他の連携と同様、
 * 未設定なら機能だけが無効になる方針。scripts/send-push-notifications.ts / .env.example 参照)。
 */
import { isValidPushSubscriptionPayload, type StoredPushSubscription } from "../src/lib/push";

/** Cloudflare Workers KV バインディングの必要最小限の型(@cloudflare/workers-types は導入しない) */
interface PushSubscriptionsKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const REACTION_VISITOR_COOKIE = "MAYABASE_VISITOR_ID";
const REACTION_VISITOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REACTION_VISITOR_MARKER_TTL_SECONDS = 365 * 24 * 60 * 60;
const REACTION_RATE_LIMIT_WINDOW_MS = 60_000;
const REACTION_RATE_LIMIT_MAX = 30;
const REACTION_READ_RATE_LIMIT_MAX = 120;
const REACTION_RATE_LIMIT_MAX_ENTRIES = 1_000;
const reactionRateLimitEntries = new Map<string, { startedAt: number; count: number }>();

interface ReactionRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  /** wrangler.jsonc の assets.binding。マッチしないリクエストの静的配信に使う */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /**
   * wrangler.jsonc の kv_namespaces[].binding。購読情報の保存先。
   * KV を未セットアップの環境ではバインディングが存在しないため optional にしている。
   */
  PUSH_SUBSCRIPTIONS?: PushSubscriptionsKv;
  /** 動画リアクション書き込み用の共有Rate Limiting binding。 */
  REACTION_RATE_LIMITER?: ReactionRateLimiter;
  /** 動画リアクション読み取り用の共有Rate Limiting binding。 */
  REACTION_READ_RATE_LIMITER?: ReactionRateLimiter;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function reactionVisitorFromRequest(request: Request): { id: string; shouldSetCookie: boolean } {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${REACTION_VISITOR_COOKIE}=`));
  const value = cookie?.slice(REACTION_VISITOR_COOKIE.length + 1) ?? "";
  if (REACTION_VISITOR_ID_PATTERN.test(value)) {
    return { id: value, shouldSetCookie: false };
  }
  return { id: crypto.randomUUID(), shouldSetCookie: true };
}

function withReactionVisitorCookie(
  response: Response,
  visitorId: string,
  shouldSetCookie: boolean,
): Response {
  if (shouldSetCookie) {
    response.headers.set(
      "set-cookie",
      `${REACTION_VISITOR_COOKIE}=${visitorId}; Max-Age=${REACTION_VISITOR_MARKER_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    );
  }
  return response;
}

type ReactionMarker = {
  status: "pending" | "committed";
  targetCount?: number;
};

function parseReactionMarker(value: string | null): ReactionMarker | null {
  if (value === null) return null;
  if (value === "1") return { status: "committed" };
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return { status: "committed" };
    const marker = parsed as { status?: unknown; targetCount?: unknown };
    if (marker.status === "pending" && Number.isSafeInteger(marker.targetCount)) {
      return { status: "pending", targetCount: marker.targetCount as number };
    }
    if (marker.status === "committed") return { status: "committed" };
  } catch {
    // 不正な既存マーカーは再加算を避けるため、完了済みとして扱う。
  }
  return { status: "committed" };
}

const REACTION_BODY_MAX_BYTES = 8 * 1024;

async function readJsonBody(
  request: Request,
  maxBytes = REACTION_BODY_MAX_BYTES,
): Promise<unknown> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

/** endpoint(購読ごとに一意なURL)から、KVのキーとして使う固定長ハッシュを導出する */
async function subscriptionKey(endpoint: string): Promise<string> {
  return sha256Hex(endpoint);
}

/** KV 未設定の環境で undefined へのアクセスによる 500 を避け、意図の伝わる 503 を返す */
function storageUnavailableResponse(): Response {
  return jsonResponse({ error: "push subscription storage is not configured" }, 503);
}

/**
 * KV操作(put/delete)自体が失敗した場合(一時的なKV障害・値サイズ超過等)に、
 * 未処理例外による(非JSONの)汎用エラーページ応答を避け、意図の伝わる 502 JSONを返す(#359)。
 */
function storageOperationFailedResponse(): Response {
  return jsonResponse({ error: "push subscription storage operation failed" }, 502);
}

function reactionClientKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
}

function isFallbackReactionRateLimited(request: Request): boolean {
  const now = Date.now();
  for (const [key, entry] of reactionRateLimitEntries) {
    if (now - entry.startedAt >= REACTION_RATE_LIMIT_WINDOW_MS) {
      reactionRateLimitEntries.delete(key);
    }
  }
  if (reactionRateLimitEntries.size >= REACTION_RATE_LIMIT_MAX_ENTRIES) {
    const oldestKey = reactionRateLimitEntries.keys().next().value;
    if (oldestKey) reactionRateLimitEntries.delete(oldestKey);
  }

  const key = `${request.method}:${reactionClientKey(request)}`;
  const current = reactionRateLimitEntries.get(key);
  if (!current || now - current.startedAt >= REACTION_RATE_LIMIT_WINDOW_MS) {
    reactionRateLimitEntries.set(key, { startedAt: now, count: 1 });
    return false;
  }
  const maxRequests =
    request.method === "GET" ? REACTION_READ_RATE_LIMIT_MAX : REACTION_RATE_LIMIT_MAX;
  if (current.count >= maxRequests) return true;
  current.count += 1;
  return false;
}

async function isReactionRateLimited(request: Request, env: Env): Promise<boolean> {
  const limiter =
    request.method === "GET" ? env.REACTION_READ_RATE_LIMITER : env.REACTION_RATE_LIMITER;
  if (limiter) {
    try {
      const result = await limiter.limit({ key: reactionClientKey(request) });
      return !result.success;
    } catch {
      return isFallbackReactionRateLimited(request);
    }
  }
  return isFallbackReactionRateLimited(request);
}

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  const kv = env.PUSH_SUBSCRIPTIONS;
  if (!kv) return storageUnavailableResponse();

  const payload = await readJsonBody(request);
  if (!isValidPushSubscriptionPayload(payload)) {
    return jsonResponse({ error: "invalid subscription payload" }, 400);
  }

  const record: StoredPushSubscription = {
    endpoint: payload.endpoint,
    keys: payload.keys,
    subscribedAt: new Date().toISOString(),
  };
  const key = await subscriptionKey(payload.endpoint);
  try {
    await kv.put(key, JSON.stringify(record));
  } catch {
    return storageOperationFailedResponse();
  }
  return jsonResponse({ ok: true }, 201);
}

async function handleVideoReaction(request: Request, env: Env): Promise<Response> {
  const kv = env.PUSH_SUBSCRIPTIONS;
  if (!kv) return storageUnavailableResponse();
  const payload = request.method === "GET" ? undefined : await readJsonBody(request);
  const videoId =
    request.method === "GET"
      ? new URL(request.url).searchParams.get("videoId")
      : typeof payload === "object" && payload !== null
        ? (payload as { videoId?: unknown }).videoId
        : undefined;
  if (typeof videoId !== "string" || !VIDEO_ID_PATTERN.test(videoId)) {
    return jsonResponse({ error: "invalid video id" }, 400);
  }
  if (await isReactionRateLimited(request, env)) {
    return jsonResponse({ error: "rate limit exceeded" }, 429);
  }
  const key = `reaction:${videoId}`;
  const visitor = request.method === "POST" ? reactionVisitorFromRequest(request) : null;
  const visitorKey = visitor ? `${key}:visitor:${visitor.id}` : null;
  try {
    if (request.method === "POST" && visitor && visitorKey) {
      const marker = parseReactionMarker(await kv.get(visitorKey));
      if (marker?.status === "committed") {
        const current = await kv.get(key);
        const count = current === null ? 0 : Number.parseInt(current, 10);
        return withReactionVisitorCookie(
          jsonResponse({
            count: Number.isSafeInteger(count) && count >= 0 ? count : 0,
            duplicate: true,
          }),
          visitor.id,
          visitor.shouldSetCookie,
        );
      }

      const current = await kv.get(key);
      const currentCount =
        current !== null && Number.isSafeInteger(Number.parseInt(current, 10))
          ? Math.max(0, Number.parseInt(current, 10))
          : 0;
      const targetCount =
        marker?.status === "pending" && marker.targetCount !== undefined
          ? Math.max(marker.targetCount, currentCount)
          : currentCount + 1;

      // pendingを先に保存しておくことで、集計更新後のcommitted保存に失敗しても、
      // 同じCookieの再送でtargetCountまで復旧できる(#433)。
      await kv.put(visitorKey, JSON.stringify({ status: "pending", targetCount }), {
        expirationTtl: REACTION_VISITOR_MARKER_TTL_SECONDS,
      });
      if (targetCount > currentCount) {
        await kv.put(key, String(targetCount), {
          expirationTtl: REACTION_VISITOR_MARKER_TTL_SECONDS,
        });
      }
      await kv.put(visitorKey, JSON.stringify({ status: "committed" }), {
        expirationTtl: REACTION_VISITOR_MARKER_TTL_SECONDS,
      });
      return withReactionVisitorCookie(
        jsonResponse({ count: targetCount }),
        visitor.id,
        visitor.shouldSetCookie,
      );
    }

    const current = await kv.get(key);
    const count = current === null ? 0 : Number.parseInt(current, 10);
    if (request.method === "GET") {
      return jsonResponse({
        count: Number.isSafeInteger(count) && count >= 0 ? count : 0,
      });
    }
    return withReactionVisitorCookie(
      jsonResponse({ count: Number.isSafeInteger(count) && count >= 0 ? count : 0 }),
      visitor?.id ?? "",
      visitor?.shouldSetCookie ?? false,
    );
  } catch {
    return withReactionVisitorCookie(
      storageOperationFailedResponse(),
      visitor?.id ?? "",
      visitor?.shouldSetCookie ?? false,
    );
  }
}

async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  const kv = env.PUSH_SUBSCRIPTIONS;
  if (!kv) return storageUnavailableResponse();

  const payload = await readJsonBody(request);
  const endpoint =
    typeof payload === "object" && payload !== null
      ? (payload as { endpoint?: unknown }).endpoint
      : undefined;
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return jsonResponse({ error: "invalid endpoint" }, 400);
  }

  const key = await subscriptionKey(endpoint);
  try {
    await kv.delete(key);
  } catch {
    return storageOperationFailedResponse();
  }
  return jsonResponse({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/push/subscribe") {
      return handleSubscribe(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/push/unsubscribe") {
      return handleUnsubscribe(request, env);
    }
    if (
      (request.method === "GET" || request.method === "POST") &&
      url.pathname === "/api/video-reaction"
    ) {
      return handleVideoReaction(request, env);
    }

    // /api/push/* 以外は従来通り静的アセット配信に委譲する(挙動は変えない)
    return env.ASSETS.fetch(request);
  },
};
