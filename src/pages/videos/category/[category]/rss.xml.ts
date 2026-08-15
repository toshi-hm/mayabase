import type { APIRoute, GetStaticPaths } from "astro";
import { site } from "../../../../config/site";
import videosJson from "../../../../data/videos.json";
import {
  CATEGORY_LABELS,
  categorizeVideo,
  getAvailableCategories,
  type VideoCategory,
} from "../../../../lib/categories";
import { buildRssFeed } from "../../../../lib/rss";
import { parseVideosData } from "../../../../lib/youtube";

/** カテゴリ別新着動画RSSフィード(#214)。/rss.xml(全動画)と同じビルド時静的エンドポイント方式 */
export const getStaticPaths: GetStaticPaths = () => {
  const { videos } = parseVideosData(videosJson);
  const categorized = videos.map((video) => ({ video, category: categorizeVideo(video) }));
  // 動画が 1 件以上あるカテゴリだけ生成する(videos/category/[category].astro と同じ方針・#121)
  return getAvailableCategories(categorized).map((category) => ({ params: { category } }));
};

export const GET: APIRoute = ({ params, site: siteUrl }) => {
  if (!siteUrl) {
    throw new Error("astro.config.mjs の site が未設定です(RSSフィードのURL生成に必須)");
  }
  const category = params.category as VideoCategory;
  const categoryLabel = CATEGORY_LABELS[category];
  const { videos } = parseVideosData(videosJson);
  const categoryVideos = videos.filter((video) => categorizeVideo(video) === category);
  const feedUrl = new URL(`videos/category/${category}/rss.xml`, siteUrl);
  const body = buildRssFeed(categoryVideos, siteUrl, feedUrl, {
    title: `${categoryLabel} | ${site.name}`,
    description: `${site.name} の「${categoryLabel}」カテゴリの新着動画フィード。`,
  });
  return new Response(body, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
};
