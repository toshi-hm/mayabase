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
import {
  isValidPushSubscriptionPayload,
  PUSH_ENDPOINT_MAX_LENGTH,
  type StoredPushSubscription,
} from "../src/lib/push";

/** Cloudflare Workers KV バインディングの必要最小限の型(@cloudflare/workers-types は導入しない) */
interface PushSubscriptionsKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  /** wrangler.jsonc の assets.binding。マッチしないリクエストの静的配信に使う */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /**
   * wrangler.jsonc の kv_namespaces[].binding。購読情報の保存先。
   * KV を未セットアップの環境ではバインディングが存在しないため optional にしている。
   */
  PUSH_SUBSCRIPTIONS?: PushSubscriptionsKv;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const REQUEST_BODY_MAX_BYTES = 8 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const SUBSCRIPTION_TTL_SECONDS = 90 * 24 * 60 * 60;
const RATE_LIMIT_MAX_ENTRIES = 1_000;

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

// Workersインスタンス単位の簡易制限。厳密な全体制限はCloudflare Rate Limiting bindingで補完する。
const rateLimitEntries = new Map<string, RateLimitEntry>();

function clientRateLimitKey(request: Request): string {
  const trustedIp = request.headers.get("CF-Connecting-IP");
  if (trustedIp) return trustedIp;
  const forwardedIp = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwardedIp || "unknown";
}

function isRateLimited(request: Request, now = Date.now()): boolean {
  for (const [key, entry] of rateLimitEntries) {
    if (now - entry.windowStartedAt >= RATE_LIMIT_WINDOW_MS) rateLimitEntries.delete(key);
  }
  if (rateLimitEntries.size >= RATE_LIMIT_MAX_ENTRIES) {
    const oldestKey = rateLimitEntries.keys().next().value;
    if (oldestKey) rateLimitEntries.delete(oldestKey);
  }
  const key = clientRateLimitKey(request);
  const current = rateLimitEntries.get(key);
  if (!current || now - current.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitEntries.set(key, { count: 1, windowStartedAt: now });
    return false;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return true;
  current.count += 1;
  return false;
}

function rateLimitedResponse(): Response {
  return new Response(JSON.stringify({ error: "too many requests" }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "retry-after": "60",
    },
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > REQUEST_BODY_MAX_BYTES) return undefined;
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
      if (totalBytes > REQUEST_BODY_MAX_BYTES) {
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

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
  const kv = env.PUSH_SUBSCRIPTIONS;
  if (!kv) return storageUnavailableResponse();

  if (isRateLimited(request)) return rateLimitedResponse();

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
    await kv.put(key, JSON.stringify(record), { expirationTtl: SUBSCRIPTION_TTL_SECONDS });
  } catch {
    return storageOperationFailedResponse();
  }
  return jsonResponse({ ok: true }, 201);
}

async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  const kv = env.PUSH_SUBSCRIPTIONS;
  if (!kv) return storageUnavailableResponse();

  if (isRateLimited(request)) return rateLimitedResponse();

  const payload = await readJsonBody(request);
  const endpoint =
    typeof payload === "object" && payload !== null
      ? (payload as { endpoint?: unknown }).endpoint
      : undefined;
  if (
    typeof endpoint !== "string" ||
    endpoint.length === 0 ||
    endpoint.length > PUSH_ENDPOINT_MAX_LENGTH
  ) {
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

    // /api/push/* 以外は従来通り静的アセット配信に委譲する(挙動は変えない)
    return env.ASSETS.fetch(request);
  },
};
