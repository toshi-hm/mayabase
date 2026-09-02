/**
 * 新着動画公開時のWeb Push通知送信(#157)。
 *
 * 呼び出し元: `.github/workflows/update-videos.yml` の「変更があればコミット」ステップ成功後に
 * 実行される専用ステップ(`bun run notify:new-videos`、下部の `import.meta.main` ブロック参照)。
 *
 * 通知対象は scripts/fetch-videos.ts が書き出す PENDING_NOTIFICATIONS_PATH のファイル経由で
 * 受け取る(#323)。以前は fetch-videos.ts の main() 末尾で検証・コミットより前に直接送信して
 * いたが、検証失敗でコミット・pushされなかった場合にも通知だけが届いてしまう不整合があった
 * ため、送信はコミット成功後の別ステップに切り離した。
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
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { buildNewVideoNotification, type StoredPushSubscription } from "../src/lib/push";
import type { FetchLike, Video } from "../src/lib/youtube";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const KV_LIST_LIMIT = 1000;

/**
 * scripts/fetch-videos.ts が新着動画一覧を書き出す一時ファイル(#323)。
 * リポジトリにはコミットしない(.gitignore 参照)、同一ワークフロージョブ内でのみ
 * ステップ間の受け渡しに使う揮発的なファイル。
 */
export const PENDING_NOTIFICATIONS_PATH = fileURLToPath(
  new URL("../.push-notifications-pending.json", import.meta.url),
);

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

/**
 * PENDING_NOTIFICATIONS_PATH から新着動画一覧を読み込む。
 * ファイルが存在しない場合(前段のfetchで新着動画が無かった場合)は空配列を返す。
 */
export async function readPendingNotifications(): Promise<Video[]> {
  let raw: string;
  try {
    raw = await readFile(PENDING_NOTIFICATIONS_PATH, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return JSON.parse(raw) as Video[];
}

export async function main(): Promise<void> {
  const pending = await readPendingNotifications();
  if (pending.length === 0) {
    console.log("[send-push-notifications] 通知待ちの新着動画はありません");
    return;
  }
  try {
    await sendNewVideoNotifications(pending);
  } finally {
    // 送信の成否によらず、一度読み込んだ通知待ちファイルは片付ける
    // (次回実行時に古い新着動画が再送されるのを防ぐ)。
    await rm(PENDING_NOTIFICATIONS_PATH, { force: true });
  }
}

// import.meta.main は直接実行時(bun run scripts/send-push-notifications.ts)のみ true になり、
// テストからの import 時は false になる(Bun の仕様。fetch-videos.ts と同じ方針)。
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    // ワークフロー自体は既にコミット・push済みのため、通知送信の失敗でジョブを失敗させない。
    console.warn("[send-push-notifications] 通知送信処理でエラーが発生しました:", error);
  }
}

export { deleteSubscription, getSubscription, listSubscriptionKeys, readConfig };
