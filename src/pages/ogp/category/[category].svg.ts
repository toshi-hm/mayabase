import type { APIRoute, GetStaticPaths } from "astro";
import videosJson from "../../../data/videos.json";
import {
  CATEGORY_LABELS,
  categorizeVideo,
  getAvailableCategories,
} from "../../../lib/categories";
import { buildOgImageSvg } from "../../../lib/ogImage";
import { parseVideosData } from "../../../lib/youtube";

export const getStaticPaths: GetStaticPaths = () => {
  const { videos } = parseVideosData(videosJson);
  const categorized = videos.map((video) => ({ category: categorizeVideo(video) }));
  return getAvailableCategories(categorized).map((category) => ({
    params: { category },
    props: {
      title: `${CATEGORY_LABELS[category]}の動画一覧`,
      subtitle: "カテゴリから気になる動画を見つける",
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
