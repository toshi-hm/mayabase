const YOUTUBE_IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

interface YouTubeApiWindow extends Window {
  YT?: unknown;
  onYouTubeIframeAPIReady?: () => void;
}

let apiPromise: Promise<unknown> | null = null;

/** YouTube IFrame APIをページ内で一度だけ読み込み、全利用者で同じready処理を共有する。 */
export function loadYouTubeIframeApi<T>(): Promise<T> {
  const browserWindow = window as YouTubeApiWindow;
  if (browserWindow.YT) return Promise.resolve(browserWindow.YT as T);
  if (apiPromise) return apiPromise.then(() => browserWindow.YT as T);

  apiPromise = new Promise<void>((resolve, reject) => {
    const previousReady = browserWindow.onYouTubeIframeAPIReady;
    browserWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (browserWindow.YT) resolve();
      else reject(new Error("YouTube IFrame API is unavailable"));
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_IFRAME_API_SRC}"]`,
    );
    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => reject(new Error("YouTube IFrame API failed to load")),
        { once: true },
      );
      return;
    }

    const apiScript = document.createElement("script");
    apiScript.src = YOUTUBE_IFRAME_API_SRC;
    apiScript.onerror = () => reject(new Error("YouTube IFrame API failed to load"));
    document.head.appendChild(apiScript);
  });

  return apiPromise.then(() => {
    const api = browserWindow.YT;
    if (!api) throw new Error("YouTube IFrame API is unavailable");
    return api as T;
  });
}
