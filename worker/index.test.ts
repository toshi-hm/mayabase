/**
 * worker/index.ts のリクエストハンドラのテスト。
 * とくに「KV バインディング未設定でもデプロイ・静的配信が壊れない」ことを担保する。
 */
import { describe, expect, test } from "bun:test";
import worker from "./index";

interface FakeKv {
  store: Map<string, string>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

function createKv(): FakeKv {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

const assets = {
  async fetch(request: Request): Promise<Response> {
    return new Response(`asset:${new URL(request.url).pathname}`, { status: 200 });
  },
};

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/xyz",
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
};

function postJson(path: string, body: unknown): Request {
  return new Request(`https://portal.mayabase.workers.dev${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("fetch", () => {
  test("/api/push/* 以外は静的アセット配信に委譲する", async () => {
    const response = await worker.fetch(
      new Request("https://portal.mayabase.workers.dev/videos/"),
      { ASSETS: assets },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset:/videos/");
  });

  test("KV未設定でも静的配信は通常どおり動く", async () => {
    const response = await worker.fetch(new Request("https://portal.mayabase.workers.dev/"), {
      ASSETS: assets,
    });
    expect(response.status).toBe(200);
  });

  test("KV未設定なら購読は503を返す(未処理例外による500にしない)", async () => {
    const response = await worker.fetch(postJson("/api/push/subscribe", validSubscription), {
      ASSETS: assets,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "push subscription storage is not configured" });
  });

  test("KV未設定なら解除も503を返す", async () => {
    const response = await worker.fetch(
      postJson("/api/push/unsubscribe", { endpoint: validSubscription.endpoint }),
      { ASSETS: assets },
    );
    expect(response.status).toBe(503);
  });

  test("KV設定済みなら購読情報をKVへ保存する", async () => {
    const kv = createKv();
    const response = await worker.fetch(postJson("/api/push/subscribe", validSubscription), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    expect(response.status).toBe(201);
    expect(kv.store.size).toBe(1);
    const stored = JSON.parse([...kv.store.values()][0] as string);
    expect(stored.endpoint).toBe(validSubscription.endpoint);
    expect(stored.keys).toEqual(validSubscription.keys);
  });

  test("KV設定済みなら解除でKVから削除する", async () => {
    const kv = createKv();
    await worker.fetch(postJson("/api/push/subscribe", validSubscription), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    const response = await worker.fetch(
      postJson("/api/push/unsubscribe", { endpoint: validSubscription.endpoint }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(response.status).toBe(200);
    expect(kv.store.size).toBe(0);
  });

  test("不正なペイロードは400(KV設定済みの場合)", async () => {
    const kv = createKv();
    const response = await worker.fetch(postJson("/api/push/subscribe", { endpoint: 123 }), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    expect(response.status).toBe(400);
    expect(kv.store.size).toBe(0);
  });
});
