import type { APIRoute } from "astro";
import videosJson from "../data/videos.json";
import { parseVideosData } from "../lib/youtube";

/**
 * マイページ(#538)が「あとで見る」「視聴済み」「続きから」「気になる」各セクションの
 * カードを組み立てるための候補データ。video-descriptions.json.ts 等と同じ方針で、
 * 動画数分のデータをページの初期HTMLへ埋め込まず、マイページを開いた時点でのみ
 * 1回だけ取得する(#177・#217・#265・#318・#324で繰り返し修正されてきた
 * 「初期HTML肥大化」アンチパターンの再発を避ける)。
 */
export const GET: APIRoute = () => {
  const { videos } = parseVideosData(videosJson);
  const candidates = videos.map(({ id, title, publishedAt, isShort }) => ({
    id,
    title,
    publishedAt,
    isShort,
  }));
  return new Response(JSON.stringify(candidates), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
