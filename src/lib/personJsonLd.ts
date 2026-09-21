import { site } from "../config/site";

/** 運営者(Person)の JSON-LD ノード 1 件分 */
export interface OwnerPersonJsonLd {
  "@type": "Person";
  "@id": string;
  name: string;
  description: string;
  url: string;
  sameAs: string[];
}

/**
 * 運営者(`site.profile`)を表す `Person` の JSON-LD ノードを組み立てる。
 *
 * Google をはじめとする構造化データの解釈はページ単位で独立しており、`@id` は
 * 同一ページ内のグラフでしか解決されない(別ページで定義したノードを `@id` 参照だけで
 * 差し込むことはできない・#451)。そのため `VideoObject.creator` でこの `Person` を
 * 参照するページは、参照だけでなくこの関数が返すノード自体を自身の `@graph` に
 * 含める必要がある。`index.astro`・動画一覧・動画詳細・カテゴリ別・シリーズ別の
 * 各ページで同じ `@id` を持つ同一内容のノードを埋め込むことで、ページをまたいでも
 * 同一エンティティであることが伝わる。
 */
export function buildOwnerPersonJsonLd(siteUrl: string): OwnerPersonJsonLd {
  return {
    "@type": "Person",
    "@id": `${siteUrl}#owner`,
    name: site.profile.name,
    description: site.profile.bio,
    url: siteUrl,
    sameAs: [site.youtube.url, site.x.url],
  };
}
