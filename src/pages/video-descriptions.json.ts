import type { APIRoute } from "astro";
import videosJson from "../data/videos.json";
import { extractSearchableText } from "../lib/format";
import { parseVideosData } from "../lib/youtube";

/**
 * /videos/ のキーワード検索(概要欄本文を対象に含む・#125)が使う検索対象テキストを、
 * ビルド時に静的JSONとして1ファイルに書き出す。
 *
 * 以前は videos.astro のフロントマターで組み立て、インライン
 * `<script type="application/json" id="video-search-descriptions">` として
 * ページの初期HTMLに埋め込んでいた。動画の概要欄全文(要約なし)を全動画分連結するため、
 * 動画数が増えるほど(97本時点で概要欄合計 約12万字)ページの初期HTMLペイロードが際限なく
 * 肥大化し、Lighthouse performance の低下(#324、#177・#217・#265・#318の再発)の一因になっていた。
 *
 * search-index.json.ts(ヘッダー横断検索、#318)と同じ方針で静的エンドポイント化することで、
 * 検索キーワードを実際に入力した際にのみ1回だけ取得すればよくなり、かつ全ページ共通のURL
 * (ブラウザキャッシュ可能)になる。
 */
export const GET: APIRoute = () => {
  const { videos } = parseVideosData(videosJson);
  const descriptions = Object.fromEntries(
    videos.map((video) => [video.id, extractSearchableText(video.description).toLowerCase()]),
  );
  return new Response(JSON.stringify(descriptions), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
