import type { APIRoute } from "astro";
import { THEME_COLORS } from "../lib/theme";

/**
 * Web App Manifest。
 *
 * 以前は public/manifest.json として固定値(ライト配色のみ)を配信していたが、
 * Base.astro の <meta name="theme-color"> は prefers-color-scheme でライト/ダークを
 * 出し分けているのに対し、manifestのbackground_color/theme_colorは固定のライト色のままだった。
 * PWAとしてホーム画面に追加しダークモード端末で起動した場合、起動スプラッシュ画面や
 * OS側のUIがライト色のまま表示される可能性があった(#536)。
 *
 * theme_color/background_colorのmedia配列形式(Chromiumが対応)を使うことで、
 * OSのダーク/ライト設定に応じた色を出し分ける。この形式に対応しないブラウザは
 * 当該フィールドを無視するだけで、manifest自体の読み込みや他フィールドには影響しない。
 * Base.astroのtheme-colorメタタグと値がずれないよう、色そのものは src/lib/theme.ts の
 * THEME_COLORS を共有する。
 */
/** テスト(scripts/check-maskable-icon.test.ts)からも参照する、manifest本体。 */
export const manifest = {
  name: "MayaBase | ITで日常をより便利に",
  short_name: "MayaBase",
  description:
    "AI・ガジェット・社会人Vlogを発信するYouTubeチャンネル「MayaBase」の公式ポータルサイト。",
  start_url: "/",
  scope: "/",
  display: "standalone",
  lang: "ja",
  background_color: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  theme_color: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    {
      src: "/icons/icon-maskable.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "maskable",
    },
  ],
};

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
};
