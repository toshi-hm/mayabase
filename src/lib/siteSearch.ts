import type { FaqCategory } from "./faq";
import { textMatchesKeyword } from "./format";
import { type GearItem, gearDisplayName } from "./gear";
import type { Video } from "./youtube";

/** ヘッダー横断検索の対象コンテンツ種別 */
export type SiteSearchItemType = "video" | "faq" | "gear";

/** 種別ごとの表示ラベル(候補プレビューのバッジに使う) */
const SITE_SEARCH_TYPE_LABELS: Record<SiteSearchItemType, string> = {
  video: "動画",
  faq: "FAQ",
  gear: "ガジェット",
};

export function siteSearchTypeLabel(type: SiteSearchItemType): string {
  return SITE_SEARCH_TYPE_LABELS[type];
}

/** ヘッダー横断検索インデックスの 1 件分(SiteHeader.astro がビルド時に組み立てる) */
export interface SiteSearchItem {
  type: SiteSearchItemType;
  /** 候補プレビューに表示するタイトル */
  title: string;
  /** 候補プレビューに表示する補足テキスト(カテゴリ名等) */
  subtitle: string;
  /** 遷移先ページのパス("/videos/" 等。末尾スラッシュ付き) */
  href: string;
  /**
   * 遷移先ページへ渡す検索キーワード(?q=)。遷移先自身の絞り込みロジック
   * (cardMatches / faqTextMatches / gearTextMatches)で再度この値を照合するため、
   * 必ずこの候補自身にマッチする値(タイトル・質問文・ガジェット名そのもの)を使う。
   */
  query: string;
  /** インクリメンタルサーチの照合対象テキスト(`title` より広い範囲を含んでよい) */
  searchText: string;
}

/**
 * 動画・FAQ・ガジェットのデータからヘッダー横断検索インデックスを組み立てる(#155)。
 * ヘッダーはほぼ全ページに表示されるため、動画の概要欄全文のような重いテキストは含めず、
 * 「動画タイトル・FAQ(質問+回答)・ガジェット名(+ブランド+ひとことコメント)」に絞って軽量に保つ。
 */
export function buildSiteSearchIndex(
  videos: readonly Video[],
  faqCategories: readonly FaqCategory[],
  gearItems: readonly GearItem[],
): SiteSearchItem[] {
  const videoItems: SiteSearchItem[] = videos.map((video) => ({
    type: "video",
    title: video.title,
    subtitle: "動画ライブラリ",
    href: "/videos/",
    query: video.title,
    searchText: video.title,
  }));

  const faqItems: SiteSearchItem[] = faqCategories.flatMap((category) =>
    category.items.map((item) => ({
      type: "faq" as const,
      title: item.question,
      subtitle: category.title,
      href: "/faq/",
      query: item.question,
      searchText: `${item.question} ${item.answer}`,
    })),
  );

  const gearSearchItems: SiteSearchItem[] = gearItems.map((item) => ({
    type: "gear",
    title: gearDisplayName(item),
    subtitle: "愛用ガジェット",
    href: "/gear/",
    query: item.name,
    searchText: `${item.name} ${item.brand} ${item.note ?? ""}`,
  }));

  return [...videoItems, ...faqItems, ...gearSearchItems];
}

/**
 * ヘッダー横断検索のインクリメンタルサーチ本体(SiteHeader.astro のクライアントスクリプトから使用)。
 * `textMatchesKeyword`(format.ts、動画ライブラリ・FAQ・ガジェット検索と共通)を使い、
 * 同じ照合ルール(英数字キーワードは単語境界照合等)で判定する。
 * 動画が94件と件数が多いため、種別ごとに `limitPerType` 件で頭打ちにして
 * 特定の種別だけが候補を占有しないようにする(3種別 × limitPerType 件が候補の上限)。
 * 空クエリでは候補を返さない(サジェストを毎回全件出さないようにするため)。
 */
export function searchSiteIndex(
  index: readonly SiteSearchItem[],
  query: string,
  limitPerType: number,
): SiteSearchItem[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];

  const counts: Record<SiteSearchItemType, number> = { video: 0, faq: 0, gear: 0 };
  const matched: SiteSearchItem[] = [];
  for (const item of index) {
    if (counts[item.type] >= limitPerType) continue;
    if (textMatchesKeyword(item.searchText, trimmed)) {
      matched.push(item);
      counts[item.type] += 1;
    }
  }
  return matched;
}

/**
 * 候補プレビュー選択時の遷移先 URL を組み立てる。
 * 各コンテンツページ(videos.astro / faq.astro / gear.astro)が持つ既存のURL同期機構
 * (`syncUrl` / `restoreStateFromUrl`)がこの `?q=` を読み取り、遷移先で自動的に絞り込む。
 */
export function siteSearchResultUrl(item: Pick<SiteSearchItem, "href" | "query">): string {
  return `${item.href}?q=${encodeURIComponent(item.query)}`;
}
