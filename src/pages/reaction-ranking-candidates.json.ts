import type { APIRoute } from "astro";
import videosJson from "../data/videos.json";
import { parseVideosData } from "../lib/youtube";

/**
 * トップページの「みんなが気になっている動画」(ReactionRanking.astro)が使う候補データを、
 * ビルド時に静的JSONとして1ファイルに書き出す。
 *
 * 以前は index.astro から渡された全動画配列をフロントマターでid/title/publishedAt/isShortに
 * 絞り込み、表示するのは上位6件のみにもかかわらずインライン
 * `<script type="application/json">` としてトップページの初期HTMLに常時埋め込んでいた。
 * 動画数が増えるほど初期HTMLペイロードが線形に増加し続ける、video-descriptions.json.ts・
 * search-index.json.ts(#177・#217・#265・#318・#324)と同種のアンチパターンの再発だった(#534)。
 *
 * 静的エンドポイント化することで、セクションが実際にビューポートに入った時点でのみ1回だけ
 * 取得すればよくなり、かつ全ページ共通のURL(ブラウザキャッシュ可能)になる。
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
