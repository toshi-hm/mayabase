/**
 * 新着動画公開時のWeb Push通知送信(#157)。
 *
 * 呼び出し元: scripts/fetch-videos.ts の main() 末尾(既存の動画データ自動更新フローに連動)。
 * 単体で `bun run` する用途は想定していない(CLIエントリポイントを持たない)。
 *
 * このリポジトリのコードだけでは完結せず、運用者側で以下の手動セットアップが必要:
 * - Cloudflare Workers KV に購読情報を保存するネームスペースを作成する
 *   (`wrangler kv namespace create PUSH_SUBSCRIPTIONS`、id は wrangler.jsonc に設定 / worker/index.ts が書き込む)
 * - VAPID キーペアを生成する(`bunx web-push generate-vapid-keys`)
 *   - 公開鍵: ビルド時に環境変数 `PUBLIC_VAPID_PUBLIC_KEY` としてクライアントへ埋め込む
 *     (PushNotificationController.astro が参照する。.env.example 参照)
 *   - 秘密鍵: このスクリプトが動画データ自動更新ワークフロー(GitHub Actions Secrets)から
 *     `VAPID_PRIVATE_KEY` として参照する(コミットしない)
 * - Workers KV の読み書き権限を持つ Cloudflare API トークンを発行し、
 *   `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_KV_NAMESPACE_ID` を
 *   GitHub Actions の Secrets に設定する(.dev.vars.example 参照)
 *
 * これらが未設定の環境(ローカル開発・フォーク・PRビルド等)では何もせず正常終了する。
 * 動画データ更新フロー自体を止めないため、内部エラーも(呼び出し元へ伝播させず)ここで警告に留める。
 */
import webpush from "web-push";
import { buildNewVideoNotification, type StoredPushSubscription } from "../src/lib/push";
import type { FetchLike, Video } from "../src/lib/youtube";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const KV_LIST_LIMIT = 1000;

interface PushEnvConfig {
  accountId: string;
  apiToken: string;
  namespaceId: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

function readConfig(env: Record<string, string | undefined> = process.env): PushEnvConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID?.trim();
  const vapidPublicKey = env.VAPID_PUBLIC_KEY?.trim();
  const vapidPrivateKey = env.VAPID_PRIVATE_KEY?.trim();
  const vapidSubject = env.VAPID_SUBJECT?.trim();
  if (
    !accountId ||
    !apiToken ||
    !namespaceId ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    return null;
  }
  return { accountId, apiToken, namespaceId, vapidPublicKey, vapidPrivateKey, vapidSubject };
}

function authHeaders(config: PushEnvConfig): HeadersInit {
  return { authorization: `Bearer ${config.apiToken}` };
}

/** KVネームスペース内の全キー名を取得する(1000件ずつページング) */
async function listSubscriptionKeys(config: PushEnvConfig, fetchFn: FetchLike): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(
      `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/keys`,
    );
    url.searchParams.set("limit", String(KV_LIST_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetchFn(url.toString(), { headers: authHeaders(config) });
    if (!res.ok) {
      console.warn(`[send-push-notifications] 購読一覧の取得に失敗しました (HTTP ${res.status})`);
      return keys;
    }
    const data = (await res.json()) as {
      result?: { name: string }[];
      result_info?: { cursor?: string };
    };
    for (const item of data.result ?? []) keys.push(item.name);
    cursor = data.result_info?.cursor || undefined;
  } while (cursor);
  return keys;
}

function kvValueUrl(config: PushEnvConfig, key: string): string {
  return `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${encodeURIComponent(key)}`;
}

async function getSubscription(
  config: PushEnvConfig,
  key: string,
  fetchFn: FetchLike,
): Promise<StoredPushSubscription | null> {
  const res = await fetchFn(kvValueUrl(config, key), { headers: authHeaders(config) });
  if (!res.ok) return null;
  try {
    return JSON.parse(await res.text()) as StoredPushSubscription;
  } catch {
    return null;
  }
}

async function deleteSubscription(
  config: PushEnvConfig,
  key: string,
  fetchFn: FetchLike,
): Promise<void> {
  await fetchFn(kvValueUrl(config, key), { method: "DELETE", headers: authHeaders(config) });
}

/**
 * 新着動画一覧を受け取り、KVに保存された全購読者へWeb Push通知を送信する。
 * 失効した購読(410 Gone / 404 Not Found)はKVから削除する。
 * 必要な環境変数が未設定、または新着動画が無ければ何もしない。
 */
export async function sendNewVideoNotifications(
  newlyPublished: readonly Video[],
  fetchFn: FetchLike = fetch,
): Promise<void> {
  if (newlyPublished.length === 0) return;

  const config = readConfig();
  if (!config) {
    console.log(
      "[send-push-notifications] Push通知に必要な環境変数が未設定のためスキップします(#157 のセットアップ手順を参照)",
    );
    return;
  }

  const notification = buildNewVideoNotification(newlyPublished);
  if (!notification) return;

  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);

  const keys = await listSubscriptionKeys(config, fetchFn);
  if (keys.length === 0) {
    console.log("[send-push-notifications] 購読者がいないため送信をスキップします");
    return;
  }

  let sent = 0;
  let expired = 0;
  let failed = 0;
  for (const key of keys) {
    const subscription = await getSubscription(config, key, fetchFn);
    if (!subscription) continue;

    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify(notification),
      );
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // ブラウザ側で解除済み等、失効した購読は二度と送らないようKVから削除する
        await deleteSubscription(config, key, fetchFn).catch(() => {});
        expired += 1;
      } else {
        failed += 1;
        console.warn(
          "[send-push-notifications] 送信に失敗しました:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
  console.log(
    `[send-push-notifications] 送信完了(成功: ${sent}件、失効削除: ${expired}件、失敗: ${failed}件)`,
  );
}

export { deleteSubscription, getSubscription, listSubscriptionKeys, readConfig };
