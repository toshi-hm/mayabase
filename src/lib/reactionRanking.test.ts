import { describe, expect, test } from "bun:test";
import { type ReactionRankingCandidate, sortReactionRanking } from "./reactionRanking";

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

  test("同数(1件以上)なら公開日の新しい順に並べる", () => {
    const result = sortReactionRanking(
      [candidate("old", "2026-09-01T00:00:00Z"), candidate("new", "2026-09-02T00:00:00Z")],
      new Map([
        ["old", 3],
        ["new", 3],
      ]),
      6,
    );
    expect(result.map((item) => item.id)).toEqual(["new", "old"]);
  });

  test("上限を超える候補があれば上位のみに絞る", () => {
    const result = sortReactionRanking(
      [
        candidate("first", "2026-09-01T00:00:00Z"),
        candidate("second", "2026-09-02T00:00:00Z"),
        candidate("third", "2026-09-03T00:00:00Z"),
      ],
      new Map([
        ["first", 1],
        ["second", 2],
        ["third", 3],
      ]),
      2,
    );
    expect(result.map((item) => item.id)).toEqual(["third", "second"]);
  });

  test("反応が0件(未取得含む)の動画はランキングから除外する", () => {
    const result = sortReactionRanking(
      [candidate("zero", "2026-09-02T00:00:00Z"), candidate("hasReaction", "2026-09-01T00:00:00Z")],
      new Map([["hasReaction", 1]]),
      6,
    );
    expect(result.map((item) => item.id)).toEqual(["hasReaction"]);
  });

  test("全候補が0件なら空配列を返す(セクション自体を非表示にできる)", () => {
    const result = sortReactionRanking(
      [candidate("a", "2026-09-01T00:00:00Z"), candidate("b", "2026-09-02T00:00:00Z")],
      new Map(),
      6,
    );
    expect(result).toEqual([]);
  });
});
