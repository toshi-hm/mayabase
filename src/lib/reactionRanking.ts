export interface ReactionRankingCandidate {
  id: string;
  title: string;
  publishedAt: string;
  isShort: boolean | null;
}

/**
 * /reaction-ranking-candidates.json(ビルド時生成の静的JSON、#534)から取得した候補データを検証する。
 * 不正な形式の要素は黙って除外し、ランキング表示自体を壊さない。
 */
export function parseReactionRankingCandidates(data: unknown): ReactionRankingCandidate[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is ReactionRankingCandidate => {
    if (typeof item !== "object" || item === null) return false;
    const candidate = item as Partial<ReactionRankingCandidate>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.title === "string" &&
      typeof candidate.publishedAt === "string" &&
      (typeof candidate.isShort === "boolean" || candidate.isShort === null)
    );
  });
}

export function sortReactionRanking(
  candidates: readonly ReactionRankingCandidate[],
  reactionCounts: ReadonlyMap<string, number>,
  limit: number,
): ReactionRankingCandidate[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit は1以上の整数を指定してください: ${limit}`);
  }

  // 反応が0件の動画は「みんなが気になっている動画」として提示する根拠がないため、
  // 上限に達していなくても候補から除外する(公開日順のタイブレークで紛れ込んでいた)。
  return candidates
    .filter((candidate) => (reactionCounts.get(candidate.id) ?? 0) > 0)
    .sort((a, b) => {
      const countDifference = (reactionCounts.get(b.id) ?? 0) - (reactionCounts.get(a.id) ?? 0);
      if (countDifference !== 0) return countDifference;

      const publishedAtDifference = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      return Number.isNaN(publishedAtDifference) ? 0 : publishedAtDifference;
    })
    .slice(0, limit);
}
