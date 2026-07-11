// @ts-check
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// デプロイ先が決まったら本番 URL に変更してください(canonical / sitemap / OGP の絶対 URL に使われます)
const SITE_URL = "https://mayabase.pages.dev";

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
