import type { APIRoute, GetStaticPaths } from "astro";
import seriesJson from "../../../data/series.json";
import videosJson from "../../../data/videos.json";
import { buildOgImageSvg } from "../../../lib/ogImage";
import { getSeriesWithVideos, parseSeriesData } from "../../../lib/series";
import { parseVideosData } from "../../../lib/youtube";

export const getStaticPaths: GetStaticPaths = () => {
  const { series } = parseSeriesData(seriesJson);
  const { videos } = parseVideosData(videosJson);
  return getSeriesWithVideos(series, videos).map(({ series: item }) => ({
    params: { slug: item.slug },
    props: {
      title: `${item.title} 動画一覧`,
      subtitle: item.description,
    },
  }));
};

export const GET: APIRoute = ({ props }) =>
  new Response(buildOgImageSvg(props as { title: string; subtitle: string }), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
