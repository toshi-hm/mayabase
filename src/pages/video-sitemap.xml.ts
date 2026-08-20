import type { APIRoute } from "astro";
import videosJson from "../data/videos.json";
import { buildVideoSitemap } from "../lib/videoSitemap";
import { parseVideosData } from "../lib/youtube";

/** Google動画検索向け XML Video Sitemap(#244)。sitemap.xml / robots.txt と同様のビルド時静的エンドポイント */
export const GET: APIRoute = ({ site: siteUrl }) => {
  if (!siteUrl) {
    throw new Error("astro.config.mjs の site が未設定です(Video Sitemap の URL生成に必須)");
  }
  const { videos } = parseVideosData(videosJson);
  const body = buildVideoSitemap(videos, siteUrl);
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
