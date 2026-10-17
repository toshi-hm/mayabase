// @ts-check

import { readFileSync } from "node:fs";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { sitemapLastmod } from "./src/lib/sitemapLastmod.ts";

// 本番 URL(canonical / sitemap / OGP の絶対 URL に使われます)
const SITE_URL = "https://portal.mayabase.workers.dev";

const { videos } = JSON.parse(
  readFileSync(new URL("./src/data/videos.json", import.meta.url), "utf8"),
);

export default defineConfig({
  site: SITE_URL,
  integrations: [
    sitemap({
      // /watch-later/ と /mypage/ は localStorage 依存で訪問者ごとに内容が変わり(#216, #538)、
      // Base.astro 側で noindex にしているページのためサイトマップからも除外する
      filter: (page) => !page.includes("/watch-later/") && !page.includes("/mypage/"),
      // 動画の公開日時など根拠のある日付だけを lastmod に付与する(#580)
      serialize: (item) => {
        const lastmod = sitemapLastmod(item.url, videos, SITE_URL);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
