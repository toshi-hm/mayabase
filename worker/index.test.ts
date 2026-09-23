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
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
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
    const response = await worker.fetch(postJson("/api/push/subscribe", { endpoint: 123 }), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    expect(response.status).toBe(400);
    expect(kv.store.size).toBe(0);
  });

  test("動画リアクションをKVで加算する", async () => {
    const kv = createKv();
    const request = (cookie?: string) =>
      new Request("https://portal.mayabase.workers.dev/api/video-reaction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ videoId: "abc123" }),
      });
    const first = await worker.fetch(request(), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    const visitorCookie = first.headers.get("set-cookie");
    expect(visitorCookie).toMatch(/^MAYABASE_VISITOR_ID=[0-9a-f-]{36};/);
    const second = await worker.fetch(request(visitorCookie?.split(";")[0]), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    expect(await first.json()).toEqual({ count: 1 });
    expect(await second.json()).toEqual({ count: 1, duplicate: true });
    expect(kv.options.get("reaction:abc123")).toEqual({
      expirationTtl: 365 * 24 * 60 * 60,
    });
    expect(
      [...kv.store.keys()].filter((key) => key.startsWith("reaction:abc123:visitor:")),
    ).toHaveLength(1);
  });

  test("集計更新の部分失敗は同じCookieの再送で復旧する", async () => {
    const kv = createKv();
    const originalPut = kv.put;
    let shouldFailAggregatePut = true;
    kv.put = async (key, value, options) => {
      if (shouldFailAggregatePut && key === "reaction:partial-test") {
        shouldFailAggregatePut = false;
        throw new Error("aggregate put failed");
      }
      await originalPut(key, value, options);
    };

    const first = await worker.fetch(postJson("/api/video-reaction", { videoId: "partial-test" }), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    expect(first.status).toBe(502);
    const visitorCookie = first.headers.get("set-cookie");
    expect(visitorCookie).toMatch(/^MAYABASE_VISITOR_ID=[0-9a-f-]{36};/);

    const recovered = await worker.fetch(
      new Request("https://portal.mayabase.workers.dev/api/video-reaction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: visitorCookie?.split(";")[0] ?? "",
        },
        body: JSON.stringify({ videoId: "partial-test" }),
      }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ count: 1 });
    expect(kv.store.get("reaction:partial-test")).toMatch(/^1:[0-9a-f-]{36}$/);
  });

  test("committed保存の部分失敗後、別訪問者がさらに加算しても自分の分を再加算しない", async () => {
    const kv = createKv();
    const originalPut = kv.put;
    let shouldFailCommittedPut = true;
    let firstVisitorId = "";
    kv.put = async (key, value, options) => {
      if (
        shouldFailCommittedPut &&
        key.startsWith("reaction:commit-retry:visitor:") &&
        value === '{"status":"committed"}'
      ) {
        shouldFailCommittedPut = false;
        throw new Error("committed marker put failed");
      }
      await originalPut(key, value, options);
    };

    const first = await worker.fetch(postJson("/api/video-reaction", { videoId: "commit-retry" }), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
    expect(first.status).toBe(502);
    const visitorCookie = first.headers.get("set-cookie");
    expect(visitorCookie).toMatch(/^MAYABASE_VISITOR_ID=[0-9a-f-]{36};/);
    firstVisitorId = visitorCookie?.split(";")[0] ?? "";

    const second = await worker.fetch(
      postJson("/api/video-reaction", { videoId: "commit-retry" }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ count: 2 });

    const recovered = await worker.fetch(
      new Request("https://portal.mayabase.workers.dev/api/video-reaction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: firstVisitorId,
        },
        body: JSON.stringify({ videoId: "commit-retry" }),
      }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ count: 2 });
    expect(kv.store.get("reaction:commit-retry")).toMatch(/^2:[0-9a-f-]{36}$/);
  });

  test("集計putの部分失敗後、別訪問者が同じ目標値まで進めても自分の加算を取りこぼさない", async () => {
    // Issue #433のレビューで指摘された回帰: 訪問者Aの集計put自体が失敗し、
    // 集計値が更新されないまま訪問者Bが同じtargetCountまで正しく加算した場合、
    // Aが再送すると「自分の目標値に達している」と誤判定して自分の加算を
    // 永久に取りこぼしてはならない。
    const kv = createKv();
    const originalPut = kv.put;
    let shouldFailAggregatePut = true;
    kv.put = async (key, value, options) => {
      if (shouldFailAggregatePut && key === "reaction:collision-test") {
        shouldFailAggregatePut = false;
        throw new Error("aggregate put failed");
      }
      await originalPut(key, value, options);
    };

    const first = await worker.fetch(
      postJson("/api/video-reaction", { videoId: "collision-test" }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(first.status).toBe(502);
    const visitorACookie = first.headers.get("set-cookie");
    expect(visitorACookie).toMatch(/^MAYABASE_VISITOR_ID=[0-9a-f-]{36};/);

    // 訪問者B(別Cookie)が同じ動画へ反応し、集計値を0→1へ正しく進める。
    const fromB = await worker.fetch(
      postJson("/api/video-reaction", { videoId: "collision-test" }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(fromB.status).toBe(200);
    expect(await fromB.json()).toEqual({ count: 1 });

    // 訪問者Aが同じCookieで再送すると、自分の加算がまだ反映されていないと
    // 正しく判定し、二重加算にはならずに1件だけ加算されて合計2になる。
    const recoveredA = await worker.fetch(
      new Request("https://portal.mayabase.workers.dev/api/video-reaction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: visitorACookie?.split(";")[0] ?? "",
        },
        body: JSON.stringify({ videoId: "collision-test" }),
      }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(recoveredA.status).toBe(200);
    expect(await recoveredA.json()).toEqual({ count: 2 });
    expect(kv.store.get("reaction:collision-test")).toMatch(/^2:[0-9a-f-]{36}$/);
  });

  test("同一動画への異なる訪問者はそれぞれ加算され、duplicateにならない", async () => {
    const kv = createKv();
    const first = await worker.fetch(
      postJson("/api/video-reaction", { videoId: "multi-visitor" }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(await first.json()).toEqual({ count: 1 });

    const second = await worker.fetch(
      postJson("/api/video-reaction", { videoId: "multi-visitor" }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(await second.json()).toEqual({ count: 2 });

    expect(
      [...kv.store.keys()].filter((storeKey) =>
        storeKey.startsWith("reaction:multi-visitor:visitor:"),
      ),
    ).toHaveLength(2);
  });

  test("不正なCookie値は無視され、新しい訪問者IDが発行される", async () => {
    const kv = createKv();
    const response = await worker.fetch(
      new Request("https://portal.mayabase.workers.dev/api/video-reaction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "MAYABASE_VISITOR_ID=not-a-valid-uuid",
        },
        body: JSON.stringify({ videoId: "bad-cookie" }),
      }),
      { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 1 });
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toMatch(/^MAYABASE_VISITOR_ID=[0-9a-f-]{36};/);
    expect(setCookie).not.toContain("not-a-valid-uuid");
  });

  test("同一Cookieの並行POSTでも例外にならず、件数は不正な値にならない", async () => {
    const kv = createKv();
    const request = () =>
      new Request("https://portal.mayabase.workers.dev/api/video-reaction", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "MAYABASE_VISITOR_ID=11111111-1111-4111-8111-111111111111",
        },
        body: JSON.stringify({ videoId: "concurrent-test" }),
      });

    // Cloudflare KVには条件付き書き込みがないため、完全同時リクエストの原子性は
    // 保証しない(PR本文の制約どおり)。ここでは例外を投げずに応答し、
    // 件数が非負の整数として安定していることだけを確認する。
    const [responseA, responseB] = await Promise.all([
      worker.fetch(request(), { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv }),
      worker.fetch(request(), { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv }),
    ]);
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    const [bodyA, bodyB] = await Promise.all([responseA.json(), responseB.json()]);
    expect(Number.isSafeInteger(bodyA.count) && bodyA.count >= 1).toBe(true);
    expect(Number.isSafeInteger(bodyB.count) && bodyB.count >= 1).toBe(true);
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
      new Request("https://portal.mayabase.workers.dev/api/video-reaction?videoId=get-test", {
        headers: { "CF-Connecting-IP": "198.51.100.34" },
      }),
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
    const response = await worker.fetch(postJson("/api/push/subscribe", validSubscription), {
      ASSETS: assets,
      PUSH_SUBSCRIPTIONS: kv,
    });
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

  test("購読レコードに90日のexpirationTtlを設定する(#502)", async () => {
    const kv = createKv();
    const request = postJson("/api/push/subscribe", validSubscription);
    request.headers.set("CF-Connecting-IP", "203.0.113.10");
    const response = await worker.fetch(request, { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv });
    expect(response.status).toBe(201);
    const key = [...kv.store.keys()][0] as string;
    expect(kv.options.get(key)).toEqual({ expirationTtl: 90 * 24 * 60 * 60 });
  });

  test("購読APIはIP単位で短時間の過剰連打を429にする(#502)", async () => {
    const kv = createKv();
    const request = () => {
      const subscribeRequest = postJson("/api/push/subscribe", {
        endpoint: `https://fcm.googleapis.com/fcm/send/rate-test`,
        keys: validSubscription.keys,
      });
      subscribeRequest.headers.set("CF-Connecting-IP", "203.0.113.20");
      return subscribeRequest;
    };
    for (let index = 0; index < 10; index += 1) {
      expect(
        (
          await worker.fetch(request(), {
            ASSETS: assets,
            PUSH_SUBSCRIPTIONS: kv,
          })
        ).status,
      ).toBe(201);
    }
    const limited = await worker.fetch(request(), { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
  });

  test("解除APIもIP単位で短時間の過剰連打を429にする(#502)", async () => {
    const kv = createKv();
    const request = () => {
      const unsubscribeRequest = postJson("/api/push/unsubscribe", {
        endpoint: validSubscription.endpoint,
      });
      unsubscribeRequest.headers.set("CF-Connecting-IP", "203.0.113.30");
      return unsubscribeRequest;
    };
    for (let index = 0; index < 10; index += 1) {
      expect(
        (
          await worker.fetch(request(), {
            ASSETS: assets,
            PUSH_SUBSCRIPTIONS: kv,
          })
        ).status,
      ).toBe(200);
    }
    const limited = await worker.fetch(request(), { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv });
    expect(limited.status).toBe(429);
  });

  test("CF-Connecting-IPが無い場合はX-Forwarded-Forの先頭IP単位でレート制限する(#502)", async () => {
    const kv = createKv();
    const request = () => {
      const subscribeRequest = postJson("/api/push/subscribe", {
        endpoint: `https://fcm.googleapis.com/fcm/send/xff-test`,
        keys: validSubscription.keys,
      });
      subscribeRequest.headers.set("X-Forwarded-For", "203.0.113.40, 10.0.0.1");
      return subscribeRequest;
    };
    for (let index = 0; index < 10; index += 1) {
      expect(
        (
          await worker.fetch(request(), {
            ASSETS: assets,
            PUSH_SUBSCRIPTIONS: kv,
          })
        ).status,
      ).toBe(201);
    }
    const limited = await worker.fetch(request(), { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv });
    expect(limited.status).toBe(429);

    // 別のX-Forwarded-Forは別クライアント扱いになる(取り違えて同一キーにならないことの確認)
    const otherClientRequest = postJson("/api/push/subscribe", {
      endpoint: `https://fcm.googleapis.com/fcm/send/xff-test-other`,
      keys: validSubscription.keys,
    });
    otherClientRequest.headers.set("X-Forwarded-For", "203.0.113.41");
    expect(
      (await worker.fetch(otherClientRequest, { ASSETS: assets, PUSH_SUBSCRIPTIONS: kv })).status,
    ).toBe(201);
  });
});
