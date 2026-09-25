import { describe, expect, test } from "bun:test";
import { sortReactionRanking, type ReactionRankingCandidate } from "./reactionRanking";

const candidate = (id: string, publishedAt: string): ReactionRankingCandidate => ({
  id,
  title: id,
  publishedAt,
  isShort: false,
});

describe("sortReactionRanking", () => {
  test("リアクション数の多い順に並べる", () => {
    const result = sortReactionRanking(
      [candidate("new", "2026-09-02T00:00:00Z"), candidate("popular", "2026-09-01T00:00:00Z")],
      new Map([
        ["new", 2],
        ["popular", 10],
      ]),
      6,
    );
    expect(result.map((item) => item.id)).toEqual(["popular", "new"]);
  });

  test("同数なら公開日の新しい順に並べる", () => {
    const result = sortReactionRanking(
      [candidate("old", "2026-09-01T00:00:00Z"), candidate("new", "2026-09-02T00:00:00Z")],
      new Map(),
      6,
    );
    expect(result.map((item) => item.id)).toEqual(["new", "old"]);
  });

  test("未取得件数を0件として上限を守る", () => {
    const result = sortReactionRanking(
      [
        candidate("first", "2026-09-01T00:00:00Z"),
        candidate("second", "2026-09-02T00:00:00Z"),
      ],
      new Map([["first", 1]]),
      1,
    );
    expect(result.map((item) => item.id)).toEqual(["first"]);
  });
});
