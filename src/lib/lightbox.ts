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
