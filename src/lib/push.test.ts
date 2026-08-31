import { describe, expect, test } from "bun:test";
import {
  buildNewVideoNotification,
  isValidPushSubscriptionPayload,
  newlyPublishedVideos,
  notificationTargetUrl,
  urlBase64ToUint8Array,
} from "./push";
import type { Video } from "./youtube";

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "abc123DEF45",
    title: "サンプル動画",
    description: "",
    publishedAt: "2026-08-01T00:00:00Z",
    isShort: false,
    viewCount: null,
    duration: null,
    ...overrides,
  };
}

describe("isValidPushSubscriptionPayload", () => {
  test("endpoint(https)とkeys.p256dh/authが揃っていれば true", () => {
    expect(
      isValidPushSubscriptionPayload({
        endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
        keys: { p256dh: "p256dh-value", auth: "auth-value" },
      }),
    ).toBe(true);
  });

  test("主要プッシュサービス(Firefox/Safari/WNSサブドメイン)のendpointは true", () => {
    const keys = { p256dh: "p256dh-value", auth: "auth-value" };
    expect(
      isValidPushSubscriptionPayload({
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/xyz",
        keys,
      }),
    ).toBe(true);
    expect(
      isValidPushSubscriptionPayload({ endpoint: "https://web.push.apple.com/xyz", keys }),
    ).toBe(true);
    expect(
      isValidPushSubscriptionPayload({
        endpoint: "https://xyz.notify.windows.com/w/xyz",
        keys,
      }),
    ).toBe(true);
  });

  test("null・非オブジェクトは false", () => {
    expect(isValidPushSubscriptionPayload(null)).toBe(false);
    expect(isValidPushSubscriptionPayload("not an object")).toBe(false);
    expect(isValidPushSubscriptionPayload(undefined)).toBe(false);
  });

  test("endpointが欠落・空文字・https以外は false", () => {
    const keys = { p256dh: "p256dh-value", auth: "auth-value" };
    expect(isValidPushSubscriptionPayload({ keys })).toBe(false);
    expect(isValidPushSubscriptionPayload({ endpoint: "", keys })).toBe(false);
    expect(isValidPushSubscriptionPayload({ endpoint: "http://insecure.example/", keys })).toBe(
      false,
    );
  });

  test("プッシュサービスの許可リストに無いホストは false(#312)", () => {
    const keys = { p256dh: "p256dh-value", auth: "auth-value" };
    expect(
      isValidPushSubscriptionPayload({ endpoint: "https://attacker.example/collect", keys }),
    ).toBe(false);
    // サフィックス一致の悪用(例: notify.windows.com.attacker.example)も拒否する
    expect(
      isValidPushSubscriptionPayload({
        endpoint: "https://notify.windows.com.attacker.example/",
        keys,
      }),
    ).toBe(false);
  });

  test("endpointがURLとしてパースできない文字列は false", () => {
    const keys = { p256dh: "p256dh-value", auth: "auth-value" };
    expect(isValidPushSubscriptionPayload({ endpoint: "https://", keys })).toBe(false);
  });

  test("keys.p256dh / keys.auth が欠落・空文字は false", () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/xyz";
    expect(isValidPushSubscriptionPayload({ endpoint })).toBe(false);
    expect(isValidPushSubscriptionPayload({ endpoint, keys: { p256dh: "" } })).toBe(false);
    expect(isValidPushSubscriptionPayload({ endpoint, keys: { p256dh: "a", auth: "" } })).toBe(
      false,
    );
  });
});

describe("urlBase64ToUint8Array", () => {
  test("パディング無しのURL-safe Base64を変換する", () => {
    // "hello" の URL-safe Base64(パディング無し) = "aGVsbG8"
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(result)).toEqual(Array.from(new TextEncoder().encode("hello")));
  });

  test("-/_ を含むURL-safe文字を通常のBase64相当として復元する", () => {
    // 0xfb 0xff 0xbf → 標準Base64は "+/+/" 相当、URL-safeでは "-_-_"
    const result = urlBase64ToUint8Array("-_-_");
    expect(Array.from(result)).toEqual([0xfb, 0xff, 0xbf]);
  });
});

describe("newlyPublishedVideos", () => {
  test("previousに無いIDのみをnextの順序のまま抽出する", () => {
    const previous = [makeVideo({ id: "a" }), makeVideo({ id: "b" })];
    const next = [makeVideo({ id: "c" }), makeVideo({ id: "a" }), makeVideo({ id: "b" })];
    expect(newlyPublishedVideos(previous, next).map((v) => v.id)).toEqual(["c"]);
  });

  test("新着が無ければ空配列", () => {
    const previous = [makeVideo({ id: "a" })];
    const next = [makeVideo({ id: "a" })];
    expect(newlyPublishedVideos(previous, next)).toEqual([]);
  });

  test("previousが空なら next 全体が新着扱いになる", () => {
    const next = [makeVideo({ id: "a" }), makeVideo({ id: "b" })];
    expect(newlyPublishedVideos([], next).map((v) => v.id)).toEqual(["a", "b"]);
  });
});

describe("notificationTargetUrl", () => {
  test("ポータルの動画詳細ページURLを組み立てる", () => {
    expect(notificationTargetUrl("abc123")).toBe(
      "https://portal.mayabase.workers.dev/videos/abc123/",
    );
  });
});

describe("buildNewVideoNotification", () => {
  test("0件なら null", () => {
    expect(buildNewVideoNotification([])).toBeNull();
  });

  test("1件なら動画タイトルと動画詳細ページへの直リンクを含む", () => {
    const notification = buildNewVideoNotification([
      makeVideo({ id: "abc123", title: "新しい動画" }),
    ]);
    expect(notification).toEqual({
      title: "新着動画を公開しました",
      body: "新しい動画",
      url: "https://portal.mayabase.workers.dev/videos/abc123/",
    });
  });

  test("複数件なら件数のみ通知し、動画一覧ページへ誘導する", () => {
    const notification = buildNewVideoNotification([
      makeVideo({ id: "a" }),
      makeVideo({ id: "b" }),
    ]);
    expect(notification).toEqual({
      title: "新着動画を公開しました",
      body: "2件の新着動画があります",
      url: "https://portal.mayabase.workers.dev/videos/",
    });
  });
});
