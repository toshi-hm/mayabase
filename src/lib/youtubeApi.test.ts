import { afterEach, describe, expect, test } from "bun:test";

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

/** 実DOMの代わりに、youtubeApi.tsが使うAPI表面だけを模したフェイクの<script>要素。 */
class FakeScriptElement {
  src = "";
  onerror: (() => void) | null = null;
  removed = false;
  private errorListeners: Array<() => void> = [];

  addEventListener(type: string, callback: () => void): void {
    if (type === "error") this.errorListeners.push(callback);
  }

  fail(): void {
    this.onerror?.();
    for (const listener of this.errorListeners) listener();
  }

  remove(): void {
    this.removed = true;
  }
}

type FakeGlobal = typeof globalThis & {
  YT?: unknown;
  onYouTubeIframeAPIReady?: () => void;
};

const fakeGlobal = globalThis as FakeGlobal;

/**
 * window/documentをテスト用の最小フェイクに差し替える。
 * `window === globalThis` とすることで、youtubeApi.ts内の `window.YT` /
 * `window.onYouTubeIframeAPIReady` への読み書きをテストから直接観測・操作できる。
 *
 * querySelectorは実DOMと同様、事前に渡した`existingScripts`だけでなく
 * `appendChild`で後から追加された(かつ`remove()`されていない)タグも対象にする。
 * そうしないと、読み込み失敗後にDOMへ残り続ける<script>タグを次回呼び出しが
 * 誤って見失う不具合(#XXX)をテストが検出できない。
 */
function installFakeDom(existingScripts: FakeScriptElement[] = []) {
  const documentScripts: FakeScriptElement[] = [...existingScripts];
  const appended: FakeScriptElement[] = [];
  Object.assign(fakeGlobal, {
    window: fakeGlobal,
    document: {
      querySelector: (selector: string) =>
        documentScripts.find((s) => !s.removed && selector === `script[src="${s.src}"]`) ?? null,
      createElement: () => new FakeScriptElement(),
      head: {
        appendChild: (el: FakeScriptElement) => {
          el.src = el.src || IFRAME_API_SRC;
          documentScripts.push(el);
          appended.push(el);
        },
      },
    },
  });
  return { appended };
}

afterEach(() => {
  for (const key of ["window", "document", "YT", "onYouTubeIframeAPIReady"] as const) {
    delete (fakeGlobal as Record<string, unknown>)[key];
  }
});

/**
 * youtubeApi.ts はモジュールスコープで `apiPromise` を共有キャッシュしているため、
 * テストごとにキャッシュクエリを変えて別モジュールインスタンスとして読み込み、
 * テスト間の状態漏れを防ぐ。
 */
let importCounter = 0;
async function freshLoadYouTubeIframeApi() {
  importCounter += 1;
  const mod = await import(`./youtubeApi?test-instance=${importCounter}`);
  return mod.loadYouTubeIframeApi as <T>() => Promise<T>;
}

describe("loadYouTubeIframeApi", () => {
  test("window.YTが既に存在する場合は即座に解決し、scriptを追加しない", async () => {
    const { appended } = installFakeDom();
    fakeGlobal.YT = { marker: "already-loaded" };
    const loadYouTubeIframeApi = await freshLoadYouTubeIframeApi();

    const api = await loadYouTubeIframeApi<{ marker: string }>();

    expect(api.marker).toBe("already-loaded");
    expect(appended.length).toBe(0);
  });

  test("未ロード時はscriptタグを追加し、readyコールバックで解決する", async () => {
    const { appended } = installFakeDom();
    const loadYouTubeIframeApi = await freshLoadYouTubeIframeApi();

    const promise = loadYouTubeIframeApi<{ marker: string }>();
    expect(appended.length).toBe(1);
    expect(appended[0].src).toBe(IFRAME_API_SRC);

    fakeGlobal.YT = { marker: "ready" };
    fakeGlobal.onYouTubeIframeAPIReady?.();

    const api = await promise;
    expect(api.marker).toBe("ready");
  });

  test("既存のonYouTubeIframeAPIReadyハンドラーを退避してチェーン実行する", async () => {
    installFakeDom();
    let previousCalled = false;
    fakeGlobal.onYouTubeIframeAPIReady = () => {
      previousCalled = true;
    };
    const loadYouTubeIframeApi = await freshLoadYouTubeIframeApi();

    const promise = loadYouTubeIframeApi<{ marker: string }>();
    fakeGlobal.YT = { marker: "ready" };
    fakeGlobal.onYouTubeIframeAPIReady?.();

    await promise;
    expect(previousCalled).toBe(true);
  });

  test("既存ハンドラーが例外を投げても自身の初期化は継続する", async () => {
    installFakeDom();
    fakeGlobal.onYouTubeIframeAPIReady = () => {
      throw new Error("previous handler boom");
    };
    const loadYouTubeIframeApi = await freshLoadYouTubeIframeApi();

    const promise = loadYouTubeIframeApi<{ marker: string }>();
    fakeGlobal.YT = { marker: "ready" };

    expect(() => fakeGlobal.onYouTubeIframeAPIReady?.()).not.toThrow();
    const api = await promise;
    expect(api.marker).toBe("ready");
  });

  test("既存のIFrame APIスクリプトタグがあれば重複追加しない", async () => {
    const existing = new FakeScriptElement();
    existing.src = IFRAME_API_SRC;
    const { appended } = installFakeDom([existing]);
    const loadYouTubeIframeApi = await freshLoadYouTubeIframeApi();

    const promise = loadYouTubeIframeApi<{ marker: string }>();
    expect(appended.length).toBe(0);

    fakeGlobal.YT = { marker: "ready" };
    fakeGlobal.onYouTubeIframeAPIReady?.();
    await promise;
  });

  test("同時に呼び出した場合は同じ読み込み処理・結果を共有する(scriptは1本だけ)", async () => {
    const { appended } = installFakeDom();
    const loadYouTubeIframeApi = await freshLoadYouTubeIframeApi();

    const first = loadYouTubeIframeApi<{ marker: string }>();
    const second = loadYouTubeIframeApi<{ marker: string }>();
    expect(appended.length).toBe(1);

    fakeGlobal.YT = { marker: "ready" };
    fakeGlobal.onYouTubeIframeAPIReady?.();

    const [a, b] = await Promise.all([first, second]);
    expect(a.marker).toBe("ready");
    expect(b.marker).toBe("ready");
  });

  test("readyコールバック発火時にwindow.YTが無ければ失敗する", async () => {
    installFakeDom();
    const loadYouTubeIframeApi = await freshLoadYouTubeIframeApi();

    const promise = loadYouTubeIframeApi<{ marker: string }>();
    fakeGlobal.onYouTubeIframeAPIReady?.();

    await expect(promise).rejects.toThrow();
  });

  test("script読み込み失敗時は失敗を返し、次回呼び出しで再試行できる", async () => {
    const { appended } = installFakeDom();
    const loadYouTubeIframeApi = await freshLoadYouTubeIframeApi();

    const failedAttempt = loadYouTubeIframeApi<{ marker: string }>();
    expect(appended.length).toBe(1);
    appended[0].fail();
    await expect(failedAttempt).rejects.toThrow();

    // 失敗後もapiPromiseがreject済みのまま保持されず、再試行できること
    const retryAttempt = loadYouTubeIframeApi<{ marker: string }>();
    expect(appended.length).toBe(2);

    fakeGlobal.YT = { marker: "recovered" };
    fakeGlobal.onYouTubeIframeAPIReady?.();

    const api = await retryAttempt;
    expect(api.marker).toBe("recovered");
  });
});
