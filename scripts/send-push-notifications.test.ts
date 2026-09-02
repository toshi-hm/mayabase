import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import type { Video } from "../src/lib/youtube";
import {
  main,
  PENDING_NOTIFICATIONS_PATH,
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

  test("通知待ちファイルがあれば読み込んで送信を試み、成否によらずファイルを片付ける(#323)", async () => {
    // Cloudflare/VAPID の Secrets が未設定のテスト環境では sendNewVideoNotifications は
    // 実ネットワークアクセスをせずに早期リターンする(readConfig が null を返す)ため、
    // ここでは「ファイルが確実に消費・削除される」ことのみを検証する。
    await Bun.write(PENDING_NOTIFICATIONS_PATH, JSON.stringify([sampleVideo]));
    await main();
    expect(await Bun.file(PENDING_NOTIFICATIONS_PATH).exists()).toBe(false);
  });
});
