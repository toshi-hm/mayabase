import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import type { Video } from "../src/lib/youtube";
import {
  getSubscription,
  listSubscriptionKeys,
  main,
  PENDING_NOTIFICATIONS_PATH,
  readConfig,
  readPendingNotifications,
} from "./send-push-notifications";

const sampleVideo: Video = {
  id: "AAAAAAAAAAA",
  title: "新着動画",
  description: "説明",
  publishedAt: "2026-08-01T00:00:00Z",
  isShort: null,
  hasHqThumbnail: null,
  viewCount: null,
  duration: null,
};

afterEach(async () => {
  // このリポジトリにコミットされないファイルのため、退避/復元ではなく確実な削除で後片付けする
  await rm(PENDING_NOTIFICATIONS_PATH, { force: true });
});

describe("readPendingNotifications", () => {
  test("ファイルが存在しない場合は空配列を返す(前段のfetchで新着動画が無かった場合)", async () => {
    expect(await Bun.file(PENDING_NOTIFICATIONS_PATH).exists()).toBe(false);
    expect(await readPendingNotifications()).toEqual([]);
  });

  test("ファイルが存在する場合は中身をパースして返す", async () => {
    await Bun.write(PENDING_NOTIFICATIONS_PATH, JSON.stringify([sampleVideo]));
    const pending = await readPendingNotifications();
    expect(pending).toEqual([sampleVideo]);
  });
});

describe("main", () => {
  test("通知待ちファイルが無ければ何もせず正常終了する", async () => {
    expect(await Bun.file(PENDING_NOTIFICATIONS_PATH).exists()).toBe(false);
    const result = await main();
    expect(result).toBeUndefined();
  });

  test("通知送信に成功した場合は通知待ちファイルを片付ける(#323)", async () => {
    // Cloudflare/VAPID の Secrets が未設定のテスト環境では sendNewVideoNotifications は
    // 実ネットワークアクセスをせずに早期リターンする(readConfig が null を返す)ため、
    // ここでは「ファイルが確実に消費・削除される」ことのみを検証する。
    await Bun.write(PENDING_NOTIFICATIONS_PATH, JSON.stringify([sampleVideo]));
    await main(async () => undefined);
    expect(await Bun.file(PENDING_NOTIFICATIONS_PATH).exists()).toBe(false);
  });

  test("通知送信に失敗した場合は通知待ちファイルを残して次回実行で再試行できる(#402)", async () => {
    await Bun.write(PENDING_NOTIFICATIONS_PATH, JSON.stringify([sampleVideo]));

    await main(async () => {
      throw new Error("Cloudflare API timeout");
    });

    expect(await Bun.file(PENDING_NOTIFICATIONS_PATH).exists()).toBe(true);
    expect(await readPendingNotifications()).toEqual([sampleVideo]);

    await main(async (pending) => {
      expect(pending).toEqual([sampleVideo]);
      return true;
    });
    expect(await Bun.file(PENDING_NOTIFICATIONS_PATH).exists()).toBe(false);
  });

  test("通知待ちファイルが破損している場合は削除せず失敗として扱う(#402)", async () => {
    await Bun.write(PENDING_NOTIFICATIONS_PATH, "{ broken");

    await main();

    expect(await Bun.file(PENDING_NOTIFICATIONS_PATH).exists()).toBe(true);
  });
});

describe("Cloudflare KV error handling", () => {
  const config = readConfig({
    CLOUDFLARE_ACCOUNT_ID: "account",
    CLOUDFLARE_API_TOKEN: "token",
    CLOUDFLARE_KV_NAMESPACE_ID: "namespace",
    VAPID_PUBLIC_KEY: "public",
    VAPID_PRIVATE_KEY: "private",
    VAPID_SUBJECT: "mailto:test@example.com",
  });

  test("購読一覧のHTTPエラーを空配列として扱わず失敗させる(#402)", async () => {
    if (!config) throw new Error("テスト用設定の生成に失敗しました");
    await expect(
      listSubscriptionKeys(config, async () => new Response(null, { status: 503 })),
    ).rejects.toThrow("HTTP 503");
  });

  test("一時的な購読一覧エラーは再試行して復旧する(#402)", async () => {
    if (!config) throw new Error("テスト用設定の生成に失敗しました");
    let attempts = 0;
    const result = await listSubscriptionKeys(config, async () => {
      attempts += 1;
      if (attempts < 3) return new Response(null, { status: 503 });
      return new Response(JSON.stringify({ success: true, result: [{ name: "subscription" }] }));
    });
    expect(attempts).toBe(3);
    expect(result).toEqual(["subscription"]);
  });

  test("購読情報のHTTPエラーを空データとして扱わず失敗させる(#402)", async () => {
    if (!config) throw new Error("テスト用設定の生成に失敗しました");
    await expect(
      getSubscription(config, "subscription", async () => new Response(null, { status: 500 })),
    ).rejects.toThrow("HTTP 500");
  });

  test("リアクション等の不正なKV値を購読情報として送信対象にしない(#402)", async () => {
    if (!config) throw new Error("テスト用設定の生成に失敗しました");
    const result = await getSubscription(
      config,
      "reaction:video",
      async () => new Response("1", { status: 200 }),
    );
    expect(result).toBeNull();
  });
});
