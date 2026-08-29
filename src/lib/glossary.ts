import { textMatchesKeyword } from "./format";
import type { GearItem } from "./gear";
import type { Video } from "./youtube";

/** 用語集 1 件分のデータ。glossary.json で手動管理する(#255) */
export interface GlossaryItem {
  /** 用語(見出し) */
  term: string;
  /** 簡潔な解説文 */
  definition: string;
  /**
   * この用語を扱った動画の YouTube video ID(任意・手動管理)。
   * gear.json の videoIds(#70)と同じ方針。存在しない ID は表示側で無視する。
   */
  relatedVideoIds?: string[];
  /**
   * この用語に関連する愛用ガジェットの名称(gear.json の GearItem.name と完全一致、任意・手動管理)。
   * 存在しない名称は表示側で無視する。
   */
  relatedGearNames?: string[];
}

/** glossary.json 全体の構造 */
export interface GlossaryData {
  items: GlossaryItem[];
}

/**
 * glossary.json の内容を検証しつつパースする。
 * 不正データは具体的なメッセージ付きで throw する(ビルドを落として混入を検知する)。
 */
export function parseGlossaryData(data: unknown): GlossaryData {
  if (typeof data !== "object" || data === null) {
    throw new Error("glossary.json: オブジェクトではありません");
  }
  const { items } = data as { items?: unknown };
  if (!Array.isArray(items)) {
    throw new Error("glossary.json: items は配列である必要があります");
  }
  const seenTerms = new Set<string>();
  const parsed: GlossaryItem[] = items.map((raw, i) => {
    const item = raw as Partial<Record<keyof GlossaryItem, unknown>>;
    if (typeof item.term !== "string" || item.term.length === 0) {
      throw new Error(`glossary.json: items[${i}].term が不正です`);
    }
    if (seenTerms.has(item.term)) {
      throw new Error(`glossary.json: items[${i}].term "${item.term}" が重複しています`);
    }
    seenTerms.add(item.term);
    if (typeof item.definition !== "string" || item.definition.length === 0) {
      throw new Error(`glossary.json: items[${i}].definition が不正です`);
    }
    if (
      item.relatedVideoIds !== undefined &&
      (!Array.isArray(item.relatedVideoIds) ||
        item.relatedVideoIds.some((id) => typeof id !== "string" || id.length === 0))
    ) {
      throw new Error(
        `glossary.json: items[${i}].relatedVideoIds は文字列の配列である必要があります`,
      );
    }
    if (
      item.relatedGearNames !== undefined &&
      (!Array.isArray(item.relatedGearNames) ||
        item.relatedGearNames.some((name) => typeof name !== "string" || name.length === 0))
    ) {
      throw new Error(
        `glossary.json: items[${i}].relatedGearNames は文字列の配列である必要があります`,
      );
    }
    return {
      term: item.term,
      definition: item.definition,
      ...(item.relatedVideoIds !== undefined
        ? { relatedVideoIds: item.relatedVideoIds as string[] }
        : {}),
      ...(item.relatedGearNames !== undefined
        ? { relatedGearNames: item.relatedGearNames as string[] }
        : {}),
    };
  });
  return { items: parsed };
}

/**
 * 用語集のキーワード検索(glossary.astro のクライアントスクリプトから使用)。
 * term / definition / query はいずれも呼び出し側で小文字化済みの前提。
 * `textMatchesKeyword`(format.ts、動画ライブラリ・FAQ・ガジェット検索と共通)を使う。
 */
export function glossaryTextMatches(term: string, definition: string, query: string): boolean {
  return textMatchesKeyword(term, query) || textMatchesKeyword(definition, query);
}

// 日本語混じりの用語(カタカナ・漢字・英字表記が混在)を安定した五十音/アルファベット順で
// 並べるための Collator。sensitivity: "base" で全角/半角・大文字小文字の揺れを吸収する。
const TERM_COLLATOR = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

/** 用語をあいうえお順(Intl.Collator("ja"))に並べ替える。glossary.json の記載順には依存しない */
export function sortGlossaryTerms<T extends Pick<GlossaryItem, "term">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => TERM_COLLATOR.compare(a.term, b.term));
}

/**
 * 用語 1 件が扱っている動画を relatedVideoIds から解決する(gear.ts の resolveGearVideos と同方針)。
 * videos.json 側に存在しない ID(削除・typo 等)は無視し、throw しない(手動管理データのため)。
 */
export function resolveGlossaryVideos(
  item: Pick<GlossaryItem, "relatedVideoIds">,
  videos: readonly Video[],
): Video[] {
  if (!item.relatedVideoIds || item.relatedVideoIds.length === 0) return [];
  const videoById = new Map(videos.map((video) => [video.id, video]));
  return item.relatedVideoIds
    .map((id) => videoById.get(id))
    .filter((video): video is Video => video !== undefined);
}

/**
 * 用語 1 件に関連する愛用ガジェットを relatedGearNames(GearItem.name と完全一致)から解決する。
 * gear.json 側に存在しない名称(改名・typo 等)は無視し、throw しない(手動管理データのため)。
 */
export function resolveGlossaryGear(
  item: Pick<GlossaryItem, "relatedGearNames">,
  gearItems: readonly GearItem[],
): GearItem[] {
  if (!item.relatedGearNames || item.relatedGearNames.length === 0) return [];
  const gearByName = new Map(gearItems.map((gear) => [gear.name, gear]));
  return item.relatedGearNames
    .map((name) => gearByName.get(name))
    .filter((gear): gear is GearItem => gear !== undefined);
}

/**
 * 動画 ID → その動画で扱われている用語一覧、の逆引きマップを構築する
 * (gear.ts の buildVideoGearMap と同方針・#294)。glossary.json の記載順を維持する。
 */
export function buildVideoGlossaryMap(items: readonly GlossaryItem[]): Map<string, GlossaryItem[]> {
  const map = new Map<string, GlossaryItem[]>();
  for (const item of items) {
    for (const videoId of item.relatedVideoIds ?? []) {
      const existing = map.get(videoId);
      if (existing) {
        existing.push(item);
      } else {
        map.set(videoId, [item]);
      }
    }
  }
  return map;
}

/** DefinedTerm JSON-LD 1 件分 */
interface DefinedTermJsonLd {
  "@type": "DefinedTerm";
  name: string;
  description: string;
  inDefinedTermSet: string;
  url: string;
}

/**
 * DefinedTermSet/DefinedTerm の JSON-LD を組み立てる(#255)。
 * 「〇〇とは」系のロングテール検索での検索結果リッチリザルト表示を狙う構造化データ。
 * 各 DefinedTerm の url は同一ページ内アンカー(#term-<index>)を指す。
 */
export function buildDefinedTermSetJsonLd(
  items: readonly Pick<GlossaryItem, "term" | "definition">[],
  pageUrl: string,
) {
  const setId = `${pageUrl}#glossary`;
  return {
    "@type": "DefinedTermSet",
    "@id": setId,
    name: "IT・ガジェット用語集",
    url: pageUrl,
    hasDefinedTerm: items.map(
      (item, index): DefinedTermJsonLd => ({
        "@type": "DefinedTerm",
        name: item.term,
        description: item.definition,
        inDefinedTermSet: setId,
        url: `${pageUrl}#${glossaryTermAnchorId(index)}`,
      }),
    ),
  };
}

/** 用語 1 件分のページ内アンカー ID(見出しの id / DefinedTerm.url の両方で使う) */
export function glossaryTermAnchorId(index: number): string {
  return `term-${index}`;
}
