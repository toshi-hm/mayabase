// @ts-check
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// 本番 URL(canonical / sitemap / OGP の絶対 URL に使われます)
const SITE_URL = "https://portal.mayabase.workers.dev";

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
