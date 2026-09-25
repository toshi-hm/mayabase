export interface ReactionRankingCandidate {
  id: string;
  title: string;
  publishedAt: string;
  isShort: boolean | null;
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
