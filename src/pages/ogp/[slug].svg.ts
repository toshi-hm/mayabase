import type { APIRoute, GetStaticPaths } from "astro";
import { buildOgImageSvg } from "../../lib/ogImage";

const pages = {
  faq: {
    title: "よくある質問",
    subtitle: "チャンネル・運営者・機材・お仕事について",
  },
  glossary: {
    title: "IT・ガジェット用語集",
    subtitle: "動画で登場するAI・ガジェット・エンジニア用語",
  },
  gear: {
    title: "愛用ガジェット",
    subtitle: "MayaBaseで実際に使っている機材とデスク環境",
  },
  topics: {
    title: "チャプター検索",
    subtitle: "動画の目次を横断検索して気になる場面から再生",
  },
  videos: {
    title: "動画ライブラリ",
    subtitle: "AI・ガジェット・社会人Vlogの動画アーカイブ",
  },
  "series-index": {
    title: "シリーズ一覧",
    subtitle: "テーマごとに動画をまとめてチェック",
  },
} as const;

export const getStaticPaths: GetStaticPaths = () =>
  Object.entries(pages).map(([slug, props]) => ({ params: { slug }, props }));

export const GET: APIRoute = ({ props }) => {
  const page = props as (typeof pages)[keyof typeof pages];
  return new Response(buildOgImageSvg(page), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
