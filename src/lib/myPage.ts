/**
 * マイページ(#538)が扱う、localStorageの各機能を横断した動画候補データ。
 * `/mypage-cards.json`(ビルド時生成の静的JSON)から取得する。
 */
export interface MyPageVideoCandidate {
  id: string;
  title: string;
  publishedAt: string;
  isShort: boolean | null;
}

function isCandidate(value: unknown): value is MyPageVideoCandidate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<MyPageVideoCandidate>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.publishedAt === "string" &&
    (typeof candidate.isShort === "boolean" || candidate.isShort === null)
  );
}

/** `/mypage-cards.json` のレスポンスを検証する。不正な形式の要素は黙って除外する。 */
export function parseMyPageCandidates(data: unknown): MyPageVideoCandidate[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isCandidate);
}

/** 各セクションに表示するカード数の上限(#538)。無制限のDOM肥大化を防ぐ安全弁。 */
export const MY_PAGE_SECTION_DISPLAY_LIMIT = 24;

/**
 * 保存済み動画ID一覧(呼び出し側が意図した表示順で渡す)を候補データと突き合わせ、
 * 実際に存在する(削除・非公開等でなくなっていない)動画だけを表示上限件数まで選ぶ。
 */
export function selectMyPageCards(
  candidateById: ReadonlyMap<string, MyPageVideoCandidate>,
  ids: readonly string[],
  limit: number = MY_PAGE_SECTION_DISPLAY_LIMIT,
): MyPageVideoCandidate[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit は1以上の整数を指定してください: ${limit}`);
  }
  const result: MyPageVideoCandidate[] = [];
  for (const id of ids) {
    const candidate = candidateById.get(id);
    if (!candidate) continue;
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}
