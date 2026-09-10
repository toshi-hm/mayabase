/**
 * worker/index.ts のリクエストハンドラのテスト。
 * とくに「KV バインディング未設定でもデプロイ・静的配信が壊れない」ことを担保する。
 */
import { describe, expect, test } from "bun:test";
import worker from "./index";

interface FakeKv {
  store: Map<string, string>;
  options: Map<string, { expirationTtl?: number }>;
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

function createKv(): FakeKv {
  const store = new Map<string, string>();
  const options = new Map<string, { expirationTtl?: number }>();
  return {
    store,
    options,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value, putOptions) {
      store.set(key, value);
      if (putOptions) options.set(key, putOptions);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

const assets = {
  async fetch(request: Request): Promise<Response> {
    return new Response(`asset:${new URL(request.url).pathname}`, {
      status: 200,
    });
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
    const response = await worker.fetch(
      new Request("https://portal.mayabase.workers.dev/"),
      {
        ASSETS: assets,
      },
    );
    expect(response.status).toBe(200);
  });

  test("KV未設定なら購読は503を返す(未処理例外による500にしない)", async () => {
    const response = await worker.fetch(
      postJson("/api/push/subscribe", validSubscription),
      {
        ASSETS: assets,
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "push subscription storage is not configured",
    });
  });

  test("KV未設定なら解除も503を返す", async () => {
    const response = await worker.fetch(
      postJson("/api/push/unsubscribe", {
        endpoint: validSubscription.endpoint,
      }),
      { ASSETS: assets },
    );
    expect(response.status).toBe(503);
  });

  test("KV設定済みなら購読情報をKVへ保存する", async () => {
    const kv = createKv();
    const response = await worker.fetch(
      postJson("/api/push/subscribe", validSubscription),
      {
        ASSETS: assets,
        PUSH_SUBSCRIPTIONS: kv,
      },
    );
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
      postJson("/api/push/unsubscribe", {
        endpoint: validSubscription.endpoint,
      }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(response.status).toBe(200);
    expect(kv.store.size).toBe(0);
  });

  test("不正なペイロードは400(KV設定済みの場合)", async () => {
    const kv = createKv();
    const response = await worker.fetch(
      postJson("/api/push/subscribe", { endpoint: 123 }),
      {
        ASSETS: assets,
        PUSH_SUBSCRIPTIONS: kv,
      },
    );
    expect(response.status).toBe(400);
    expect(kv.store.size).toBe(0);
  });

  test("動画リアクションをKVで加算する", async () => {
    const kv = createKv();
    const request = () =>
      new Request("https://portal.mayabase.workers.dev/api/video-reaction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: "abc123" }),
      });
    const first = await worker.fetch(request(), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    const second = await worker.fetch(request(), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    expect(await first.json()).toEqual({ count: 1 });
    expect(await second.json()).toEqual({ count: 2 });
    expect(kv.options.get("reaction:abc123")).toEqual({
      expirationTtl: 365 * 24 * 60 * 60,
    });
  });

  test("保存済みリアクション件数をGETで取得する", async () => {
    const kv = createKv();
    const request = postJson("/api/video-reaction", { videoId: "get-test" });
    request.headers.set("CF-Connecting-IP", "198.51.100.34");
    const postResponse = await worker.fetch(request, {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    expect(postResponse.status).toBe(200);

    const response = await worker.fetch(
      new Request(
        "https://portal.mayabase.workers.dev/api/video-reaction?videoId=get-test",
        {
          headers: { "CF-Connecting-IP": "198.51.100.34" },
        },
      ),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 1 });
  });

  test("大きすぎるリアクション本文は400で拒否する", async () => {
    const kv = createKv();
    const response = await worker.fetch(
      new Request("https://portal.mayabase.workers.dev/api/video-reaction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoId: "large-body",
          padding: "x".repeat(9_000),
        }),
      }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(response.status).toBe(400);
    expect(kv.store.has("reaction:large-body")).toBe(false);
  });

  test("不正な動画IDのリアクションは400", async () => {
    const kv = createKv();
    const response = await worker.fetch(
      postJson("/api/video-reaction", { videoId: "../secrets" }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(response.status).toBe(400);
  });

  test("KV書き込みが例外を投げた場合は502(未処理例外による非JSON応答にしない、#359)", async () => {
    const kv = createKv();
    kv.put = async () => {
      throw new Error("KV put failed");
    };
    const response = await worker.fetch(
      postJson("/api/push/subscribe", validSubscription),
      {
        ASSETS: assets,
        PUSH_SUBSCRIPTIONS: kv,
      },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "push subscription storage operation failed",
    });
  });

  test("KV削除が例外を投げた場合は502(#359)", async () => {
    const kv = createKv();
    kv.delete = async () => {
      throw new Error("KV delete failed");
    };
    const response = await worker.fetch(
      postJson("/api/push/unsubscribe", {
        endpoint: validSubscription.endpoint,
      }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "push subscription storage operation failed",
    });
  });

  test("リアクションAPIはIP単位で短時間の過剰連打を429にする", async () => {
    const kv = createKv();
    const request = () => {
      const reactionRequest = postJson("/api/video-reaction", {
        videoId: "rate-test",
      });
      reactionRequest.headers.set("CF-Connecting-IP", "198.51.100.33");
      return reactionRequest;
    };
    for (let index = 0; index < 30; index += 1) {
      expect(
        (
          await worker.fetch(request(), {
            ASSETS: assets,
            PUSH_SUBSCRIPTIONS: kv,
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await worker.fetch(request(), {
          ASSETS: assets,
          PUSH_SUBSCRIPTIONS: kv,
        })
      ).status,
    ).toBe(429);
  });
});
