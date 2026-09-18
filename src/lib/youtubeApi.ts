const YOUTUBE_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

type YouTubeApiWindow = Window & {
  YT?: unknown;
  onYouTubeIframeAPIReady?: () => void;
};

let apiPromise: Promise<unknown> | null = null;
// 読み込みに失敗した<script>タグへの参照。<script>のerrorイベントは一度発火すると
// 二度と再発火しないため、保持したまま次回呼び出しでこのタグにリスナーを足しても
// 永久にpendingのままになる。次回呼び出し時にDOMから取り除き、新しいタグに差し替える。
let failedScript: HTMLScriptElement | null = null;

/** YouTube IFrame APIをページ内で一度だけ読み込み、全利用者で同じready処理を共有する。 */
export function loadYouTubeIframeApi<T>(): Promise<T> {
  const browserWindow = window as YouTubeApiWindow;
  if (browserWindow.YT) return Promise.resolve(browserWindow.YT as T);
  if (apiPromise) return apiPromise.then(() => browserWindow.YT as T);

  const pending = new Promise<void>((resolve, reject) => {
    const previousReady = browserWindow.onYouTubeIframeAPIReady;
    browserWindow.onYouTubeIframeAPIReady = () => {
      try {
        previousReady?.();
      } catch {
        // 既存ハンドラーの失敗で、他の利用者の初期化を止めない。
      }
      if (browserWindow.YT) resolve();
      else reject(new Error("YouTube IFrame API is unavailable"));
    };

    if (failedScript) {
      failedScript.remove();
      failedScript = null;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_SRC}"]`,
    );
    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => {
          failedScript = existingScript;
          reject(new Error("YouTube IFrame API failed to load"));
        },
        { once: true },
      );
      return;
    }

    const apiScript = document.createElement("script");
    apiScript.src = YOUTUBE_IFRAME_API_SRC;
    apiScript.onerror = () => {
      failedScript = apiScript;
      reject(new Error("YouTube IFrame API failed to load"));
    };
    document.head.appendChild(apiScript);
  });

  const resultPromise: Promise<T> = pending.then(() => {
    const api = browserWindow.YT;
    if (!api) throw new Error("YouTube IFrame API is unavailable");
    return api as T;
  });
  apiPromise = resultPromise;

  // 失敗時は次回呼び出しで再試行できるよう、保持中のPromiseを解放する。
  // (このcatchは呼び出し元へは伝播しない別チェーンなので、resultPromise自体は reject のまま呼び出し元に返る)
  resultPromise.catch(() => {
    if (apiPromise === resultPromise) apiPromise = null;
  });

  return resultPromise;
}
