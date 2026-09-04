import { embedUrl } from "./youtube";

/**
 * オンサイト・プレビュー用ライトボックス(VideoLightbox.astro)の再生コンテナに
 * 適用する Tailwind クラスを、動画の向き(横型/Shorts縦型)ごとに決定する。
 */
export type LightboxAspect = "video" | "short";

const BASE_CLASSES = "bg-black";
const VIDEO_CONTAINER_CLASSES = `${BASE_CLASSES} aspect-video w-full`;
const SHORT_CONTAINER_CLASSES = `${BASE_CLASSES} mx-auto aspect-[9/16] w-auto max-h-[70vh]`;

/** ライトボックスの再生コンテナ(iframeの親div)に設定するクラス文字列を返す */
export function getLightboxContainerClass(aspect: LightboxAspect): string {
  return aspect === "short" ? SHORT_CONTAINER_CLASSES : VIDEO_CONTAINER_CLASSES;
}

/** data-lightbox-aspect 属性の生値(未指定・不正値を含む)を LightboxAspect に正規化する */
export function parseLightboxAspect(value: string | undefined): LightboxAspect {
  return value === "short" ? "short" : "video";
}

/**
 * data-lightbox-start 属性の生値(未指定・不正値を含む)を、再生開始秒数に正規化する。
 * チャプター検索(/topics/・#328)から開いた場合に、該当秒数から再生を始めるために使う。
 * 0 以下・数値でない値は「先頭から再生」と同義のため null(付与しない)として扱う。
 */
export function parseLightboxStartSeconds(value: string | undefined): number | null {
  if (value === undefined) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : null;
}

/** ライトボックスの iframe に設定する埋め込み URL(自動再生 + 関連動画非表示 + 任意の開始秒数) */
export function buildLightboxSrc(videoId: string, startSeconds: number | null): string {
  const params = new URLSearchParams({ autoplay: "1", rel: "0" });
  if (startSeconds !== null) {
    params.set("start", String(startSeconds));
  }
  return `${embedUrl(videoId)}?${params.toString()}`;
}
