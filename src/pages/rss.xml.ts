import type { APIRoute } from "astro";
import { site } from "../config/site";
import videosJson from "../data/videos.json";
import { buildRssFeed } from "../lib/rss";
import { parseVideosData } from "../lib/youtube";

/** 新着動画RSSフィード(#186)。sitemap.xml / robots.txt と同様のビルド時静的エンドポイント */
export const GET: APIRoute = ({ site: siteUrl }) => {
  if (!siteUrl) {
    throw new Error("astro.config.mjs の site が未設定です(RSSフィードのURL生成に必須)");
  }
  const { videos } = parseVideosData(videosJson);
  const feedUrl = new URL("rss.xml", siteUrl);
  const body = buildRssFeed(videos, siteUrl, feedUrl, {
    title: `${site.name} | ITで日常をより便利に`,
    description: site.description,
  });
  return new Response(body, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
};
