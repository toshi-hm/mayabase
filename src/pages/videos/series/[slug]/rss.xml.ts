import type { APIRoute, GetStaticPaths } from "astro";
import { site } from "../../../../config/site";
import seriesJson from "../../../../data/series.json";
import videosJson from "../../../../data/videos.json";
import { buildRssFeed } from "../../../../lib/rss";
import { isInSeries, parseSeriesData, seriesUrl } from "../../../../lib/series";
import { parseVideosData } from "../../../../lib/youtube";

/** シリーズ別新着動画RSSフィード(#302)。videos/category/[category]/rss.xml.ts と同じビルド時静的エンドポイント方式 */
export const getStaticPaths: GetStaticPaths = () => {
  const { series } = parseSeriesData(seriesJson);
  const { videos } = parseVideosData(videosJson);
  // 該当動画が 1 件もないシリーズはページを生成しない([slug].astro の getStaticPaths と同じ方針)
  return series
    .filter((item) => videos.some((video) => isInSeries(video, item.keyword)))
    .map((item) => ({ params: { slug: item.slug } }));
};

export const GET: APIRoute = ({ params, site: siteUrl }) => {
  if (!siteUrl) {
    throw new Error("astro.config.mjs の site が未設定です(RSSフィードのURL生成に必須)");
  }
  const slug = params.slug as string;
  const { series } = parseSeriesData(seriesJson);
  const seriesItem = series.find((item) => item.slug === slug);
  if (!seriesItem) {
    throw new Error(`series.json に slug "${slug}" のシリーズが見つかりません`);
  }
  const { videos } = parseVideosData(videosJson);
  const seriesVideos = videos.filter((video) => isInSeries(video, seriesItem.keyword));
  const feedUrl = new URL(`videos/series/${slug}/rss.xml`, siteUrl);
  const pageUrl = new URL(seriesUrl(slug), siteUrl);
  const body = buildRssFeed(
    seriesVideos,
    siteUrl,
    feedUrl,
    {
      title: `${seriesItem.title} | ${site.name}`,
      description: `${site.name} の「${seriesItem.title}」シリーズの新着動画フィード。`,
    },
    pageUrl,
  );
  return new Response(body, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
};
