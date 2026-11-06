import { toPageTitle, truncate } from "./format";

/** meta description の重複解消に必要な最小限の動画情報 */
export interface MetaDescriptionEntry {
  id: string;
  title: string;
  /** 既に整形・切り詰め済みの meta description 候補 */
  description: string;
}

/**
 * 動画ごとの meta description 候補のうち、他の動画と完全一致しているものだけ
 * 先頭に動画タイトルを付けて差別化する。
 * 同一スポンサーの案件動画などは概要欄の冒頭(提供表記・商品リンク)が同一になり、
 * 検索エンジンから重複 description と見なされやすいため(#609)。
 * 一意なものはそのまま返し、既存の挙動を変えない。
 */
export function dedupeMetaDescriptions(
  entries: MetaDescriptionEntry[],
  maxLength = 140,
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.description, (counts.get(entry.description) ?? 0) + 1);
  }
  return new Map(
    entries.map((entry) => [
      entry.id,
      (counts.get(entry.description) ?? 0) > 1
        ? truncate(`${toPageTitle(entry.title, 40)}｜${entry.description}`, maxLength)
        : entry.description,
    ]),
  );
}
