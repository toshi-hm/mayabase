import type { APIRoute } from "astro";
import faqJson from "../data/faq.json";
import gearJson from "../data/gear.json";
import glossaryJson from "../data/glossary.json";
import videosJson from "../data/videos.json";
import { parseFaqData } from "../lib/faq";
import { parseGearData } from "../lib/gear";
import { parseGlossaryData } from "../lib/glossary";
import { buildSiteSearchIndex } from "../lib/siteSearch";
import { buildTopicsIndex } from "../lib/topics";
import { parseVideosData } from "../lib/youtube";

/**
 * ヘッダー横断検索(#155, #301)のインデックスを、ビルド時に静的JSONとして1ファイルに書き出す。
 *
 * 以前は SiteHeader.astro のフロントマターでページごとに同じインデックスを組み立て、
 * インライン `<script type="application/json">` として全ページのHTMLに埋め込んでいた。
 * チャプター統合(#301)で件数が539件・約210KBまで増え、検索パネルを一度も開かないユーザーの
 * ページ読み込みでも毎回パース・レイアウトコストを払う形になり、Lighthouse performanceの
 * 低下(#318)の主因になっていた。
 *
 * 静的エンドポイント化することで、検索パネルを実際に開いた時点でのみ1回だけ取得すればよくなり、
 * かつ全ページで同一URL(ブラウザキャッシュ可能)になる。
 */
export const GET: APIRoute = () => {
  const { videos } = parseVideosData(videosJson);
  const { categories: faqCategories } = parseFaqData(faqJson);
  const { items: gearItems } = parseGearData(gearJson);
  const { items: glossaryItems } = parseGlossaryData(glossaryJson);
  const topics = buildTopicsIndex(videos);
  const index = buildSiteSearchIndex(videos, faqCategories, gearItems, glossaryItems, topics);
  return new Response(JSON.stringify(index), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
